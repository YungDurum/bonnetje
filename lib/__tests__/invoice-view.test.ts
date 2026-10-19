import { describe, expect, it } from "vitest";
import { builtFromLabel, formatInvoiceDate, hasLabourLine, NOT_CONNECTED, sendState } from "../invoice-view";

describe("invoice view helpers", () => {
  it("describes what the invoice is built from", () => {
    expect(builtFromLabel(2, 9, "hour")).toBe("2 entries and 4.5 h");
    expect(builtFromLabel(1, 0, "hour")).toBe("1 entry and no time logged");
    expect(builtFromLabel(0, 2, "day")).toBe("0 entries and 1 day");
  });
  it("formats the date with the year", () => {
    expect(formatInvoiceDate("2026-10-18")).toBe("18 Oct 2026");
  });
  it("finds the labour line", () => {
    expect(hasLabourLine([{ description: "Labour, 4.5 h × €62.50", exclCents: 1 }])).toBe(true);
    expect(hasLabourLine([{ description: "Materials — x", exclCents: 1 }])).toBe(false);
  });
  it("disables sending when Moneybird isn't connected", () => {
    expect(sendState(false)).toEqual({ canSend: false, note: NOT_CONNECTED });
    expect(sendState(true).canSend).toBe(true);
  });
});
