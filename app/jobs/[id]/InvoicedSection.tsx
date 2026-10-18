"use client";

import { useState } from "react";
import type { RowData } from "./MaterialRow";

export function InvoicedSection({ rows }: { rows: RowData[] }) {
  const [show, setShow] = useState(false);
  return (
    <section className="stack-8">
      <button type="button" className="toggle-btn" aria-expanded={show} onClick={() => setShow(!show)}>
        <span className="toggle-title">Already invoiced ({rows.length})</span>
        <span className="toggle-state">{show ? "Hide" : "Show"}</span>
      </button>
      {show ? (
        <div className="list list-billed">
          {rows.map((r) => (
            <div key={r.id} className="row-billed">
              <span className="row-text">
                <span className="row-title-sm">{r.title}</span>
                <span className="row-sub-sm">{r.sub}</span>
              </span>
              <span className="amount">{r.amount}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
