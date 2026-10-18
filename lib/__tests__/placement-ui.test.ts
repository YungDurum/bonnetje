import { describe, expect, it } from "vitest";
import { computePlacement, emptyChoice, type PlaceLine } from "../placement";
import { convertChoice, parseValue, partLabel, summaryText } from "../placement-ui";

const cable: PlaceLine = { id: "c", name: "Cable", lineCents: 8900, measure: 100, unit: "m", vatRate: 21 };
const J1 = "j1";
const J2 = "j2";
const short = (id: string) => (id === J1 ? "de Vries" : "Bakker");

describe("placement-ui", () => {
  it("parses typed values with comma or dot", () => {
    expect(parseValue("measure", "2,5")).toBe(2.5);
    expect(parseValue("measure", "30")).toBe(30);
    expect(parseValue("measure", "")).toBe(0);
    expect(parseValue("measure", "abc")).toBeNull();
    expect(parseValue("euro", "26,70")).toBe(2670);
    expect(parseValue("euro", "1.234")).toBeNull();
  });

  it("labels parts", () => {
    expect(partLabel(0.75)).toBe("¾");
    expect(partLabel(1)).toBe("All");
  });

  it("summarises a split with leftover in stock", () => {
    const choice = { ...emptyChoice(cable), placed: true, rows: [{ jobId: J1, value: 30 }, { jobId: J2, value: 20 }] };
    const p = computePlacement([cable], [choice]);
    expect(summaryText(cable, choice, p.lines[0], short)).toBe("30 m → de Vries · 20 m → Bakker · 50 m → stock");
  });

  it("converts measure to euros and back without losing the amounts", () => {
    const choice = { ...emptyChoice(cable), rows: [{ jobId: J1, value: 30 }, { jobId: J2, value: 20 }] };
    const out = computePlacement([cable], [choice]).lines[0];
    const euro = convertChoice(cable, out, choice, "euro");
    expect(euro.rows.map((r) => r.value)).toEqual([2670, 1780]);
    const out2 = computePlacement([cable], [euro]).lines[0];
    const back = convertChoice(cable, out2, euro, "measure");
    expect(back.rows.map((r) => r.value)).toEqual([30, 20]);
  });

  it("clears values when converting an over-assigned line", () => {
    const choice = { ...emptyChoice(cable), rows: [{ jobId: J1, value: 120 }] };
    const out = computePlacement([cable], [choice]).lines[0];
    expect(convertChoice(cable, out, choice, "euro").rows[0].value).toBe(0);
  });
});
