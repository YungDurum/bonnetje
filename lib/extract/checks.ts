// Pure checks on what the reader returned. They never "correct" amounts: anything that
// doesn't add up is flagged for review, and the user fixes it on "Check receipt".
import { ReadError } from "./errors";
import { ExtractedReceipt, UNITS, type ExtractedLine, type WireLine, type WireReceipt } from "./schema";

type Unit = (typeof UNITS)[number];

export type Assessment = {
  receipt: ExtractedReceipt;
  /** The user has to check the receipt before it can be saved. */
  needsReview: boolean;
  /** What was noticed, for logs and the extraction report. */
  problems: string[];
};

/**
 * A measure without a unit (or a unit without a measure) is unknown, not half known.
 * So is a measure in a unit Bonnetje doesn't have (m², ml).
 */
export function normalizeMeasure(l: Pick<WireLine, "measure" | "unit">): { measure: number | null; unit: Unit | null } {
  const unit = UNITS.find((u) => u === l.unit);
  if (l.measure === null || !unit || !(l.measure > 0) || !Number.isFinite(l.measure)) {
    return { measure: null, unit: null };
  }
  return { measure: l.measure, unit };
}

/** qty × unit price matches the line total, allowing one cent of rounding. */
export function lineMathOk(l: Pick<ExtractedLine, "qty" | "unitPriceCents" | "lineTotalCents">): boolean {
  return Math.abs(Math.round(l.qty * l.unitPriceCents) - l.lineTotalCents) <= 1;
}

export function linesSum(lines: { lineTotalCents: number }[]): number {
  return lines.reduce((a, l) => a + l.lineTotalCents, 0);
}

/** Lines add up to the receipt total, to the cent. */
export function addsUp(lines: { lineTotalCents: number }[], totalCents: number): boolean {
  return linesSum(lines) === totalCents;
}

/**
 * Turn the reader's answer into a receipt Bonnetje can store, or throw a ReadError.
 * `today` (YYYY-MM-DD) stands in for a date the receipt doesn't show.
 */
export function assess(wire: WireReceipt, today: string): Assessment {
  if (!wire.isReceipt) throw new ReadError("not_a_receipt", wire.problem ?? undefined);
  const problems: string[] = [];
  let needsReview = false;
  const flag = (p: string) => {
    problems.push(p);
    needsReview = true;
  };

  const lines: ExtractedLine[] = [];
  for (const l of wire.lines) {
    if (l.lineTotalCents < 0) {
      // Discounts and returns: Bonnetje has no negative lines (yet). Leaving it out makes
      // the receipt not add up, so the user takes it off the right item.
      flag(`Left out "${l.short}" (${l.lineTotalCents} cents): discounts must be taken off an item by hand`);
      continue;
    }
    let vatRate = l.vatRate;
    if (vatRate !== 21 && vatRate !== 9) {
      flag(`"${l.short}" has VAT ${vatRate}%; set to 21%`);
      vatRate = 21;
    }
    const line = {
      name: l.name.trim() || l.short.trim(),
      short: l.short.trim() || l.name.trim(),
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
      ...normalizeMeasure(l),
      vatRate: vatRate as 21 | 9,
    };
    if (l.measure !== line.measure || l.unit !== line.unit) problems.push(`"${l.short}": measure made unknown (${l.measure} ${l.unit})`);
    if (!lineMathOk(line)) flag(`"${l.short}": ${l.qty} × ${l.unitPriceCents} ≠ ${l.lineTotalCents}`);
    lines.push(line);
  }
  if (!lines.length) throw new ReadError("not_a_receipt", wire.problem ?? "no item lines");

  let totalCents = wire.totalCents;
  if (totalCents === null) {
    totalCents = linesSum(lines);
    flag("No total found on the receipt");
  } else if (!addsUp(lines, totalCents)) {
    flag(`Lines add up to ${linesSum(lines)}, receipt says ${totalCents}`);
  }

  let supplier = wire.supplier?.trim() ?? "";
  if (!supplier) {
    supplier = "Unknown supplier";
    problems.push("No supplier found");
  }
  let date = wire.date ?? "";
  if (!validDate(date)) {
    problems.push(`No usable date (${wire.date}); used today`);
    date = today;
  }

  const parsed = ExtractedReceipt.safeParse({ supplier, date, lines, totalCents });
  if (!parsed.success) throw new ReadError("invalid", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return { receipt: parsed.data, needsReview, problems };
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
