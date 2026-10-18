"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeStockAction } from "../actions";
import { Sheet } from "../_components/Sheet";
import { ChevronRight, TrashIcon } from "../_components/icons";
import { formatEuro } from "@/lib/format";
import type { Unit } from "@/lib/money";
import { stockLeftLabel } from "@/lib/stock";
import { UseStep } from "./UseStep";

export type StockRowData = {
  id: string;
  name: string;
  qty: number | null;
  unit: Unit | null;
  originalQty: number | null;
  valueCents: number;
  origin: string;
};
export type StockJob = { id: string; client: string; shortName: string };

export function leftText(i: StockRowData): string | null {
  return stockLeftLabel(i.qty, i.unit, i.originalQty);
}

/** The stock list and the stock item sheet it opens. `q` is kept in the URL when a toast is shown. */
export function StockList({ items, jobs, q }: { items: StockRowData[]; jobs: StockJob[]; q: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();
  const item = items.find((i) => i.id === openId) ?? null;

  function done(message: string) {
    setOpenId(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("saved", message);
    router.replace(`/stock?${params}`, { scroll: false });
  }

  return (
    <>
      <div className="list">
        {items.map((i) => {
          const left = leftText(i);
          return (
            <button key={i.id} type="button" className="stock-row" onClick={() => setOpenId(i.id)}>
              <span className="row-text">
                <span className="row-title">{i.name}</span>
                <span className="row-sub">{left ? `${left} left · ${i.origin}` : i.origin}</span>
              </span>
              <span className="amount row-amount">{formatEuro(i.valueCents)}</span>
              <span className="chev">
                <ChevronRight />
              </span>
            </button>
          );
        })}
        {items.length === 0 ? (
          <div className="list-empty">{q ? "Nothing matches your search." : "Nothing in stock right now."}</div>
        ) : null}
      </div>
      {item ? <ItemSheet key={item.id} item={item} jobs={jobs} onClose={() => setOpenId(null)} onDone={done} /> : null}
    </>
  );
}

function ItemSheet({
  item,
  jobs,
  onClose,
  onDone,
}: {
  item: StockRowData;
  jobs: StockJob[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const job = jobs.find((j) => j.id === jobId) ?? null;
  const left = leftText(item);

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await removeStockAction(item.id);
      if (r.ok) onDone(`${item.name} removed from stock`);
      else setError(r.error);
    });
  }

  return (
    <Sheet label="Stock item" onClose={onClose}>
      <div className="stack-2">
        <h2 className="sheet-title">{item.name}</h2>
        <span className="sheet-sub">
          {left ? `${left} left · ` : ""}
          {formatEuro(item.valueCents)} · from {item.origin}
        </span>
      </div>

      <div className="stack-8">
        <span className="chip-title">USE ON A JOB</span>
        <div className="chips">
          {jobs.map((j) => (
            <button key={j.id} type="button" className="chip chip-pick" aria-pressed={jobId === j.id} onClick={() => setJobId(j.id)}>
              {j.shortName}
            </button>
          ))}
        </div>
      </div>

      {job ? (
        <UseStep
          key={job.id}
          item={item}
          jobId={job.id}
          actionLabel={`Put on ${job.client}`}
          onUsed={(r) => onDone(`${item.name} (${r.usedLabel}) put on ${job.client}`)}
        />
      ) : null}

      <div className="sheet-divider">
        {asking ? (
          <div className="confirm-box">
            <p className="confirm-text">
              Remove from stock? Used up or thrown away. It is not billed, and stays in your bookkeeping as a cost.
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline" onClick={() => setAsking(false)}>
                Keep
              </button>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={remove}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-danger-outline" onClick={() => setAsking(true)}>
            <TrashIcon />
            Remove from stock
          </button>
        )}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
