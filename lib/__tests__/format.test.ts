import { describe, expect, it } from "vitest";
import { formatEuro } from "../format";

describe("formatEuro", () => {
  it("formats integer cents with a decimal comma", () => {
    expect(formatEuro(1234)).toBe("€ 12,34");
    expect(formatEuro(5)).toBe("€ 0,05");
    expect(formatEuro(0)).toBe("€ 0,00");
  });
  it("uses dots for thousands", () => {
    expect(formatEuro(123456)).toBe("€ 1.234,56");
  });
  it("handles negatives and rejects non-integers", () => {
    expect(formatEuro(-250)).toBe("-€ 2,50");
    expect(() => formatEuro(12.5)).toThrow();
  });
});
