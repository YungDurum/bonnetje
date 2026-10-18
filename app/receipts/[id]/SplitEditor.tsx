"use client";

import { useState } from "react";
import { formatEuro } from "@/lib/format";
import type { LeftoverMode } from "@/lib/money";
import { fmtQty, type LineChoice, type LineOutcome, type PlaceLine } from "@/lib/placement";
import {
  convertChoice,
  parseValue,
  rowEquivalent,
  stepFor,
  suffixFor,
  UNIT_NAMES,
  valueText,
  type Kind,
} from "@/lib/placement-ui";
import { Sheet } from "../../_components/Sheet";
import { CloseIcon } from "../../_components/icons";

export type EditorJob = { id: string; client: string; shortName: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The split editor bottom sheet. Edits the line's choice live; "Done" confirms it. */
export function SplitEditor({
  line,
  choice,
  outcome,
  jobs,
  onChange,
  onDone,
  onClose,
}: {
  line: PlaceLine;
  choice: LineChoice;
  outcome: LineOutcome;
  jobs: EditorJob[];
  onChange: (c: LineChoice) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  // What is typed in each row's input; null = show the stored value.
  const [texts, setTexts] = useState<(string | null)[]>([]);
  const { kind, rows } = choice;
  const jobOf = (id: string) => jobs.find((j) => j.id === id);
  const step = stepFor(line, kind);
  const over = outcome.status === "over";
  const known = line.measure !== null;
  const unitKinds: { kind: Kind; label: string }[] = [
    known ? { kind: "measure", label: UNIT_NAMES[line.unit ?? "pcs"] ?? "Pieces" } : { kind: "part", label: "Part" },
    { kind: "euro", label: "€ Euros" },
  ];

  const invalid = rows.some((_, k) => texts[k] != null && parseValue(kind, texts[k]!) === null);
  const anyUsed = rows.some((r) => r.value > 0);

  function setRows(next: LineChoice["rows"]) {
    setTexts([]);
    onChange({ ...choice, rows: next });
  }
  function setValue(k: number, value: number) {
    setRows(rows.map((r, x) => (x === k ? { ...r, value: Math.max(0, round3(value)) } : r)));
  }
  function type(k: number, text: string) {
    const v = parseValue(kind, text);
    setTexts((t) => {
      const n = t.slice();
      n[k] = text;
      return n;
    });
    if (v !== null) onChange({ ...choice, rows: rows.map((r, x) => (x === k ? { ...r, value: v } : r)) });
  }
  function blur(k: number) {
    setTexts((t) => {
      const n = t.slice();
      n[k] = null;
      return n;
    });
  }
  function addJob(id: string) {
    const full = kind === "measure" ? line.measure! : kind === "part" ? 1 : line.lineCents;
    setRows([...rows, { jobId: id, value: rows.length ? 0 : full }]);
  }

  const total = known
    ? `Total ${fmtQty(line.measure!)} ${line.unit} · ${formatEuro(line.lineCents)}`
    : `Total ${formatEuro(line.lineCents)} · amount not on the receipt`;
  const overText =
    kind === "measure"
      ? `${fmtQty(outcome.overBy)} ${line.unit}`
      : kind === "euro"
        ? formatEuro(outcome.overBy)
        : `${fmtQty(outcome.overBy)} part`;
  const hasLeft = !over && (outcome.leftoverCents > 0 || (outcome.leftoverQty ?? 0) > 0);
  const leftText = over
    ? `Too much: ${overText} over`
    : hasLeft
      ? `Left over: ${outcome.leftoverQty !== null ? `${fmtQty(outcome.leftoverQty)} ${line.unit} · ` : ""}${formatEuro(outcome.leftoverCents)}`
      : "Nothing left over";
  const options: { v: LeftoverMode; label: string }[] = [
    { v: "stock", label: "Stock" },
    ...(anyUsed ? [{ v: "client" as const, label: "Client keeps it" }] : []),
    { v: "waste", label: "Waste" },
  ];
  const free = jobs.filter((j) => !rows.some((r) => r.jobId === j.id));

  return (
    <Sheet label={line.name} onClose={onClose}>
      <div className="sheet-head">
        <div className="stack-2">
          <h2 className="sheet-title">{line.name}</h2>
          <span className="amount note">{total}</span>
        </div>
      </div>

      <div className="segmented segmented-lg" role="group" aria-label="Split by">
        {unitKinds.map((u) => (
          <button
            key={u.kind}
            type="button"
            aria-pressed={kind === u.kind}
            onClick={() => {
              setTexts([]);
              onChange(convertChoice(line, outcome, choice, u.kind));
            }}
          >
            {u.label}
          </button>
        ))}
      </div>

      {rows.map((r, k) => {
        const job = jobOf(r.jobId);
        const client = job?.client ?? "job";
        const text = texts[k];
        const bad = text != null && parseValue(kind, text) === null;
        return (
          <div key={r.jobId} className="split-row">
            <div className="split-row-head">
              <span className="split-client">{client}</span>
              <span className="amount split-equiv" data-testid={`equiv-${k}`}>
                {rowEquivalent(line, choice, outcome, k)}
              </span>
              <button type="button" className="icon-btn" aria-label={`Remove ${client}`} onClick={() => setRows(rows.filter((_, x) => x !== k))}>
                <CloseIcon />
              </button>
            </div>
            <div className="split-row-input">
              <button type="button" className="step-btn" aria-label={`Less ${client}`} onClick={() => setValue(k, r.value - step)}>
                −
              </button>
              <label className="input-group input-group-sm split-input">
                <span className="sr-only">{kind === "euro" ? `Euros for ${client}` : `Amount for ${client}`}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-bare amount"
                  value={text ?? valueText(kind, r.value)}
                  aria-invalid={bad || undefined}
                  onChange={(e) => type(k, e.target.value)}
                  onBlur={() => blur(k)}
                />
                <span className="input-prefix amount">{suffixFor(line, kind)}</span>
              </label>
              <button type="button" className="step-btn" aria-label={`More ${client}`} onClick={() => setValue(k, r.value + step)}>
                +
              </button>
            </div>
            {bad ? (
              <span className="error-text" role="alert">
                Type a number like {kind === "euro" ? "12,50" : "2,5"}.
              </span>
            ) : null}
          </div>
        );
      })}

      {free.length ? (
        <div className="stack-8">
          <span className="chip-title">{rows.length ? "Add another job" : "Put it on a job"}</span>
          <div className="chips">
            {free.map((j) => (
              <button key={j.id} type="button" className="chip" onClick={() => addJob(j.id)}>
                + {j.shortName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="left-box">
        <span className={over ? "left-text left-text-over" : "left-text"} role={over ? "alert" : undefined} data-testid="left-text">
          {leftText}
        </span>
        {hasLeft ? (
          <div className="segmented segmented-lg" role="group" aria-label="Left over goes to">
            {options.map((o) => (
              <button key={o.v} type="button" aria-pressed={outcome.leftover === o.v} onClick={() => onChange({ ...choice, leftover: o.v })}>
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sheet-foot">
        <button type="button" className="btn btn-primary" disabled={over || invalid} onClick={onDone}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
