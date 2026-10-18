import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { addsUp, assess, lineMathOk, normalizeMeasure } from "../extract/checks";
import { ReadError } from "../extract/errors";
import { fakeReader } from "../extract/fake";
import { claudeReader, readReceipt, RECEIPT_MODEL, type ParseFn, type ReceiptFile } from "../extract/reader";
import { ExtractedReceipt, type WireLine, type WireReceipt } from "../extract/schema";

const TODAY = "2026-10-18";

function line(over: Partial<WireLine> = {}): WireLine {
  return {
    name: "Tile adhesive 25 kg",
    short: "TEGELLIJM 25KG",
    qty: 1,
    unitPriceCents: 1849,
    lineTotalCents: 1849,
    measure: 25,
    unit: "kg",
    vatRate: 21,
    ...over,
  };
}

function wire(over: Partial<WireReceipt> = {}): WireReceipt {
  const lines = over.lines ?? [line(), line({ name: "Grout", short: "VOEGMIDDEL 5KG", unitPriceCents: 1299, lineTotalCents: 1299, measure: 5 })];
  return {
    isReceipt: true,
    problem: null,
    supplier: "Klushuis Amersfoort",
    date: "2026-10-14",
    totalCents: lines.reduce((a, l) => a + l.lineTotalCents, 0),
    ...over,
    lines,
  };
}

function readErrorOf(fn: () => unknown): ReadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReadError) return e;
    throw e;
  }
  throw new Error("expected a ReadError");
}

describe("ExtractedReceipt schema", () => {
  const ok = { supplier: "Wasco", date: "2026-10-17", totalCents: 2895, lines: [{ ...line(), lineTotalCents: 2895, unitPriceCents: 2895 }] };

  it("accepts the CLAUDE.md shape", () => {
    expect(ExtractedReceipt.safeParse(ok).success).toBe(true);
  });

  it("needs measure and unit together", () => {
    const half = { ...ok, lines: [{ ...ok.lines[0], unit: null }] };
    expect(ExtractedReceipt.safeParse(half).success).toBe(false);
    const none = { ...ok, lines: [{ ...ok.lines[0], measure: null, unit: null }] };
    expect(ExtractedReceipt.safeParse(none).success).toBe(true);
  });

  it("only allows 21% and 9% VAT, whole cents of 0 or more, and at least one line", () => {
    expect(ExtractedReceipt.safeParse({ ...ok, lines: [{ ...ok.lines[0], vatRate: 6 }] }).success).toBe(false);
    expect(ExtractedReceipt.safeParse({ ...ok, totalCents: 28.95 }).success).toBe(false);
    expect(ExtractedReceipt.safeParse({ ...ok, totalCents: -1 }).success).toBe(false);
    expect(ExtractedReceipt.safeParse({ ...ok, lines: [] }).success).toBe(false);
    expect(ExtractedReceipt.safeParse({ ...ok, date: "17-10-2026" }).success).toBe(false);
  });
});

describe("checks", () => {
  it("lineMathOk allows one cent of rounding", () => {
    expect(lineMathOk({ qty: 3, unitPriceCents: 2495, lineTotalCents: 7485 })).toBe(true);
    expect(lineMathOk({ qty: 2.5, unitPriceCents: 333, lineTotalCents: 833 })).toBe(true); // 832.5
    expect(lineMathOk({ qty: 2, unitPriceCents: 449, lineTotalCents: 449 })).toBe(false);
  });

  it("addsUp is exact to the cent", () => {
    expect(addsUp([{ lineTotalCents: 1849 }, { lineTotalCents: 1299 }], 3148)).toBe(true);
    expect(addsUp([{ lineTotalCents: 1849 }, { lineTotalCents: 1299 }], 3149)).toBe(false);
  });

  it("normalizeMeasure clears a half-given or unsupported measure", () => {
    expect(normalizeMeasure({ measure: 25, unit: "kg" })).toEqual({ measure: 25, unit: "kg" });
    expect(normalizeMeasure({ measure: 25, unit: null })).toEqual({ measure: null, unit: null });
    expect(normalizeMeasure({ measure: null, unit: "kg" })).toEqual({ measure: null, unit: null });
    expect(normalizeMeasure({ measure: 20, unit: "m2" })).toEqual({ measure: null, unit: null });
    expect(normalizeMeasure({ measure: 0, unit: "pcs" })).toEqual({ measure: null, unit: null });
  });
});

describe("assess", () => {
  it("passes a receipt that adds up", () => {
    const a = assess(wire(), TODAY);
    expect(a.needsReview).toBe(false);
    expect(a.problems).toEqual([]);
    expect(a.receipt.totalCents).toBe(3148);
    expect(a.receipt.lines[0]).toMatchObject({ measure: 25, unit: "kg", vatRate: 21 });
  });

  it("flags lines that don't add up to the total and keeps the amounts as read", () => {
    const a = assess(wire({ totalCents: 4247 }), TODAY);
    expect(a.needsReview).toBe(true);
    expect(a.receipt.totalCents).toBe(4247);
    expect(a.receipt.lines.map((l) => l.lineTotalCents)).toEqual([1849, 1299]);
  });

  it("flags a line where qty × price isn't the line total", () => {
    const a = assess(wire({ lines: [line({ qty: 2, unitPriceCents: 449, lineTotalCents: 449 })] }), TODAY);
    expect(a.needsReview).toBe(true);
  });

  it("makes a half-given measure unknown without flagging", () => {
    const a = assess(wire({ lines: [line({ unit: null })] }), TODAY);
    expect(a.receipt.lines[0]).toMatchObject({ measure: null, unit: null });
    expect(a.needsReview).toBe(false);
  });

  it("leaves a discount line out and flags the receipt", () => {
    const lines = [line(), line({ short: "KORTING", lineTotalCents: -185, unitPriceCents: -185, measure: null, unit: null })];
    const a = assess(wire({ lines, totalCents: 1664 }), TODAY);
    expect(a.receipt.lines).toHaveLength(1);
    expect(a.needsReview).toBe(true);
  });

  it("flags a missing total and uses the lines' sum", () => {
    const a = assess(wire({ totalCents: null }), TODAY);
    expect(a.needsReview).toBe(true);
    expect(a.receipt.totalCents).toBe(3148);
  });

  it("uses today for a missing or impossible date", () => {
    expect(assess(wire({ date: null }), TODAY).receipt.date).toBe(TODAY);
    expect(assess(wire({ date: "2026-02-30" }), TODAY).receipt.date).toBe(TODAY);
  });

  it("rejects something that isn't a receipt", () => {
    expect(readErrorOf(() => assess(wire({ isReceipt: false, problem: "card slip", lines: [] }), TODAY)).code).toBe("not_a_receipt");
    expect(readErrorOf(() => assess(wire({ lines: [] }), TODAY)).code).toBe("not_a_receipt");
  });

  it("rejects amounts that aren't whole cents", () => {
    expect(readErrorOf(() => assess(wire({ lines: [line({ lineTotalCents: 18.49, unitPriceCents: 18.49 })], totalCents: 18.49 }), TODAY)).code).toBe("invalid");
  });
});

describe("claudeReader", () => {
  const photo: ReceiptFile = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" };
  const pdf: ReceiptFile = { bytes: new TextEncoder().encode("%PDF-1.7"), mediaType: "application/pdf" };

  function fakeParse(answer: Awaited<ReturnType<ParseFn>> | Error) {
    const calls: Parameters<ParseFn>[0][] = [];
    const parse: ParseFn = async (params) => {
      calls.push(params);
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return { parse, calls };
  }

  it("sends a photo as an image and returns the checked receipt", async () => {
    const { parse, calls } = fakeParse({ stop_reason: "end_turn", parsed_output: wire() });
    const a = await readReceipt(photo, claudeReader({ parse }), TODAY);
    expect(a.receipt.supplier).toBe("Klushuis Amersfoort");
    expect(calls[0].model).toBe(RECEIPT_MODEL);
    const content = calls[0].messages[0].content as { type: string; source?: { media_type: string; data: string } }[];
    expect(content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg", data: "/9j/" } });
  });

  it("sends a PDF as a document", async () => {
    const { parse, calls } = fakeParse({ stop_reason: "end_turn", parsed_output: wire() });
    await readReceipt(pdf, claudeReader({ parse }), TODAY);
    const content = calls[0].messages[0].content as { type: string }[];
    expect(content[0].type).toBe("document");
  });

  it("turns failures into typed errors", async () => {
    const cases: [Awaited<ReturnType<ParseFn>> | Error, string][] = [
      [{ stop_reason: "end_turn", parsed_output: { nonsense: true } }, "invalid"],
      [{ stop_reason: "max_tokens", parsed_output: null }, "invalid"],
      [{ stop_reason: "refusal", parsed_output: null }, "invalid"],
      [new Anthropic.APIConnectionTimeoutError(), "timeout"],
      [new SyntaxError("Unexpected token"), "invalid"],
    ];
    for (const [answer, code] of cases) {
      const { parse } = fakeParse(answer);
      await expect(readReceipt(photo, claudeReader({ parse }), TODAY)).rejects.toMatchObject({ code });
    }
  });

  it("fails with no_key when there is no API key", async () => {
    await expect(readReceipt(photo, claudeReader({ apiKey: "" }), TODAY)).rejects.toMatchObject({ code: "no_key" });
  });
});

describe("fakeReader", () => {
  const dir = mkdtempSync(join(tmpdir(), "bonnetje-samples-"));
  writeFileSync(join(dir, "slip.expected.json"), JSON.stringify({ error: "not_a_receipt" }));
  writeFileSync(
    join(dir, "folded.expected.json"),
    JSON.stringify({ supplier: "Klushuis", date: "2026-10-13", totalCents: 500, lines: [{ ...line(), short: "GIPSPLAAT" }] }),
  );
  const file = (name?: string): ReceiptFile => ({ bytes: new Uint8Array(), mediaType: "image/jpeg", name });

  it("answers from a sample's expected JSON", async () => {
    const a = await readReceipt(file("folded.jpg"), fakeReader(dir), TODAY);
    expect(a.receipt.lines[0].name).toBe("Gipsplaat");
    expect(a.needsReview).toBe(true);
    await expect(readReceipt(file("slip.jpg"), fakeReader(dir), TODAY)).rejects.toMatchObject({ code: "not_a_receipt" });
  });

  it("falls back to a fixed receipt", async () => {
    const a = await readReceipt(file("IMG_0001.jpg"), fakeReader(dir), TODAY);
    expect(a.needsReview).toBe(false);
  });
});
