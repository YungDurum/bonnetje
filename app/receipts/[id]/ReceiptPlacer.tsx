"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReceiptAction } from "@/app/actions";
import { formatEuro } from "@/lib/format";
import { computePlacement, emptyChoice, wholeLineChoice, type LineChoice, type PlaceLine } from "@/lib/placement";
import { qtyLabel, summaryText } from "@/lib/placement-ui";
import { Sheet } from "../../_components/Sheet";
import { CheckIcon, ChevronRight, ListIcon } from "../../_components/icons";
import { CheckReceipt } from "./CheckReceipt";
import { SplitEditor, type EditorJob } from "./SplitEditor";

type Line = PlaceLine & { short: string; qty: number; unitPriceCents: number };
type Props = {
  receipt: { id: string; totalCents: number; needsReview: boolean; lines: Line[]; file: { url: string; isPdf: boolean } | null };
  jobs: (EditorJob & { title: string })[];
};

export function ReceiptPlacer({ receipt, jobs }: Props) {
  const { lines } = receipt;
  const [choices, setChoices] = useState<LineChoice[]>(() => lines.map(emptyChoice));
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  const placement = useMemo(() => computePlacement(lines, choices), [lines, choices]);
  const clientOf = (id: string) => jobs.find((j) => j.id === id)?.client ?? "job";
  const shortOf = (id: string) => jobs.find((j) => j.id === id)?.shortName ?? "job";

  const rows = lines.map((line, i) => ({ line, i, o: placement.lines[i] }));
  const todo = rows.filter((r) => r.o.status !== "placed");
  const done = rows.filter((r) => r.o.status === "placed");
  const blocked = receipt.needsReview;
  const canSave = placement.canSave && !blocked;

  function putAllOn(jobId: string) {
    setChoices(lines.map((l) => wholeLineChoice(l, jobId)));
    setAllOpen(false);
  }
  const allOn = (jobId: string) =>
    choices.every((c, i) => {
      const w = wholeLineChoice(lines[i], jobId);
      return c.placed && c.kind === w.kind && c.rows.length === 1 && c.rows[0].jobId === jobId && c.rows[0].value === w.rows[0].value;
    });

  function save() {
    setError("");
    startSaving(async () => {
      const res = await saveReceiptAction(receipt.id, choices);
      if (res && !res.ok) setError(res.error);
    });
  }

  const summary = [
    ...placement.jobs.map((j) => ({ label: `To ${clientOf(j.jobId)}`, cents: j.cents })),
    ...(placement.stockCents > 0 ? [{ label: "Into stock", cents: placement.stockCents }] : []),
    ...(placement.wasteCents > 0 ? [{ label: "Not billed (waste)", cents: placement.wasteCents }] : []),
  ];
  const notReady = placement.tooMuch
    ? "Fix items with too much assigned"
    : placement.stillToPlace === 1
      ? "1 item still needs a place"
      : `${placement.stillToPlace} items still need a place`;

  const editing = editIdx !== null ? rows[editIdx] : null;

  return (
    <>
      <div className="screen-body">
        {blocked ? (
          <div className="notice-error stack-10" role="alert">
            <p className="notice-text">
              <strong>Check this receipt first.</strong> The items don&apos;t add up to the total of{" "}
              {formatEuro(receipt.totalCents)}, so it can&apos;t be saved yet.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCheckOpen(true)}>
              Check receipt
            </button>
          </div>
        ) : null}

        <button type="button" className="all-btn" onClick={() => setAllOpen(true)}>
          <span className="all-btn-text">
            <ListIcon />
            Put everything on one job
          </span>
          <ChevronRight size={18} />
        </button>

        {todo.length ? (
          <section className="stack-10" aria-label="Still to place">
            <h2 className="section-title section-title-strong">Still to place · {todo.length}</h2>
            {todo.map(({ line, i, o }) => {
              const over = o.status === "over";
              return (
                <button key={line.id} type="button" className={over ? "todo-tile todo-tile-over" : "todo-tile"} onClick={() => setEditIdx(i)}>
                  <span className="todo-top">
                    <span className="todo-name">{line.name}</span>
                    <span className="amount todo-price">{formatEuro(line.lineCents)}</span>
                  </span>
                  <span className="amount todo-sub">
                    {lines[i].short} · {qtyLabel(lines[i])}
                  </span>
                  <span className={over ? "pill pill-over" : "pill"}>{over ? "Too much assigned, fix it" : "Choose where it goes"}</span>
                </button>
              );
            })}
          </section>
        ) : null}

        {done.length ? (
          <section className="stack-8" aria-label="Placed">
            <h2 className="section-title">Placed · {done.length}</h2>
            <div className="list">
              {done.map(({ line, i, o }) => (
                <button key={line.id} type="button" className="row-head placed-row" onClick={() => setEditIdx(i)}>
                  <span className="placed-check">
                    <CheckIcon size={18} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{line.name}</span>
                    <span className="row-sub">{summaryText(line, choices[i], o, shortOf)}</span>
                  </span>
                  <span className="amount row-amount">{formatEuro(line.lineCents)}</span>
                  <span className="chev">
                    <ChevronRight />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <p className="note">
          The full receipt ({formatEuro(receipt.totalCents)} incl. VAT) is kept as a business cost. Only what you put on a job is billed
          to a client.
        </p>
      </div>

      <div className="bottom-bar bottom-bar-sticky">
        {summary.length ? (
          <div className="summary" aria-label="Summary">
            {summary.map((s) => (
              <div key={s.label} className="summary-row">
                <span>{s.label}</span>
                <span className="amount">{formatEuro(s.cents)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        {canSave ? (
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save receipt"}
          </button>
        ) : (
          <button type="button" className="btn btn-disabled" disabled>
            {blocked ? "Check this receipt first" : notReady}
          </button>
        )}
      </div>

      {allOpen ? (
        <Sheet label="Put everything on one job" onClose={() => setAllOpen(false)}>
          <h2 className="sheet-title">Put everything on…</h2>
          <div className="list">
            {jobs.map((j) => (
              <button key={j.id} type="button" className="row-head pick-row" aria-pressed={allOn(j.id)} onClick={() => putAllOn(j.id)}>
                <span className="row-text">
                  <span className="job-client">{j.client}</span>
                  <span className="row-sub">{j.title}</span>
                </span>
                {allOn(j.id) ? (
                  <span className="placed-check">
                    <CheckIcon size={20} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="note">You can still change single items afterwards.</p>
        </Sheet>
      ) : null}

      {checkOpen ? (
        <CheckReceipt
          receiptId={receipt.id}
          totalCents={receipt.totalCents}
          lines={lines}
          file={receipt.file}
          onClose={() => setCheckOpen(false)}
          onSaved={() => {
            setCheckOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {editing ? (
        <SplitEditor
          key={editing.line.id}
          line={editing.line}
          choice={choices[editing.i]}
          outcome={editing.o}
          jobs={jobs}
          onChange={(c) => setChoices((cs) => cs.map((x, k) => (k === editing.i ? c : x)))}
          onDone={() => {
            setChoices((cs) => cs.map((x, k) => (k === editing.i ? { ...x, placed: true } : x)));
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
        />
      ) : null}
    </>
  );
}
