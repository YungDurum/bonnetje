// Compare a reading with samples/<name>.expected.json, for the extraction report.
import type { Assessment } from "./checks";
import type { ReadErrorCode } from "./errors";

export type ExpectedLine = {
  short: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  measure: number | null;
  unit: string | null;
  vatRate: number;
};

export type Expected =
  | { note?: string; error: ReadErrorCode }
  | { note?: string; supplier: string; date: string; totalCents: number; needsReview: boolean; lines: ExpectedLine[] };

export type Outcome = { ok: true; assessment: Assessment } | { ok: false; code: ReadErrorCode; detail?: string };

const simple = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Differences between what was read and what was expected; empty when they match. */
export function compareWithExpected(outcome: Outcome, expected: Expected): string[] {
  if ("error" in expected) {
    if (outcome.ok) return [`expected "${expected.error}", but it was read as a receipt with ${outcome.assessment.receipt.lines.length} lines`];
    return outcome.code === expected.error ? [] : [`expected error "${expected.error}", got "${outcome.code}"`];
  }
  if (!outcome.ok) return [`expected a receipt, got error "${outcome.code}"${outcome.detail ? ` (${outcome.detail})` : ""}`];

  const { receipt, needsReview } = outcome.assessment;
  const diffs: string[] = [];
  const a = simple(receipt.supplier);
  const b = simple(expected.supplier);
  if (!a || !(a.includes(b) || b.includes(a))) diffs.push(`supplier "${receipt.supplier}", expected "${expected.supplier}"`);
  if (receipt.date !== expected.date) diffs.push(`date ${receipt.date}, expected ${expected.date}`);
  if (receipt.totalCents !== expected.totalCents) diffs.push(`total ${receipt.totalCents}, expected ${expected.totalCents}`);
  if (needsReview !== expected.needsReview) diffs.push(needsReview ? "flagged for review, expected not" : "not flagged for review, expected flagged");
  if (receipt.lines.length !== expected.lines.length) {
    diffs.push(`${receipt.lines.length} lines, expected ${expected.lines.length}`);
    return diffs;
  }
  expected.lines.forEach((e, i) => {
    const got = receipt.lines[i];
    const where = `line ${i + 1} (${e.short})`;
    if (got.lineTotalCents !== e.lineTotalCents) diffs.push(`${where}: total ${got.lineTotalCents}, expected ${e.lineTotalCents}`);
    if (got.qty !== e.qty) diffs.push(`${where}: qty ${got.qty}, expected ${e.qty}`);
    if (got.unitPriceCents !== e.unitPriceCents) diffs.push(`${where}: unit price ${got.unitPriceCents}, expected ${e.unitPriceCents}`);
    if (got.vatRate !== e.vatRate) diffs.push(`${where}: VAT ${got.vatRate}%, expected ${e.vatRate}%`);
    if (got.measure !== e.measure || got.unit !== e.unit) {
      const show = (m: number | null, u: string | null) => (m === null ? "unknown" : `${m} ${u}`);
      diffs.push(`${where}: measure ${show(got.measure, got.unit)}, expected ${show(e.measure, e.unit)}`);
    }
  });
  return diffs;
}
