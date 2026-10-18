// Using stock on a job: how much it is worth and what stays in stock. Pure, no I/O.
import { formatEuro } from "./format";
import { mulDiv, splitLine, splitLineEuros, toMilli, type Cents, type Unit } from "./money";
import { fmtQty } from "./placement";

export type StockAmount = { qty: number | null; unit: Unit | null; valueCents: Cents };

/**
 * - "measure": an amount in the item's unit (only when its quantity is known)
 * - "part": a fraction 0..1 (when the quantity is unknown)
 * - "euro": cents
 */
export type StockUse =
  | { kind: "measure"; amount: number }
  | { kind: "part"; fraction: number }
  | { kind: "euro"; cents: Cents };

export type StockUseResult =
  | {
      ok: true;
      /** Billed to the job, incl. VAT. */
      cents: Cents;
      remainingCents: Cents;
      remainingQty: number | null;
      /** Nothing left: the item leaves stock. */
      usedUp: boolean;
      /** e.g. "2 m", "¾", "€3.10" — for the material line on the job. */
      usedLabel: string;
    }
  | { ok: false; error: "too_much" | "nothing"; overBy: number };

const FRACTIONS: Record<number, string> = { 250: "¼", 500: "½", 750: "¾", 1000: "all" };

export function takeFromStock(item: StockAmount, use: StockUse): StockUseResult {
  if (use.kind === "measure") {
    if (item.qty === null) throw new Error("This item has no quantity; use part or euros");
    if (toMilli(use.amount) === 0) return { ok: false, error: "nothing", overBy: 0 };
    const s = splitLine(item.valueCents, item.qty, [{ jobId: "", amount: use.amount }]);
    if (!s.ok) return { ok: false, error: "too_much", overBy: s.overBy };
    const leftMilli = toMilli(item.qty) - toMilli(use.amount);
    return {
      ok: true,
      cents: s.parts[0].cents,
      remainingCents: s.leftoverCents,
      remainingQty: leftMilli / 1000,
      usedUp: leftMilli === 0,
      usedLabel: `${fmtQty(use.amount)} ${item.unit}`,
    };
  }

  if (use.kind === "part") {
    const milli = toMilli(use.fraction);
    if (milli === 0) return { ok: false, error: "nothing", overBy: 0 };
    const s = splitLine(item.valueCents, 1, [{ jobId: "", amount: use.fraction }]);
    if (!s.ok) return { ok: false, error: "too_much", overBy: s.overBy };
    const qtyMilli = item.qty === null ? null : toMilli(item.qty);
    return {
      ok: true,
      cents: s.parts[0].cents,
      remainingCents: s.leftoverCents,
      remainingQty: qtyMilli === null ? null : (qtyMilli - mulDiv(qtyMilli, milli, 1000)) / 1000,
      usedUp: milli === 1000,
      usedLabel: FRACTIONS[milli] ?? `${Math.round(use.fraction * 100)}%`,
    };
  }

  if (use.cents === 0) return { ok: false, error: "nothing", overBy: 0 };
  const s = splitLineEuros(item.valueCents, [{ jobId: "", cents: use.cents }]);
  if (!s.ok) return { ok: false, error: "too_much", overBy: s.overBy };
  const usedUp = s.leftoverCents === 0;
  // A known quantity shrinks in proportion to the value used (rounded to 0.001).
  let remainingQty: number | null = null;
  if (item.qty !== null) {
    remainingQty = usedUp || item.valueCents === 0 ? 0 : mulDiv(toMilli(item.qty), s.leftoverCents, item.valueCents) / 1000;
  }
  return {
    ok: true,
    cents: use.cents,
    remainingCents: s.leftoverCents,
    remainingQty,
    usedUp,
    usedLabel: formatEuro(use.cents),
  };
}

/** "2 of 4 m", "12 pcs", or null when the quantity is unknown. */
export function stockLeftLabel(qty: number | null, unit: Unit | null, originalQty: number | null): string | null {
  if (qty === null || unit === null) return null;
  return originalQty !== null && originalQty !== qty ? `${fmtQty(qty)} of ${fmtQty(originalQty)} ${unit}` : `${fmtQty(qty)} ${unit}`;
}

/** Manual material: price incl. VAT × quantity (quantity may have decimals, e.g. 1.5). */
export function manualCents(priceCents: Cents, qty: number): Cents {
  const milli = toMilli(qty);
  if (milli === 0) throw new RangeError("Quantity must be more than 0");
  return mulDiv(priceCents, milli, 1000);
}
