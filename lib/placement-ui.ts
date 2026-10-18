// Display and conversion helpers for the "Where did it go?" screen and the split editor.
// No money maths here: amounts come from computePlacement / lib/money.ts. The only
// arithmetic is converting a typed amount between units for display (see convertChoice).
import { formatEuro, parseEuroInput } from "./format";
import { splitLine, type LeftoverMode } from "./money";
import { fmtQty, type LineChoice, type LineOutcome, type PlaceLine } from "./placement";

export type Kind = LineChoice["kind"];

const FRACTIONS: Record<number, string> = { 250: "¼", 500: "½", 750: "¾" };

/** 0.75 -> "¾", 1 -> "All", 0.1 -> "10%". */
export function partLabel(fraction: number): string {
  if (Math.round(fraction * 1000) === 1000) return "All";
  const milli = Math.round(fraction * 1000);
  return FRACTIONS[milli] ?? `${fmtQty(fraction * 100)}%`;
}

export const UNIT_NAMES: Record<string, string> = {
  pcs: "Pieces",
  m: "Metres",
  L: "Litres",
  kg: "Kilos",
  boxes: "Boxes",
};

/** Step of the − / + buttons: 1 for pcs/boxes/m/kg, 0.25 for litres and parts, €1 for euros. */
export function stepFor(line: PlaceLine, kind: Kind): number {
  if (kind === "euro") return 100;
  if (kind === "part") return 0.25;
  return line.unit === "L" ? 0.25 : 1;
}

/** Text of a row's input for a value. */
export function valueText(kind: Kind, value: number): string {
  return kind === "euro" ? formatEuro(value).slice(1) : fmtQty(value);
}

/** What the person typed ("2,5", "30", "") -> a value, or null when it isn't a number. Empty is 0. */
export function parseValue(kind: Kind, text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  if (kind === "euro") return parseEuroInput(t);
  const m = /^(\d{1,7})(?:[.,](\d{1,3}))?$/.exec(t);
  return m ? Number(`${m[1]}.${m[2] ?? "0"}`) : null;
}

export function suffixFor(line: PlaceLine, kind: Kind): string {
  return kind === "euro" ? "€" : kind === "part" ? "part" : (line.unit ?? "");
}

/** Cents of one row on its own (a client-kept leftover is not part of it). null when not known (too much). */
export function ownRowCents(outcome: LineOutcome, k: number): number | null {
  if (outcome.status === "over") return null;
  const first = outcome.rowCents.findIndex((c) => c > 0);
  const c = outcome.rowCents[k];
  if (c === undefined) return null;
  return outcome.leftover === "client" && k === first ? c - outcome.leftoverCents : c;
}

/** "= €26.70" for amounts, "= 30 m" for euros; "" when it can't be told (e.g. too much on that row). */
export function rowEquivalent(line: PlaceLine, choice: LineChoice, outcome: LineOutcome, k: number): string {
  const row = choice.rows[k];
  if (!row) return "";
  if (choice.kind === "euro") {
    if (line.lineCents <= 0) return "";
    if (line.measure !== null) return `= ${fmtQty((row.value * line.measure) / line.lineCents)} ${line.unit}`;
    return `= ${partLabel(row.value / line.lineCents)} of it`;
  }
  let cents = ownRowCents(outcome, k);
  if (cents === null) {
    const total = choice.kind === "measure" ? line.measure! : 1;
    const s = splitLine(line.lineCents, total, [{ jobId: row.jobId, amount: row.value }]);
    cents = s.ok ? s.parts[0].cents : null;
  }
  return cents === null ? "" : `= ${formatEuro(cents)}`;
}

/**
 * Switch the editor's unit. Rows keep what they are worth: each row's euros (as saved by
 * computePlacement) are re-expressed in the new unit, rounded to 2 decimals and trimmed
 * so the rows never add up to more than the line. When the line is over-assigned the
 * values are cleared (0), because their worth isn't defined.
 */
export function convertChoice(line: PlaceLine, outcome: LineOutcome, choice: LineChoice, to: Kind): LineChoice {
  if (to === choice.kind) return choice;
  const euros = choice.rows.map((_, k) => ownRowCents(outcome, k) ?? 0);
  if (to === "euro") {
    return { ...choice, kind: to, rows: choice.rows.map((r, k) => ({ ...r, value: euros[k] })) };
  }
  const total = to === "measure" ? line.measure! : 1;
  const totalHundredths = Math.round(total * 100);
  let used = 0;
  const rows = choice.rows.map((r, k) => {
    let h = line.lineCents > 0 ? Math.round((euros[k] * totalHundredths) / line.lineCents) : 0;
    h = Math.min(h, Math.max(0, totalHundredths - used));
    used += h;
    return { ...r, value: h / 100 };
  });
  return { ...choice, kind: to, rows };
}

const LEFT_LABEL: Record<LeftoverMode, string> = { stock: "stock", client: "client keeps it", waste: "waste" };

/** "30 m → de Vries · 70 m → stock", like the prototype's `parts`. */
export function summaryText(
  line: PlaceLine,
  choice: LineChoice,
  outcome: LineOutcome,
  shortOf: (jobId: string) => string,
): string {
  const parts: string[] = [];
  for (const r of choice.rows) {
    if (!(r.value > 0)) continue;
    const what =
      choice.kind === "measure" ? `${fmtQty(r.value)} ${line.unit}` : choice.kind === "part" ? partLabel(r.value) : formatEuro(r.value);
    parts.push(`${what} → ${shortOf(r.jobId)}`);
  }
  const label = LEFT_LABEL[outcome.leftover];
  if (outcome.leftoverQty !== null && outcome.leftoverQty > 0) {
    parts.push(`${fmtQty(outcome.leftoverQty)} ${line.unit} → ${label}`);
  } else if (outcome.leftoverCents > 0) {
    parts.push(`${formatEuro(outcome.leftoverCents)} → ${label}`);
  }
  return parts.join(" · ");
}

/** Label under an item name: "2 × €6.45" or "100 m". */
export function qtyLabel(l: { qty: number; unitPriceCents: number; measure: number | null; unit: string | null }): string {
  if (l.qty > 1) return `${l.qty} × ${formatEuro(l.unitPriceCents)}`;
  return l.measure !== null ? `${fmtQty(l.measure)} ${l.unit}` : "1 item";
}
