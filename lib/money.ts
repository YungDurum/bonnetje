// Money logic for Bonnetje. Pure functions, no I/O.
// All money is integer cents. Receipt prices are incl. VAT.
// Measures (2.5 L, 0.75 of a part) are handled as integer thousandths so that
// rounding never depends on floating-point noise.

export type Cents = number;
export type VatRate = 0 | 9 | 21;
export type Unit = "pcs" | "m" | "L" | "kg" | "boxes";
export type LeftoverMode = "stock" | "client" | "waste";
export type LabourMode = "hour" | "day";

export const DEFAULT_VAT: VatRate = 21;

function assertCents(n: number, what = "amount"): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${what} must be a non-negative whole number of cents, got ${n}`);
  }
}

/** Integer a × m / b rounded half up. a, m ≥ 0, b > 0. Exact for any safe integers. */
export function mulDiv(a: number, m: number, b: number): number {
  const A = BigInt(a) * BigInt(m);
  const B = BigInt(b);
  return Number((2n * A + B) / (2n * B));
}

/** Amount (e.g. 2.5) → integer thousandths (2500). Numbers with more than 3 decimals are rounded. */
export function toMilli(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`amount must be a non-negative number, got ${amount}`);
  }
  return Math.round(amount * 1000);
}

// ---------- VAT ----------

/** Incl. VAT → excl. VAT. For 21%: round(cents / 1.21). */
export function exclVat(inclCents: Cents, rate: VatRate = DEFAULT_VAT): Cents {
  assertCents(inclCents);
  return mulDiv(inclCents, 100, 100 + rate);
}

/** VAT on an excl. VAT amount. */
export function vatOn(exclCents: Cents, rate: VatRate = DEFAULT_VAT): Cents {
  assertCents(exclCents);
  return mulDiv(exclCents, rate, 100);
}

// ---------- splitting a receipt line ----------

export type SplitPart = { jobId: string; cents: Cents };

export type SplitResult =
  | {
      ok: true;
      /** One per input row, same order. Always sums to at most lineCents. */
      parts: SplitPart[];
      leftoverCents: Cents;
      /** Leftover in the line's unit (or as a fraction for "part"); null when split by euros. */
      leftoverAmount: number | null;
    }
  | {
      ok: false;
      error: "too_much";
      /** How much too much, in the same terms as the input (unit/fraction, or cents for euros). */
      overBy: number;
    };

/**
 * Split a line by amount: in the line's unit (total = the measure, e.g. 100 m)
 * or by part when the measure is unknown (total = 1, amounts are fractions).
 *
 * Each part is round(lineCents × used / total), applied cumulatively: part i is
 * the rounded running total up to i minus the rounded running total before i.
 * That keeps every part within a cent of its own share, the parts never add up
 * to more than the line, and a fully assigned line has no leftover cent.
 */
export function splitLine(
  lineCents: Cents,
  total: number,
  rows: { jobId: string; amount: number }[],
): SplitResult {
  assertCents(lineCents, "lineCents");
  const totalMilli = toMilli(total);
  if (totalMilli <= 0) throw new RangeError("total must be greater than 0");

  const used = rows.map((r) => toMilli(r.amount));
  const usedMilli = used.reduce((a, b) => a + b, 0);
  if (usedMilli > totalMilli) {
    return { ok: false, error: "too_much", overBy: (usedMilli - totalMilli) / 1000 };
  }

  let runMilli = 0;
  let runCents = 0;
  const parts = rows.map((r, i) => {
    runMilli += used[i];
    const upTo = mulDiv(lineCents, runMilli, totalMilli);
    const cents = upTo - runCents;
    runCents = upTo;
    return { jobId: r.jobId, cents };
  });

  return {
    ok: true,
    parts,
    leftoverCents: lineCents - runCents,
    leftoverAmount: (totalMilli - usedMilli) / 1000,
  };
}

/** Split a line by typed euro amounts (in cents). */
export function splitLineEuros(
  lineCents: Cents,
  rows: { jobId: string; cents: Cents }[],
): SplitResult {
  assertCents(lineCents, "lineCents");
  rows.forEach((r) => assertCents(r.cents));
  const sum = rows.reduce((a, r) => a + r.cents, 0);
  if (sum > lineCents) return { ok: false, error: "too_much", overBy: sum - lineCents };
  return {
    ok: true,
    parts: rows.map((r) => ({ jobId: r.jobId, cents: r.cents })),
    leftoverCents: lineCents - sum,
    leftoverAmount: null,
  };
}

export type PlacedLine = {
  /** Cents per job (jobs with 0 cents left out; leftover for "client" included). */
  perJob: Map<string, Cents>;
  stockCents: Cents;
  wasteCents: Cents;
  /** The leftover mode that was actually used ("client" falls back to "stock" when no job got anything). */
  leftover: LeftoverMode;
};

/**
 * Decide where the leftover of a split line goes.
 * "client" bills it to the first job on the line that got something; with no such
 * job it stays in stock. Totals always add up to the line.
 */
export function placeLine(
  split: Extract<SplitResult, { ok: true }>,
  mode: LeftoverMode,
): PlacedLine {
  const perJob = new Map<string, Cents>();
  for (const p of split.parts) {
    if (p.cents > 0) perJob.set(p.jobId, (perJob.get(p.jobId) ?? 0) + p.cents);
  }
  const first = split.parts.find((p) => p.cents > 0);
  const left = split.leftoverCents;
  const leftover: LeftoverMode = mode === "client" && !first ? "stock" : mode;

  if (leftover === "client" && first && left > 0) {
    perJob.set(first.jobId, (perJob.get(first.jobId) ?? 0) + left);
  }
  return {
    perJob,
    stockCents: leftover === "stock" ? left : 0,
    wasteCents: leftover === "waste" ? left : 0,
    leftover,
  };
}

// ---------- labour ----------

/** Hours or days → half steps (4.5 → 9). Only whole and half values are allowed. */
export function toHalfSteps(value: number): number {
  const half = value * 2;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(half)) {
    throw new RangeError(`must be a whole or half number ≥ 0, got ${value}`);
  }
  return half;
}

export type Labour = {
  mode: LabourMode;
  hoursHalf: number;
  daysHalf: number;
  hourRateCents: Cents;
  dayRateCents: Cents;
};

/** Labour excl. VAT: hours × hourly rate, or days × day rate. */
export function labourCents(l: Labour): Cents {
  const half = l.mode === "hour" ? l.hoursHalf : l.daysHalf;
  const rate = l.mode === "hour" ? l.hourRateCents : l.dayRateCents;
  if (!Number.isSafeInteger(half) || half < 0) throw new RangeError(`bad half steps: ${half}`);
  assertCents(rate, "rate");
  return mulDiv(half, rate, 2);
}

// ---------- "To invoice" and the invoice ----------

export type MaterialLine = { cents: Cents; vatRate: VatRate };
export type Material = { billed: boolean; lines: MaterialLine[] };

export type ToInvoice = {
  materialsExcl: Cents;
  markup: Cents;
  labour: Cents;
  /** materials + markup + labour, excl. VAT */
  total: Cents;
};

/** Materials excl. VAT; each line converted with its own VAT rate, then added up. */
export function materialsExcl(materials: Material[]): Cents {
  let sum = 0;
  for (const m of materials) {
    if (m.billed) continue;
    for (const l of m.lines) sum += exclVat(l.cents, l.vatRate);
  }
  return sum;
}

/** What is still to invoice on a job: unbilled materials excl. VAT + markup on them + labour. */
export function toInvoice(materials: Material[], markupPct: number, labour: Labour): ToInvoice {
  if (!Number.isInteger(markupPct) || markupPct < 0) {
    throw new RangeError(`markup must be a whole percentage ≥ 0, got ${markupPct}`);
  }
  const mat = materialsExcl(materials);
  const markup = mulDiv(mat, markupPct, 100);
  const lab = labourCents(labour);
  return { materialsExcl: mat, markup, labour: lab, total: mat + markup + lab };
}

export type InvoiceLine = { exclCents: Cents; vatRate: VatRate };
export type InvoiceTotals = {
  subtotal: Cents;
  /** VAT per rate, computed on that rate's subtotal */
  vatByRate: { rate: VatRate; base: Cents; vat: Cents }[];
  vat: Cents;
  total: Cents;
};

/** Subtotal excl. VAT + VAT = total. VAT is computed per rate over the subtotal of that rate. */
export function invoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  const base = new Map<VatRate, Cents>();
  for (const l of lines) {
    assertCents(l.exclCents);
    base.set(l.vatRate, (base.get(l.vatRate) ?? 0) + l.exclCents);
  }
  const vatByRate = [...base.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, b]) => ({ rate, base: b, vat: vatOn(b, rate) }));
  const subtotal = vatByRate.reduce((a, r) => a + r.base, 0);
  const vat = vatByRate.reduce((a, r) => a + r.vat, 0);
  return { subtotal, vatByRate, vat, total: subtotal + vat };
}

/** Invoice lines for a job: materials and markup and labour, all at 21%. */
export function invoiceForJob(t: ToInvoice): InvoiceTotals {
  return invoiceTotals([
    { exclCents: t.materialsExcl, vatRate: DEFAULT_VAT },
    { exclCents: t.markup, vatRate: DEFAULT_VAT },
    { exclCents: t.labour, vatRate: DEFAULT_VAT },
  ]);
}
