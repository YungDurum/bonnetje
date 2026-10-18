import { describe, expect, it } from "vitest";
import {
  computePlacement,
  emptyChoice,
  entryDetail,
  fmtQty,
  wholeLineChoice,
  type LineChoice,
  type PlaceLine,
} from "../placement";

// Prototype sample: Technische Unie, Sun 18 Oct
const cable: PlaceLine = { id: "l1", name: "Installation cable 3×2.5 mm², 100 m", lineCents: 8900, measure: 100, unit: "m", vatRate: 21 };
const sockets: PlaceLine = { id: "l2", name: "Flush socket, double", lineCents: 1290, measure: 2, unit: "pcs", vatRate: 21 };
// Screws with no count on the receipt
const screws: PlaceLine = { id: "l3", name: "Screws 4×40", lineCents: 1895, measure: null, unit: null, vatRate: 21 };

const placed = (c: Omit<LineChoice, "placed">): LineChoice => ({ ...c, placed: true });

describe("computePlacement", () => {
  it("nothing chosen yet: everything still to place, can't save", () => {
    const p = computePlacement([cable, screws], [emptyChoice(cable), emptyChoice(screws)]);
    expect(p.stillToPlace).toBe(2);
    expect(p.canSave).toBe(false);
    expect(p.lines.map((l) => l.status)).toEqual(["todo", "todo"]);
    expect(emptyChoice(screws).kind).toBe("part");
    expect(emptyChoice(cable).kind).toBe("measure");
  });

  it("put everything on one job", () => {
    const lines = [cable, sockets, screws];
    const p = computePlacement(lines, lines.map((l) => wholeLineChoice(l, "bakker")));
    expect(p.canSave).toBe(true);
    expect(p.jobs).toEqual([
      {
        jobId: "bakker",
        cents: 8900 + 1290 + 1895,
        items: 3,
        partly: 0,
        lines: [
          { lineId: "l1", name: cable.name, detail: "", cents: 8900, vatRate: 21 },
          { lineId: "l2", name: sockets.name, detail: "", cents: 1290, vatRate: 21 },
          { lineId: "l3", name: screws.name, detail: "", cents: 1895, vatRate: 21 },
        ],
      },
    ]);
    expect(p.stock).toEqual([]);
    expect(p.allocations).toHaveLength(3);
    expect(p.allocations[2]).toEqual({ lineId: "l3", jobId: "bakker", position: 1, kind: "part", amount: 1, cents: 1895 });
  });

  it("cable split over two jobs, rest to stock", () => {
    const p = computePlacement(
      [cable],
      [placed({ kind: "measure", rows: [{ jobId: "devries", value: 30 }, { jobId: "bakker", value: 20 }], leftover: "stock" })],
    );
    expect(p.canSave).toBe(true);
    expect(p.jobs.map((j) => [j.jobId, j.cents, entryDetail(j)])).toEqual([
      ["devries", 2670, "1 item, 1 partly"],
      ["bakker", 1780, "1 item, 1 partly"],
    ]);
    expect(p.jobs[0].lines[0].detail).toBe("30 of 100 m");
    expect(p.stock).toEqual([
      { lineId: "l1", name: cable.name, qty: 50, unit: "m", originalQty: 100, valueCents: 4450, vatRate: 21 },
    ]);
    expect(p.stockCents).toBe(4450);
    expect(p.lines[0]).toMatchObject({ leftoverQty: 50, leftoverCents: 4450, stockCents: 4450, wasteCents: 0 });
  });

  it("client keeps it: leftover added to the first job's line", () => {
    const p = computePlacement(
      [cable],
      [placed({ kind: "measure", rows: [{ jobId: "devries", value: 30 }, { jobId: "bakker", value: 20 }], leftover: "client" })],
    );
    expect(p.jobs.map((j) => j.cents)).toEqual([2670 + 4450, 1780]);
    expect(p.jobs[0].lines[0].cents).toBe(7120);
    expect(p.stock).toEqual([]);
    // the allocation keeps the measured part; the leftover choice is saved on the line
    expect(p.allocations[0].cents).toBe(2670);
    expect(p.lines[0].leftover).toBe("client");
  });

  it("waste is not billed and not stocked", () => {
    const p = computePlacement([sockets], [placed({ kind: "measure", rows: [{ jobId: "jansen", value: 1 }], leftover: "waste" })]);
    expect(p.jobs[0].cents).toBe(645);
    expect(p.wasteCents).toBe(645);
    expect(p.stock).toEqual([]);
  });

  it("unknown measure, split by part: ¾ to a job, leftover in stock without a quantity", () => {
    const p = computePlacement([screws], [placed({ kind: "part", rows: [{ jobId: "devries", value: 0.75 }], leftover: "stock" })]);
    expect(p.jobs[0].lines[0]).toMatchObject({ cents: 1421, detail: "¾ of it" });
    expect(p.stock).toEqual([
      { lineId: "l3", name: screws.name, qty: null, unit: null, originalQty: null, valueCents: 474, vatRate: 21 },
    ]);
  });

  it("split by euros", () => {
    const p = computePlacement([screws], [placed({ kind: "euro", rows: [{ jobId: "devries", value: 1000 }], leftover: "stock" })]);
    expect(p.jobs[0].lines[0]).toMatchObject({ cents: 1000, detail: "€10.00 of €18.95" });
    expect(p.allocations[0]).toMatchObject({ kind: "euro", amount: null, cents: 1000 });
    expect(p.stock[0]).toMatchObject({ qty: null, valueCents: 895 });
  });

  it("euros on a line with a known measure: leftover quantity is not invented", () => {
    const p = computePlacement([cable], [placed({ kind: "euro", rows: [{ jobId: "a", value: 4450 }], leftover: "stock" })]);
    expect(p.stock[0]).toMatchObject({ qty: null, unit: null, originalQty: null, valueCents: 4450 });
  });

  it("placed with no job at all: the whole line goes to stock with its full measure", () => {
    const p = computePlacement([cable], [placed({ kind: "measure", rows: [], leftover: "stock" })]);
    expect(p.canSave).toBe(true);
    expect(p.jobs).toEqual([]);
    expect(p.stock[0]).toMatchObject({ qty: 100, originalQty: 100, valueCents: 8900 });
  });

  it("client keeps it with no job falls back to stock", () => {
    const p = computePlacement([cable], [placed({ kind: "measure", rows: [], leftover: "client" })]);
    expect(p.lines[0].leftover).toBe("stock");
    expect(p.stockCents).toBe(8900);
  });

  it("too much blocks saving and reports how much", () => {
    const p = computePlacement(
      [cable, sockets],
      [
        placed({ kind: "measure", rows: [{ jobId: "a", value: 80 }, { jobId: "b", value: 30 }], leftover: "stock" }),
        wholeLineChoice(sockets, "a"),
      ],
    );
    expect(p.tooMuch).toBe(1);
    expect(p.canSave).toBe(false);
    expect(p.lines[0]).toMatchObject({ status: "over", overBy: 10 });
    // the over line contributes nothing to what would be saved
    expect(p.jobs).toEqual([{ jobId: "a", cents: 1290, items: 1, partly: 0, lines: expect.any(Array) }]);
  });

  it("too much in euros", () => {
    const p = computePlacement([screws], [placed({ kind: "euro", rows: [{ jobId: "a", value: 2000 }], leftover: "stock" })]);
    expect(p.lines[0]).toMatchObject({ status: "over", overBy: 105 });
  });

  it("lines that are not confirmed yet don't count in the totals", () => {
    const p = computePlacement(
      [cable, sockets],
      [{ kind: "measure", rows: [{ jobId: "a", value: 50 }], leftover: "stock", placed: false }, wholeLineChoice(sockets, "a")],
    );
    expect(p.stillToPlace).toBe(1);
    expect(p.lines[0].status).toBe("todo");
    expect(p.jobs[0].cents).toBe(1290);
    expect(p.stock).toEqual([]);
  });

  it("empty rows are skipped", () => {
    const p = computePlacement(
      [cable],
      [placed({ kind: "measure", rows: [{ jobId: "a", value: 0 }, { jobId: "b", value: 100 }], leftover: "client" })],
    );
    expect(p.jobs.map((j) => j.jobId)).toEqual(["b"]);
    expect(p.allocations.map((a) => a.jobId)).toEqual(["b"]);
  });

  it("the same job on several lines makes one entry, jobs in order of appearance", () => {
    const p = computePlacement(
      [cable, sockets, screws],
      [wholeLineChoice(cable, "b"), wholeLineChoice(sockets, "a"), wholeLineChoice(screws, "b")],
    );
    expect(p.jobs.map((j) => [j.jobId, j.items])).toEqual([["b", 2], ["a", 1]]);
  });

  it("measure split on a line without a measure is a programming error", () => {
    expect(() => computePlacement([screws], [placed({ kind: "measure", rows: [{ jobId: "a", value: 1 }], leftover: "stock" })])).toThrow(
      /no measure/,
    );
  });

  it("property: jobs + stock + waste always equal the receipt total once saveable", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const modes = ["stock", "client", "waste"] as const;
    for (let n = 0; n < 500; n++) {
      const lines: PlaceLine[] = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => {
        const known = rand() < 0.6;
        return {
          id: `l${i}`, name: `item ${i}`, lineCents: Math.floor(rand() * 50000),
          measure: known ? 1 + Math.floor(rand() * 200) : null, unit: known ? "m" : null, vatRate: 21,
        };
      });
      const choices: LineChoice[] = lines.map((l) => {
        const kind = rand() < 0.3 ? "euro" : l.measure === null ? "part" : "measure";
        const total = kind === "euro" ? l.lineCents : kind === "part" ? 1 : l.measure!;
        let left = total;
        const rows = ["a", "b", "c"].slice(0, Math.floor(rand() * 4)).map((jobId) => {
          const v = kind === "part" ? Math.floor(rand() * left * 1000) / 1000 : Math.floor(rand() * (left + 1));
          left -= v;
          return { jobId, value: v };
        });
        return { kind, rows, leftover: modes[Math.floor(rand() * 3)], placed: true };
      });
      const p = computePlacement(lines, choices);
      expect(p.canSave).toBe(true);
      const jobs = p.jobs.reduce((a, j) => a + j.cents, 0);
      expect(jobs + p.stockCents + p.wasteCents).toBe(p.totalCents);
      expect(p.stock.reduce((a, s) => a + s.valueCents, 0)).toBe(p.stockCents);
      p.jobs.forEach((j) => expect(j.lines.reduce((a, l) => a + l.cents, 0)).toBe(j.cents));
    }
  });
});

describe("helpers", () => {
  it("fmtQty", () => {
    expect(fmtQty(2.5)).toBe("2.5");
    expect(fmtQty(100)).toBe("100");
    expect(fmtQty(0.333)).toBe("0.33");
  });
  it("entryDetail", () => {
    expect(entryDetail({ items: 1, partly: 0 })).toBe("1 item");
    expect(entryDetail({ items: 3, partly: 1 })).toBe("3 items, 1 partly");
  });
});
