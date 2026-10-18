"use client";

import { useState, useTransition } from "react";
import { putStockOnJobAction } from "../actions";
import { formatEuro, formatEuroInput } from "@/lib/format";
import type { Unit } from "@/lib/money";
import { fmtQty } from "@/lib/placement";
import { UNIT_NAMES, parseValue } from "@/lib/placement-ui";
import { stockLeftLabel, takeFromStock, type StockUse } from "@/lib/stock";

export type UseItem = { id: string; name: string; qty: number | null; unit: Unit | null; valueCents: number };

const QUICK = [
  { label: "All", f: 1 },
  { label: "¾", f: 0.75 },
  { label: "½", f: 0.5 },
  { label: "¼", f: 0.25 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * "How much did you use?" for one stock item on one job: quick All/¾/½/¼, the unit/€ switch,
 * a typed amount with −/+, the live "Stays in stock" line and the orange action button.
 * Shared by the stock item sheet and the job's "Add material > From stock".
 */
export function UseStep({
  item,
  jobId,
  actionLabel,
  onUsed,
}: {
  item: UseItem;
  jobId: string;
  actionLabel: string;
  onUsed: (r: { usedLabel: string; usedUp: boolean }) => void;
}) {
  const known = item.qty !== null && item.unit !== null;
  const [euro, setEuro] = useState(false);
  const [text, setText] = useState(known ? fmtQty(item.qty!) : "");
  const [eurText, setEurText] = useState(formatEuroInput(item.valueCents));
  const [fraction, setFraction] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kind = euro ? "euro" : known ? "measure" : "part";
  const typed = kind === "part" ? fraction : parseValue(kind, kind === "euro" ? eurText : text);
  const use: StockUse | null =
    typed === null
      ? null
      : kind === "euro"
        ? { kind, cents: typed }
        : kind === "measure"
          ? { kind, amount: typed }
          : { kind, fraction: typed };
  const res = use ? takeFromStock(item, use) : null;

  function quickValue(f: number): number {
    if (kind === "euro") return Math.round(item.valueCents * f);
    if (kind === "measure") {
      if (f === 1) return item.qty!;
      return item.unit === "pcs" || item.unit === "boxes" ? Math.round(item.qty! * f) : round2(item.qty! * f);
    }
    return f;
  }
  function pickQuick(f: number) {
    const v = quickValue(f);
    if (kind === "euro") setEurText(formatEuroInput(v));
    else if (kind === "measure") setText(fmtQty(v));
    else setFraction(v);
  }

  function switchTo(toEuro: boolean) {
    if (toEuro === euro) return;
    if (toEuro && res?.ok) setEurText(formatEuroInput(res.cents));
    if (!toEuro && known && res?.ok && item.qty !== null && res.remainingQty !== null) {
      setText(fmtQty(round2(item.qty - res.remainingQty)));
    }
    setEuro(toEuro);
  }

  const step = kind === "euro" ? 100 : item.unit === "L" ? 0.25 : 1;
  function bump(dir: 1 | -1) {
    const cur = typed ?? 0;
    const next = Math.max(0, Math.round((cur + dir * step) * 1000) / 1000);
    if (kind === "euro") setEurText(formatEuroInput(next));
    else setText(fmtQty(next));
  }

  const left = known && !euro ? stockLeftLabel(item.qty, item.unit, item.qty) : null;
  const inStock = left ?? formatEuro(item.valueCents);
  let rest: string;
  let restBad = false;
  if (typed === null) {
    rest = `Type a number like ${kind === "euro" ? "12,50" : "2,5"}`;
    restBad = true;
  } else if (!res || !res.ok) {
    if (res && res.error === "too_much") {
      rest = `You only have ${inStock} in stock`;
      restBad = true;
    } else {
      rest = "Choose how much you use";
    }
  } else if (res.usedUp) {
    rest = "Nothing left in stock after this";
  } else {
    rest = `Stays in stock: ${res.remainingQty !== null && item.unit ? `${fmtQty(res.remainingQty)} ${item.unit} · ` : ""}${formatEuro(res.remainingCents)}`;
  }

  const unitOptions = [
    { euro: false, label: known ? (UNIT_NAMES[item.unit!] ?? "Amount") : "Part" },
    { euro: true, label: "€ Euros" },
  ];
  const showInput = known || euro;
  const equiv =
    euro && known && res?.ok && res.remainingQty !== null && item.qty !== null
      ? `= ${fmtQty(round2(item.qty - res.remainingQty))} ${item.unit}`
      : "";
  const label = res?.ok ? actionLabel : res && res.error === "too_much" ? "More than you have" : "Choose an amount";

  function submit() {
    if (!use || !res?.ok) return;
    setError(null);
    startTransition(async () => {
      const r = await putStockOnJobAction(item.id, jobId, use);
      if (r.ok) onUsed({ usedLabel: r.usedLabel, usedUp: r.usedUp });
      else setError(r.error);
    });
  }

  return (
    <div className="stack-10">
      <span className="field-label-plain">How much did you use?</span>
      <div className="segmented segmented-lg" role="group" aria-label="Use by">
        {unitOptions.map((o) => (
          <button key={o.label} type="button" aria-pressed={euro === o.euro} onClick={() => switchTo(o.euro)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="segmented segmented-lg" role="group" aria-label="Quick amount">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            aria-pressed={typed !== null && Math.abs(typed - quickValue(q.f)) < 1e-9}
            aria-label={q.label === "All" ? "All" : `${q.label} of it`}
            onClick={() => pickQuick(q.f)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {showInput ? (
        <>
          <div className="split-row-input">
            <button type="button" className="step-btn" aria-label="Less" onClick={() => bump(-1)}>
              −
            </button>
            <label className="input-group input-group-sm split-input">
              <span className="sr-only">Amount to use</span>
              <input
                type="text"
                inputMode="decimal"
                className="input-bare amount"
                value={kind === "euro" ? eurText : text}
                aria-invalid={typed === null || (res && !res.ok && res.error === "too_much") || undefined}
                onChange={(e) => (kind === "euro" ? setEurText(e.target.value) : setText(e.target.value))}
              />
              <span className="input-prefix amount">{euro ? "€" : item.unit}</span>
            </label>
            <button type="button" className="step-btn" aria-label="More" onClick={() => bump(1)}>
              +
            </button>
          </div>
          {equiv ? <span className="amount split-equiv">{equiv}</span> : null}
        </>
      ) : null}

      <div className="left-box">
        <div className="summary-row">
          <strong>On this job</strong>
          <span className="amount" data-testid="use-cents">
            {res?.ok ? formatEuro(res.cents) : formatEuro(0)}
          </span>
        </div>
        <span className={restBad ? "left-text-sm left-text-over" : "left-text-sm"} role={restBad ? "alert" : undefined} data-testid="rest-text">
          {rest}
        </span>
      </div>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-primary" disabled={!res?.ok || pending} onClick={submit}>
        {label}
      </button>
    </div>
  );
}
