import { describe, expect, it } from "vitest";
import { compareWithExpected, type Expected, type Outcome } from "../extract/compare";

const expected: Expected = {
  supplier: "Klushuis Amersfoort",
  date: "2026-10-14",
  totalCents: 2148,
  needsReview: false,
  lines: [
    { short: "TEGELLIJM 25KG", qty: 1, unitPriceCents: 1849, lineTotalCents: 1849, measure: 25, unit: "kg", vatRate: 21 },
    { short: "KOFFIE", qty: 1, unitPriceCents: 299, lineTotalCents: 299, measure: 1, unit: "pcs", vatRate: 9 },
  ],
};

function read(over: { supplier?: string; total?: number; needsReview?: boolean; measure?: number | null; vat?: 9 | 21 } = {}): Outcome {
  return {
    ok: true,
    assessment: {
      needsReview: over.needsReview ?? false,
      problems: [],
      receipt: {
        supplier: over.supplier ?? "KLUSHUIS AMERSFOORT",
        date: "2026-10-14",
        totalCents: over.total ?? 2148,
        lines: [
          { name: "Tile adhesive", short: "TEGELLIJM 25KG", qty: 1, unitPriceCents: 1849, lineTotalCents: 1849, measure: 25, unit: "kg", vatRate: 21 },
          {
            name: "Coffee",
            short: "KOFFIE",
            qty: 1,
            unitPriceCents: 299,
            lineTotalCents: 299,
            measure: over.measure === undefined ? 1 : over.measure,
            unit: over.measure === null ? null : "pcs",
            vatRate: over.vat ?? 9,
          },
        ],
      },
    },
  };
}

describe("compareWithExpected", () => {
  it("matches, ignoring case and punctuation in the supplier", () => {
    expect(compareWithExpected(read(), expected)).toEqual([]);
    expect(compareWithExpected(read({ supplier: "Klushuis" }), expected)).toEqual([]);
  });

  it("lists every difference", () => {
    expect(compareWithExpected(read({ supplier: "Gamma", total: 2149, needsReview: true, measure: null, vat: 21 }), expected)).toEqual([
      'supplier "Gamma", expected "Klushuis Amersfoort"',
      "total 2149, expected 2148",
      "flagged for review, expected not",
      "line 2 (KOFFIE): VAT 21%, expected 9%",
      "line 2 (KOFFIE): measure unknown, expected 1 pcs",
    ]);
  });

  it("checks expected errors", () => {
    const notReceipt: Expected = { error: "not_a_receipt" };
    expect(compareWithExpected({ ok: false, code: "not_a_receipt" }, notReceipt)).toEqual([]);
    expect(compareWithExpected({ ok: false, code: "invalid" }, notReceipt)).toEqual(['expected error "not_a_receipt", got "invalid"']);
    expect(compareWithExpected(read(), notReceipt)[0]).toMatch(/read as a receipt with 2 lines/);
    expect(compareWithExpected({ ok: false, code: "timeout" }, expected)).toEqual(['expected a receipt, got error "timeout"']);
  });
});
