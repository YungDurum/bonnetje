// "Where did it go?": turn per-line choices into what gets saved — material entries
// per job, stock items for leftovers and what is not billed. Pure, no I/O.
// All amounts come from lib/money.ts, so every line adds up exactly.
import { formatEuro } from "./format";
import { placeLine, splitLine, splitLineEuros, type Cents, type LeftoverMode, type SplitResult, type Unit, type VatRate } from "./money";

export type PlaceLine = {
  id: string;
  name: string;
  lineCents: Cents;
  /** Total measure on the receipt (100 m); null when the receipt doesn't say. */
  measure: number | null;
  unit: Unit | null;
  vatRate: VatRate;
};

/**
 * How one line is split. `kind`:
 * - "measure": row values are amounts in the line's unit (needs a known measure)
 * - "part": row values are fractions of the line, 0..1 (when the measure is unknown)
 * - "euro": row values are cents
 */
export type LineChoice = {
  kind: "measure" | "part" | "euro";
  rows: { jobId: string; value: number }[];
  leftover: LeftoverMode;
  /** The user confirmed this line ("Done" in the split editor). Until then it is still to place. */
  placed: boolean;
};

export type LineStatus = "todo" | "placed" | "over";

export type LineOutcome = {
  lineId: string;
  status: LineStatus;
  /** Cents per row (same order as the choice's rows), incl. the leftover when the client keeps it. */
  rowCents: Cents[];
  leftoverCents: Cents;
  /** Leftover in the line's unit; null when unknown (split by part or euros). */
  leftoverQty: number | null;
  leftover: LeftoverMode;
  /** For the red "Too much" state, in the choice's terms (unit, fraction or cents). */
  overBy: number;
  /** e.g. "30 m → de Vries · 70 m → stock" is built by the UI from these. */
  stockCents: Cents;
  wasteCents: Cents;
};

export type EntryLine = { lineId: string; name: string; detail: string; cents: Cents; vatRate: VatRate };
export type JobEntry = { jobId: string; cents: Cents; items: number; partly: number; lines: EntryLine[] };
export type NewStockItem = {
  lineId: string;
  name: string;
  qty: number | null;
  unit: Unit | null;
  originalQty: number | null;
  valueCents: Cents;
  vatRate: VatRate;
};
export type NewAllocation = {
  lineId: string;
  jobId: string;
  position: number;
  kind: LineChoice["kind"];
  amount: number | null;
  cents: Cents;
};

export type Placement = {
  lines: LineOutcome[];
  stillToPlace: number;
  tooMuch: number;
  canSave: boolean;
  /** In the order jobs first appear on the receipt. */
  jobs: JobEntry[];
  stock: NewStockItem[];
  allocations: NewAllocation[];
  stockCents: Cents;
  wasteCents: Cents;
  totalCents: Cents;
};

const FRACTIONS: Record<number, string> = { 250: "¼", 500: "½", 750: "¾" };

/** 2.5 → "2.5", 0.333 → "0.33": at most 2 decimals, like the prototype. */
export function fmtQty(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function partLabel(fraction: number): string {
  const milli = Math.round(fraction * 1000);
  return FRACTIONS[milli] ?? `${Math.round(fraction * 100)}%`;
}

export function emptyChoice(line: PlaceLine): LineChoice {
  return { kind: line.measure === null ? "part" : "measure", rows: [], leftover: "stock", placed: false };
}

/** Everything on one job, the whole line. */
export function wholeLineChoice(line: PlaceLine, jobId: string): LineChoice {
  return line.measure === null
    ? { kind: "part", rows: [{ jobId, value: 1 }], leftover: "stock", placed: true }
    : { kind: "measure", rows: [{ jobId, value: line.measure }], leftover: "stock", placed: true };
}

function split(line: PlaceLine, c: LineChoice): SplitResult {
  if (c.kind === "euro") {
    return splitLineEuros(line.lineCents, c.rows.map((r) => ({ jobId: r.jobId, cents: r.value })));
  }
  if (c.kind === "measure" && line.measure === null) {
    throw new Error(`"${line.name}" has no measure on the receipt; split it by part or by euros`);
  }
  const total = c.kind === "measure" ? line.measure! : 1;
  return splitLine(line.lineCents, total, c.rows.map((r) => ({ jobId: r.jobId, amount: r.value })));
}

function rowDetail(line: PlaceLine, c: LineChoice, value: number, cents: Cents): string {
  if (c.kind === "measure") {
    return value < line.measure! ? `${fmtQty(value)} of ${fmtQty(line.measure!)} ${line.unit}` : "";
  }
  if (c.kind === "part") return value < 1 ? `${partLabel(value)} of it` : "";
  return cents < line.lineCents ? `${formatEuro(cents)} of ${formatEuro(line.lineCents)}` : "";
}

export function computePlacement(lines: PlaceLine[], choices: LineChoice[]): Placement {
  if (choices.length !== lines.length) throw new Error("one choice per line");
  const jobs = new Map<string, JobEntry>();
  const out: Placement = {
    lines: [],
    stillToPlace: 0,
    tooMuch: 0,
    canSave: false,
    jobs: [],
    stock: [],
    allocations: [],
    stockCents: 0,
    wasteCents: 0,
    totalCents: 0,
  };

  lines.forEach((line, i) => {
    const c = choices[i];
    out.totalCents += line.lineCents;
    const s = split(line, c);

    if (!s.ok) {
      out.tooMuch++;
      if (!c.placed) out.stillToPlace++;
      out.lines.push({
        lineId: line.id, status: "over", rowCents: [], leftoverCents: 0, leftoverQty: null,
        leftover: c.leftover, overBy: s.overBy, stockCents: 0, wasteCents: 0,
      });
      return;
    }

    const placed = placeLine(s, c.leftover);
    const rowCents = s.parts.map((p) => p.cents);
    const first = rowCents.findIndex((x) => x > 0);
    if (placed.leftover === "client" && first >= 0) rowCents[first] += s.leftoverCents;

    // Leftover quantity is only known when split by the line's own unit, or when nothing was used.
    const nothingUsed = c.rows.every((r) => r.value === 0);
    const leftoverQty =
      line.measure === null ? null : c.kind === "measure" ? s.leftoverAmount : nothingUsed ? line.measure : null;

    out.lines.push({
      lineId: line.id,
      status: c.placed ? "placed" : "todo",
      rowCents,
      leftoverCents: s.leftoverCents,
      leftoverQty,
      leftover: placed.leftover,
      overBy: 0,
      stockCents: placed.stockCents,
      wasteCents: placed.wasteCents,
    });
    if (!c.placed) {
      out.stillToPlace++;
      return;
    }

    // Only confirmed lines go into the totals that will be saved.
    out.stockCents += placed.stockCents;
    out.wasteCents += placed.wasteCents;
    c.rows.forEach((r, k) => {
      const cents = rowCents[k];
      if (r.value <= 0 && cents === 0) return; // an empty row is not an allocation
      out.allocations.push({
        lineId: line.id, jobId: r.jobId, position: k + 1, kind: c.kind,
        amount: c.kind === "euro" ? null : r.value, cents: s.parts[k].cents,
      });
      const j = jobs.get(r.jobId) ?? { jobId: r.jobId, cents: 0, items: 0, partly: 0, lines: [] };
      const detail = rowDetail(line, c, r.value, s.parts[k].cents);
      j.cents += cents;
      j.items++;
      if (detail) j.partly++;
      j.lines.push({ lineId: line.id, name: line.name, detail, cents, vatRate: line.vatRate });
      jobs.set(r.jobId, j);
    });
    if (placed.stockCents > 0) {
      out.stock.push({
        lineId: line.id,
        name: line.name,
        qty: leftoverQty,
        unit: leftoverQty === null ? null : line.unit,
        originalQty: leftoverQty === null ? null : line.measure,
        valueCents: placed.stockCents,
        vatRate: line.vatRate,
      });
    }
  });

  out.jobs = [...jobs.values()];
  out.canSave = lines.length > 0 && out.stillToPlace === 0 && out.tooMuch === 0;
  return out;
}

/** "3 items, 1 partly" — the entry's sub line on the job page. */
export function entryDetail(j: Pick<JobEntry, "items" | "partly">): string {
  return `${j.items} ${j.items === 1 ? "item" : "items"}${j.partly ? `, ${j.partly} partly` : ""}`;
}
