"use client";

import { useState, useTransition } from "react";
import { formatEuro, formatEuroInput, parseEuroInput } from "@/lib/format";
import { Sheet } from "../../_components/Sheet";
import { CheckIcon, CloseIcon, PlusIcon } from "../../_components/icons";
import { checkReceiptAction } from "./actions";

type Line = { id: string; name: string; short: string; lineCents: number };
type Row = { key: string; id?: string; short?: string; name: string; amount: string };

type Props = {
  receiptId: string;
  totalCents: number;
  lines: Line[];
  file: { url: string; isPdf: boolean } | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * "Check receipt": the lines read from the receipt don't add up to its total. Show the
 * original next to the lines so the user can fix a misread amount, add a line the photo
 * didn't show, or correct the total. It can be saved once everything adds up.
 */
export function CheckReceipt({ receiptId, totalCents, lines, file, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    lines.map((l) => ({ key: l.id, id: l.id, short: l.short, name: l.name, amount: formatEuroInput(l.lineCents) })),
  );
  const [total, setTotal] = useState(formatEuroInput(totalCents));
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  const cents = rows.map((r) => parseEuroInput(r.amount));
  const totalValue = parseEuroInput(total);
  const sum = cents.reduce<number>((a, c) => a + (c ?? 0), 0);
  const allValid = rows.length > 0 && cents.every((c) => c !== null) && rows.every((r) => r.name.trim()) && totalValue !== null;
  const matches = allValid && sum === totalValue;
  const diff = totalValue === null ? null : totalValue - sum;

  const update = (k: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === k ? { ...r, ...patch } : r)));

  function addLine() {
    setRows([...rows, { key: `new-${nextKey}`, name: "", amount: diff && diff > 0 ? formatEuroInput(diff) : "" }]);
    setNextKey(nextKey + 1);
  }

  function save() {
    if (!matches || totalValue === null) return;
    setError("");
    startSaving(async () => {
      const res = await checkReceiptAction(receiptId, {
        totalCents: totalValue,
        lines: rows.map((r, i) => ({ id: r.id, name: r.name.trim(), lineCents: cents[i]! })),
      });
      if (!res.ok) setError(res.error);
      else onSaved();
    });
  }

  return (
    <Sheet label="Check receipt" onClose={onClose}>
      <div className="sheet-head">
        <h2 className="sheet-title">Check receipt</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon size={20} />
        </button>
      </div>
      <p className="note">
        The items read from this receipt don&apos;t add up to its total. Compare them with the receipt and fix what was read wrong,
        or add an item that was missed.
      </p>

      {file ? (
        file.isPdf ? (
          <a className="btn btn-outline" href={file.url} target="_blank" rel="noreferrer">
            Open the PDF
          </a>
        ) : (
          <a className="check-photo" href={file.url} target="_blank" rel="noreferrer" aria-label="Open the photo full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- private file from our own route */}
            <img src={file.url} alt="The receipt photo" />
          </a>
        )
      ) : null}

      <section className="stack-10" aria-label="Items">
        {rows.map((r, k) => {
          const bad = cents[k] === null;
          const label = r.name.trim() || `item ${k + 1}`;
          return (
            <div key={r.key} className="check-row">
              <div className="check-row-fields">
                <label className="check-name">
                  <span className="sr-only">Name of item {k + 1}</span>
                  <input
                    type="text"
                    className="input"
                    value={r.name}
                    placeholder="What was it?"
                    aria-invalid={!r.name.trim() || undefined}
                    onChange={(e) => update(k, { name: e.target.value })}
                  />
                </label>
                <label className="input-group check-amount">
                  <span className="amount input-prefix">€</span>
                  <span className="sr-only">Amount of item {k + 1}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-bare amount"
                    value={r.amount}
                    aria-invalid={bad || undefined}
                    onChange={(e) => update(k, { amount: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${label}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== k))}
                >
                  <CloseIcon />
                </button>
              </div>
              {r.short ? <span className="amount note">{r.short}</span> : null}
              {bad ? (
                <span className="error-text" role="alert">
                  Type an amount like 12,95.
                </span>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="text-btn" onClick={addLine}>
          <PlusIcon /> Add a missed item
        </button>
      </section>

      <label className="rate-row check-total">
        <span className="field-label">Receipt total</span>
        <span className="input-group check-amount">
          <span className="amount input-prefix">€</span>
          <input
            type="text"
            inputMode="decimal"
            className="input-bare amount"
            value={total}
            aria-invalid={totalValue === null || undefined}
            onChange={(e) => setTotal(e.target.value)}
          />
        </span>
      </label>

      <div className="sheet-foot stack-10">
        <p className={matches ? "adds-up adds-up-ok" : "adds-up adds-up-off"} role="status" data-testid="adds-up">
          {matches ? <CheckIcon size={16} /> : null}
          <span>
            Items add up to <span className="amount">{formatEuro(sum)}</span> · receipt says{" "}
            <span className="amount">{totalValue === null ? "?" : formatEuro(totalValue)}</span>
          </span>
        </p>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={!matches || saving} onClick={save}>
          {saving ? "Saving…" : matches ? "Save changes" : "Items don't add up yet"}
        </button>
      </div>
    </Sheet>
  );
}
