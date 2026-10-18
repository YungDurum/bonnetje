import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { getJob } from "../db/jobs";
import { createReceipt, getReceipt, saveReceiptPlacement, toPlaceLines } from "../db/receipts";
import { emptyChoice, wholeLineChoice, type LineChoice } from "../placement";
import { SAMPLE_RECEIPTS } from "../samples";

const DE_VRIES = "10000000-0000-0000-0000-000000000001";
const BAKKER = "10000000-0000-0000-0000-000000000002";
const TU = SAMPLE_RECEIPTS[1]; // cable 100 m, 2 sockets, junction boxes

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
});

async function count(table: string): Promise<number> {
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return n;
}

describe("samples", () => {
  it("every sample adds up and is stored as-is", async () => {
    for (const s of SAMPLE_RECEIPTS) {
      const id = await createReceipt(db, s);
      const r = (await getReceipt(db, id))!;
      expect(r.needsReview).toBe(false);
      expect(r.lines.reduce((a, l) => a + l.lineCents, 0)).toBe(s.totalCents);
      expect(r.placed).toBe(false);
    }
    expect(SAMPLE_RECEIPTS[1].totalCents).toBe(8900 + 1290 + 780);
  });
});

describe("createReceipt", () => {
  it("flags a receipt whose lines don't add up to the total", async () => {
    const id = await createReceipt(db, { ...TU, totalCents: TU.totalCents + 1 });
    expect((await getReceipt(db, id))!.needsReview).toBe(true);
  });
  it("keeps an unknown measure unknown", async () => {
    const id = await createReceipt(db, SAMPLE_RECEIPTS[5]);
    expect((await getReceipt(db, id))!.lines[0]).toMatchObject({ measure: null, unit: null });
  });
  it("validates", async () => {
    await expect(createReceipt(db, { ...TU, supplier: " " })).rejects.toThrow("Supplier");
    await expect(createReceipt(db, { ...TU, date: "18 Oct" })).rejects.toThrow("Date");
    await expect(createReceipt(db, { ...TU, lines: [] })).rejects.toThrow("line");
  });
});

describe("saveReceiptPlacement", () => {
  it("splits the cable over two jobs, rest to stock, and updates To invoice", async () => {
    const id = await createReceipt(db, TU);
    const r = (await getReceipt(db, id))!;
    const [cable, sockets, boxes] = toPlaceLines(r);
    const before = (await getJob(db, DE_VRIES))!.toInvoice.materialsExcl;
    const choices: LineChoice[] = [
      { kind: "measure", rows: [{ jobId: DE_VRIES, value: 30 }, { jobId: BAKKER, value: 20 }], leftover: "stock", placed: true },
      wholeLineChoice(sockets, BAKKER),
      { kind: "measure", rows: [], leftover: "stock", placed: true }, // junction boxes all to stock
    ];
    expect(cable.measure).toBe(100);
    expect(boxes.measure).toBe(10);

    const p = await saveReceiptPlacement(db, id, choices);
    expect(p.jobs.map((j) => [j.jobId, j.cents])).toEqual([
      [DE_VRIES, 2670],
      [BAKKER, 1780 + 1290],
    ]);

    const saved = (await getReceipt(db, id))!;
    expect(saved.placed).toBe(true);
    expect(saved.moneybirdStatus).toBe("pending");

    const dv = (await getJob(db, DE_VRIES))!;
    expect(dv.open[0]).toMatchObject({ label: "Technische Unie", cents: 2670, isNew: true });
    expect(dv.open[0].lines).toEqual([{ name: cable.name, detail: "30 of 100 m", cents: 2670, vatRate: 21 }]);
    expect(dv.toInvoice.materialsExcl).toBe(before + 2207); // 2670 / 1.21

    const stock = await db.query<{ name: string; qty: number; unit: string; original_qty: number; value_cents: number; origin: string }>(
      "select name, qty, unit, original_qty, value_cents, origin from stock_items where source_line_id is not null and origin = 'Technische Unie' order by name",
    );
    expect(stock).toEqual([
      { name: cable.name, qty: 50, unit: "m", original_qty: 100, value_cents: 4450, origin: "Technische Unie" },
      { name: boxes.name, qty: 10, unit: "pcs", original_qty: 10, value_cents: 780, origin: "Technische Unie" },
    ]);
    const allocs = await db.query<{ cents: number }>(
      "select a.cents from allocations a join receipt_lines l on l.id = a.line_id where l.receipt_id = $1 order by l.position, a.position",
      [id],
    );
    expect(allocs.map((a) => a.cents)).toEqual([2670, 1780, 1290]);
  });

  it("refuses to save twice", async () => {
    const id = await createReceipt(db, TU);
    const lines = toPlaceLines((await getReceipt(db, id))!);
    const all = lines.map((l) => wholeLineChoice(l, BAKKER));
    await saveReceiptPlacement(db, id, all);
    await expect(saveReceiptPlacement(db, id, all)).rejects.toThrow("already been saved");
    expect(await count("material_entries")).toBe(5);
  });

  it("refuses unplaced or over-assigned lines and writes nothing", async () => {
    const id = await createReceipt(db, TU);
    const lines = toPlaceLines((await getReceipt(db, id))!);
    const entries = await count("material_entries");
    await expect(saveReceiptPlacement(db, id, [wholeLineChoice(lines[0], BAKKER), emptyChoice(lines[1]), wholeLineChoice(lines[2], BAKKER)])).rejects.toThrow(
      "Every item",
    );
    await expect(
      saveReceiptPlacement(db, id, [
        { kind: "measure", rows: [{ jobId: BAKKER, value: 101 }], leftover: "stock", placed: true },
        wholeLineChoice(lines[1], BAKKER),
        wholeLineChoice(lines[2], BAKKER),
      ]),
    ).rejects.toThrow("Too much");
    expect(await count("material_entries")).toBe(entries);
    expect((await getReceipt(db, id))!.placed).toBe(false);
  });

  it("refuses unknown jobs, a wrong number of choices, and receipts that need review", async () => {
    const id = await createReceipt(db, TU);
    const lines = toPlaceLines((await getReceipt(db, id))!);
    const ghost = "10000000-0000-0000-0000-000000000099";
    await expect(saveReceiptPlacement(db, id, lines.map((l) => wholeLineChoice(l, ghost)))).rejects.toThrow("no longer exists");
    await expect(saveReceiptPlacement(db, id, [wholeLineChoice(lines[0], BAKKER)])).rejects.toThrow("one choice per line");
    const bad = await createReceipt(db, { ...TU, totalCents: 1 });
    await expect(
      saveReceiptPlacement(db, bad, toPlaceLines((await getReceipt(db, bad))!).map((l) => wholeLineChoice(l, BAKKER))),
    ).rejects.toThrow("Check this receipt");
  });

  it("rolls back everything when a write fails halfway", async () => {
    const id = await createReceipt(db, TU);
    const lines = toPlaceLines((await getReceipt(db, id))!);
    // make stock inserts fail
    await db.query("alter table stock_items add constraint no_stock check (false) not valid");
    const entries = await count("material_entries");
    await expect(
      saveReceiptPlacement(db, id, [{ kind: "measure", rows: [{ jobId: BAKKER, value: 50 }], leftover: "stock", placed: true }, wholeLineChoice(lines[1], BAKKER), wholeLineChoice(lines[2], BAKKER)]),
    ).rejects.toThrow();
    expect(await count("material_entries")).toBe(entries);
    expect(await count("allocations")).toBe(10);
    expect((await getReceipt(db, id))!.lines.some((l) => l.placed)).toBe(false);
  });
});
