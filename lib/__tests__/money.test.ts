import { describe, expect, it } from "vitest";
import {
  exclVat,
  invoiceForJob,
  invoiceTotals,
  labourCents,
  materialsExcl,
  mulDiv,
  placeLine,
  splitLine,
  splitLineEuros,
  toHalfSteps,
  toInvoice,
  vatOn,
  type Labour,
  type Material,
} from "../money";

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

const noLabour: Labour = { mode: "hour", hoursHalf: 0, daysHalf: 0, hourRateCents: 6250, dayRateCents: 45000 };

// Small seeded PRNG so the property tests are repeatable.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("mulDiv", () => {
  it("rounds half up", () => {
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(3, 1, 2)).toBe(2);
    expect(mulDiv(1, 1, 3)).toBe(0);
    expect(mulDiv(2, 1, 3)).toBe(1);
  });
  it("stays exact past 2^53", () => {
    // 9_000_000_000 cents × 9_999_999 would lose precision as a float
    expect(mulDiv(9_000_000_000, 9_999_999, 9_999_999)).toBe(9_000_000_000);
  });
});

describe("VAT", () => {
  it("excl = round(cents / 1.21) for 21%", () => {
    expect(exclVat(121)).toBe(100);
    expect(exclVat(4620)).toBe(3818);
    expect(exclVat(2995)).toBe(2475);
    expect(exclVat(376)).toBe(311);
    expect(exclVat(0)).toBe(0);
    expect(exclVat(1)).toBe(1); // 0.826 → 1
  });
  it("matches round(c / 1.21) for every cent amount up to €200", () => {
    for (let c = 0; c <= 20000; c++) {
      // the float formula is fine at this size, apart from exact .5 ties which can't occur for /1.21
      expect(exclVat(c)).toBe(Math.round(c / 1.21));
    }
  });
  it("handles a .5 tie by rounding up", () => {
    // 60.5 cents excl → incl 9%: 109 × 100/109... pick a real tie: 121 × 0.5 = 60.5 incl → excl 50, not a tie.
    // For 9%: incl 545 → 500 exactly; incl 109·k + 54.5 does not exist in cents, so build one from mulDiv directly.
    expect(mulDiv(109, 50, 100)).toBe(55); // 54.5 → 55
  });
  it("supports 9% and 0%", () => {
    expect(exclVat(109, 9)).toBe(100);
    expect(exclVat(1000, 9)).toBe(917); // 917.43
    expect(exclVat(1000, 0)).toBe(1000);
  });
  it("vatOn", () => {
    expect(vatOn(10000)).toBe(2100);
    expect(vatOn(10000, 9)).toBe(900);
    expect(vatOn(5)).toBe(1); // 1.05
    expect(vatOn(2)).toBe(0); // 0.42
  });
  it("rejects floats and negatives", () => {
    expect(() => exclVat(12.5)).toThrow(RangeError);
    expect(() => exclVat(-1)).toThrow(RangeError);
    expect(() => exclVat(NaN)).toThrow(RangeError);
  });
});

describe("splitLine by amount", () => {
  it("cable: 30 m and 20 m of 100 m at €89", () => {
    const r = ok(splitLine(8900, 100, [
      { jobId: "a", amount: 30 },
      { jobId: "b", amount: 20 },
    ]));
    expect(r.parts).toEqual([{ jobId: "a", cents: 2670 }, { jobId: "b", cents: 1780 }]);
    expect(r.leftoverCents).toBe(4450);
    expect(r.leftoverAmount).toBe(50);
  });

  it("every part is round(line × used / total) in the common case", () => {
    const r = ok(splitLine(1299, 5, [{ jobId: "a", amount: 1.5 }]));
    expect(r.parts[0].cents).toBe(Math.round((1299 * 1.5) / 5)); // 389.7 → 390
    expect(r.leftoverCents).toBe(1299 - 390);
  });

  it("decimal measures don't suffer float noise (2.5 L, 0.1 L steps)", () => {
    const r = ok(splitLine(3499, 2.5, [{ jobId: "a", amount: 0.1 }, { jobId: "b", amount: 0.2 }]));
    // 3499 × 0.1 / 2.5 = 139.96 → 140; cumulative 0.3 → 419.88 → 420
    expect(r.parts.map((p) => p.cents)).toEqual([140, 280]);
    expect(r.leftoverAmount).toBeCloseTo(2.2, 10);
  });

  it("two halves of an odd amount don't add up to more than the line", () => {
    // naive rounding would give 51 + 51 = 102
    const r = ok(splitLine(101, 2, [{ jobId: "a", amount: 1 }, { jobId: "b", amount: 1 }]));
    expect(r.parts.map((p) => p.cents)).toEqual([51, 50]);
    expect(r.leftoverCents).toBe(0);
  });

  it("three thirds of €1 leave no stray cent", () => {
    const r = ok(splitLine(100, 3, [
      { jobId: "a", amount: 1 },
      { jobId: "b", amount: 1 },
      { jobId: "c", amount: 1 },
    ]));
    expect(r.parts.map((p) => p.cents)).toEqual([33, 34, 33]);
    expect(r.leftoverCents).toBe(0);
    expect(r.leftoverAmount).toBe(0);
  });

  it("exactly 100% assigned → leftover 0", () => {
    const r = ok(splitLine(4950, 50, [{ jobId: "a", amount: 50 }]));
    expect(r.parts[0].cents).toBe(4950);
    expect(r.leftoverCents).toBe(0);
  });

  it("nothing assigned → all leftover", () => {
    const r = ok(splitLine(1895, 200, []));
    expect(r.parts).toEqual([]);
    expect(r.leftoverCents).toBe(1895);
    expect(r.leftoverAmount).toBe(200);
  });

  it("a 1-cent line", () => {
    const r = ok(splitLine(1, 4, [{ jobId: "a", amount: 1 }, { jobId: "b", amount: 1 }]));
    expect(r.parts.map((p) => p.cents)).toEqual([0, 1]); // 0.25 → 0, 0.5 → 1 cumulative
    expect(r.leftoverCents).toBe(0);
  });

  it("split by part when the measure is unknown (total = 1)", () => {
    const r = ok(splitLine(1895, 1, [{ jobId: "a", amount: 0.75 }]));
    expect(r.parts[0].cents).toBe(1421); // 1421.25
    expect(r.leftoverCents).toBe(474);
    expect(r.leftoverAmount).toBe(0.25);
  });

  it("more than 100% is an error", () => {
    const r = splitLine(8900, 100, [{ jobId: "a", amount: 60 }, { jobId: "b", amount: 50 }]);
    expect(r).toEqual({ ok: false, error: "too_much", overBy: 10 });
  });

  it("just over 100% with decimals is an error", () => {
    const r = splitLine(3499, 2.5, [{ jobId: "a", amount: 2.5 }, { jobId: "b", amount: 0.001 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects negative amounts and a zero total", () => {
    expect(() => splitLine(100, 1, [{ jobId: "a", amount: -0.5 }])).toThrow(RangeError);
    expect(() => splitLine(100, 0, [])).toThrow(RangeError);
    expect(() => splitLine(10.5, 1, [])).toThrow(RangeError);
  });

  it("property: parts + leftover always equal the line, each part within 1 cent of its share", () => {
    const rand = rng(42);
    for (let n = 0; n < 5000; n++) {
      const line = Math.floor(rand() * 500000);
      const totalMilli = 1 + Math.floor(rand() * 200000);
      const k = Math.floor(rand() * 5);
      let left = totalMilli;
      const rows = Array.from({ length: k }, (_, i) => {
        const u = Math.floor(rand() * (left + 1));
        left -= u;
        return { jobId: `j${i}`, amount: u / 1000 };
      });
      const r = ok(splitLine(line, totalMilli / 1000, rows));
      const sum = r.parts.reduce((a, p) => a + p.cents, 0);
      expect(sum + r.leftoverCents).toBe(line);
      expect(r.leftoverCents).toBeGreaterThanOrEqual(0);
      r.parts.forEach((p, i) => {
        expect(p.cents).toBeGreaterThanOrEqual(0);
        const share = (line * Math.round(rows[i].amount * 1000)) / totalMilli;
        expect(Math.abs(p.cents - share)).toBeLessThanOrEqual(1);
      });
      if (left === 0) expect(r.leftoverCents).toBe(0);
    }
  });
});

describe("splitLineEuros", () => {
  it("parts in cents, leftover is the rest", () => {
    const r = ok(splitLineEuros(1895, [{ jobId: "a", cents: 1000 }, { jobId: "b", cents: 500 }]));
    expect(r.parts.map((p) => p.cents)).toEqual([1000, 500]);
    expect(r.leftoverCents).toBe(395);
    expect(r.leftoverAmount).toBeNull();
  });
  it("exactly the line → no leftover", () => {
    expect(ok(splitLineEuros(1895, [{ jobId: "a", cents: 1895 }])).leftoverCents).toBe(0);
  });
  it("more than the line is an error", () => {
    expect(splitLineEuros(1895, [{ jobId: "a", cents: 1000 }, { jobId: "b", cents: 900 }])).toEqual({
      ok: false,
      error: "too_much",
      overBy: 5,
    });
  });
  it("rejects euro floats", () => {
    expect(() => splitLineEuros(1895, [{ jobId: "a", cents: 10.5 }])).toThrow(RangeError);
  });
});

describe("placeLine (leftover)", () => {
  const split = ok(splitLine(8900, 100, [{ jobId: "a", amount: 30 }, { jobId: "b", amount: 20 }]));

  it("stock (default)", () => {
    const p = placeLine(split, "stock");
    expect(Object.fromEntries(p.perJob)).toEqual({ a: 2670, b: 1780 });
    expect(p.stockCents).toBe(4450);
    expect(p.wasteCents).toBe(0);
  });
  it("client keeps it → billed to the first job on the line", () => {
    const p = placeLine(split, "client");
    expect(Object.fromEntries(p.perJob)).toEqual({ a: 7120, b: 1780 });
    expect(p.stockCents).toBe(0);
  });
  it("client skips a first job that got nothing", () => {
    const s = ok(splitLine(1000, 10, [{ jobId: "a", amount: 0 }, { jobId: "b", amount: 4 }]));
    const p = placeLine(s, "client");
    expect(Object.fromEntries(p.perJob)).toEqual({ b: 1000 });
  });
  it("client with no job falls back to stock", () => {
    const p = placeLine(ok(splitLine(1000, 10, [])), "client");
    expect(p.leftover).toBe("stock");
    expect(p.stockCents).toBe(1000);
  });
  it("waste is not billed", () => {
    const p = placeLine(split, "waste");
    expect(p.wasteCents).toBe(4450);
    expect(p.stockCents).toBe(0);
    expect([...p.perJob.values()].reduce((a, b) => a + b, 0)).toBe(4450);
  });
  it("the same job twice on one line is summed", () => {
    const s = ok(splitLine(1000, 10, [{ jobId: "a", amount: 2 }, { jobId: "a", amount: 3 }]));
    expect(placeLine(s, "stock").perJob.get("a")).toBe(500);
  });
  it("totals always equal the line", () => {
    for (const mode of ["stock", "client", "waste"] as const) {
      const p = placeLine(split, mode);
      const jobs = [...p.perJob.values()].reduce((a, b) => a + b, 0);
      expect(jobs + p.stockCents + p.wasteCents).toBe(8900);
    }
  });
});

describe("labour", () => {
  it("half steps", () => {
    expect(toHalfSteps(4.5)).toBe(9);
    expect(toHalfSteps(0)).toBe(0);
    expect(() => toHalfSteps(1.25)).toThrow(RangeError);
    expect(() => toHalfSteps(-1)).toThrow(RangeError);
  });
  it("hours × hourly rate", () => {
    expect(labourCents({ ...noLabour, hoursHalf: 12 })).toBe(37500); // 6 h × €62.50
    expect(labourCents({ ...noLabour, hoursHalf: 9 })).toBe(28125); // 4.5 h
  });
  it("half an hour at an odd rate rounds half up", () => {
    expect(labourCents({ ...noLabour, hoursHalf: 1, hourRateCents: 6251 })).toBe(3126); // 3125.5
  });
  it("days × day rate", () => {
    expect(labourCents({ ...noLabour, mode: "day", daysHalf: 1 })).toBe(22500); // ½ day × €450
    expect(labourCents({ ...noLabour, mode: "day", daysHalf: 2, hoursHalf: 99 })).toBe(45000);
  });
});

describe("To invoice", () => {
  // Prototype seed data (docs/bonnetje-prototype.dc.html): markup 15%, €62.50/h.
  const deVries: Material[] = [
    { billed: false, lines: [{ cents: 2995, vatRate: 21 }, { cents: 1249, vatRate: 21 }, { cents: 376, vatRate: 21 }] },
  ];
  const jansen: Material[] = [
    { billed: false, lines: [{ cents: 31200, vatRate: 21 }, { cents: 5890, vatRate: 21 }, { cents: 1860, vatRate: 21 }] },
    { billed: false, lines: [{ cents: 2399, vatRate: 21 }] },
  ];

  it("de Vries: €46.20 materials, 6 h", () => {
    const t = toInvoice(deVries, 15, { ...noLabour, hoursHalf: 12 });
    expect(t).toEqual({ materialsExcl: 3818, markup: 573, labour: 37500, total: 41891 });
  });

  it("Jansen: two receipts, 4.5 h", () => {
    const t = toInvoice(jansen, 15, { ...noLabour, hoursHalf: 9 });
    expect(t).toEqual({ materialsExcl: 34173, markup: 5126, labour: 28125, total: 67424 });
  });

  it("billed materials are left out", () => {
    const t = toInvoice([{ ...deVries[0], billed: true }, ...jansen], 15, noLabour);
    expect(t.materialsExcl).toBe(34173);
  });

  it("nothing to invoice", () => {
    expect(toInvoice([], 15, noLabour)).toEqual({ materialsExcl: 0, markup: 0, labour: 0, total: 0 });
  });

  it("converts each line with its own VAT rate", () => {
    const mixed: Material[] = [{ billed: false, lines: [{ cents: 1210, vatRate: 21 }, { cents: 1090, vatRate: 9 }] }];
    expect(materialsExcl(mixed)).toBe(2000);
  });

  it("0% markup and bad markup", () => {
    expect(toInvoice(deVries, 0, noLabour).markup).toBe(0);
    expect(() => toInvoice(deVries, 12.5, noLabour)).toThrow(RangeError);
    expect(() => toInvoice(deVries, -1, noLabour)).toThrow(RangeError);
  });
});

describe("invoice totals", () => {
  it("subtotal + 21% VAT = total", () => {
    const t = invoiceForJob({ materialsExcl: 3818, markup: 573, labour: 37500, total: 41891 });
    expect(t.subtotal).toBe(41891);
    expect(t.vat).toBe(8797); // 8797.11
    expect(t.total).toBe(50688);
  });
  it("VAT is taken over the subtotal, not per line", () => {
    // three lines of 2 cents: per line 0.42 → 0 each; over 6 cents 1.26 → 1
    const t = invoiceTotals([2, 2, 2].map((c) => ({ exclCents: c, vatRate: 21 as const })));
    expect(t.vat).toBe(1);
  });
  it("keeps rates apart", () => {
    const t = invoiceTotals([
      { exclCents: 10000, vatRate: 21 },
      { exclCents: 10000, vatRate: 9 },
    ]);
    expect(t.vatByRate).toEqual([
      { rate: 21, base: 10000, vat: 2100 },
      { rate: 9, base: 10000, vat: 900 },
    ]);
    expect(t.total).toBe(23000);
  });
  it("empty invoice", () => {
    expect(invoiceTotals([])).toEqual({ subtotal: 0, vatByRate: [], vat: 0, total: 0 });
  });
});
