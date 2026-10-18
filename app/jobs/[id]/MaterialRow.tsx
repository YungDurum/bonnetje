"use client";

import { useState } from "react";
import { ChevronDown } from "../../_components/icons";

export type RowData = {
  id: string;
  title: string;
  sub: string;
  amount: string;
  isNew: boolean;
  lines: { name: string; detail: string; amount: string }[];
};

/** One material entry. Receipts with item lines fold open to show them. */
export function MaterialRow({ row, expandable }: { row: RowData; expandable: boolean }) {
  const [open, setOpen] = useState(false);
  const head = (
    <>
      <span className={row.isNew ? "dot dot-new" : "dot"} aria-hidden="true" />
      <span className="row-text">
        <span className="row-title">{row.title}</span>
        <span className="row-sub">{row.sub}</span>
      </span>
      <span className="amount row-amount">{row.amount}</span>
      {expandable ? (
        <span className={open ? "chev chev-open" : "chev"}>
          <ChevronDown />
        </span>
      ) : null}
    </>
  );
  return (
    <div className="row">
      {expandable ? (
        <button type="button" className="row-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          {head}
        </button>
      ) : (
        <div className="row-head">{head}</div>
      )}
      {open ? (
        <ul className="row-lines">
          {row.lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.name}
                {l.detail ? <span className="row-line-detail"> · {l.detail}</span> : null}
              </span>
              <span className="amount">{l.amount}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {row.isNew ? <span className="sr-only">New today</span> : null}
    </div>
  );
}
