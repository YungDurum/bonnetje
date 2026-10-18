import { describe, expect, it } from "vitest";
import { formatDay, formatEuro, formatEuroInput, formatHalf, parseEuroInput } from "../format";

describe("formatEuro", () => {
  it("formats integer cents like the prototype", () => {
    expect(formatEuro(41891)).toBe("€418.91");
    expect(formatEuro(1234)).toBe("€12.34");
    expect(formatEuro(5)).toBe("€0.05");
    expect(formatEuro(0)).toBe("€0.00");
    expect(formatEuro(100)).toBe("€1.00");
  });
  it("has no thousands separator", () => {
    expect(formatEuro(123456)).toBe("€1234.56");
    expect(formatEuro(125321)).toBe("€1253.21");
  });
  it("handles negatives and rejects non-integers", () => {
    expect(formatEuro(-250)).toBe("−€2.50");
    expect(formatEuro(-5)).toBe("−€0.05");
    expect(() => formatEuro(12.5)).toThrow();
  });
});

describe("formatHalf", () => {
  it("hours", () => {
    expect(formatHalf(0, "hour")).toBe("0 h");
    expect(formatHalf(1, "hour")).toBe("0.5 h");
    expect(formatHalf(9, "hour")).toBe("4.5 h");
    expect(formatHalf(12, "hour")).toBe("6 h");
  });
  it("days, singular only for exactly 1", () => {
    expect(formatHalf(0, "day")).toBe("0 days");
    expect(formatHalf(1, "day")).toBe("0.5 days");
    expect(formatHalf(2, "day")).toBe("1 day");
    expect(formatHalf(3, "day")).toBe("1.5 days");
    expect(formatHalf(4, "day")).toBe("2 days");
  });
  it("rejects bad input", () => {
    expect(() => formatHalf(-1, "hour")).toThrow();
    expect(() => formatHalf(1.5, "day")).toThrow();
  });
});

describe("parseEuroInput", () => {
  it("accepts comma and dot", () => {
    expect(parseEuroInput("62,50")).toBe(6250);
    expect(parseEuroInput("62.50")).toBe(6250);
    expect(parseEuroInput(" 62.5 ")).toBe(6250);
    expect(parseEuroInput("62")).toBe(6200);
    expect(parseEuroInput("0")).toBe(0);
    expect(parseEuroInput("0.05")).toBe(5);
    expect(parseEuroInput("450")).toBe(45000);
  });
  it("rejects everything else", () => {
    for (const bad of ["", "abc", "-5", "62.505", "1.000,50", "6 2", "€62", "62,"]) {
      expect(parseEuroInput(bad)).toBeNull();
    }
  });
});

describe("formatEuroInput / formatDay", () => {
  it("rate field text", () => {
    expect(formatEuroInput(6250)).toBe("62.50");
    expect(formatEuroInput(45000)).toBe("450.00");
  });
  it("short day", () => {
    expect(formatDay("2026-10-16")).toBe("Fri 16 Oct");
    expect(formatDay("2026-01-05")).toBe("Mon 5 Jan");
  });
});
