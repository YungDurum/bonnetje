import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { getJob } from "../db/jobs";
import { addManualMaterial, addStock, getStockItem, listStock, removeStock, putStockOnJob } from "../db/stock";
import { manualCents, stockLeftLabel, takeFromStock } from "../stock";

const DE_VRIES = "10000000-0000-0000-0000-000000000001";
// seed: s1 PVC pipe 2 of 4 m €6.20, s2 primer 1 of 2.5 L €11.80, s3 copper elbows 12 pcs €14.40
const PVC = "40000000-0000-0000-0000-000000000001";
const ELBOWS = "40000000-0000-0000-0000-000000000003";

describe("takeFromStock", () => {
  const pipe = { qty: 2, unit: "m" as const, valueCents: 620 };
  const screws = { qty: null, unit: null, valueCents: 1895 };

  it("by amount", () => {
    expect(takeFromStock(pipe, { kind: "measure", amount: 0.5 })).toEqual({
      ok: true, cents: 155, remainingCents: 465, remainingQty: 1.5, usedUp: false, usedLabel: "0.5 m",
    });
  });
  it("all of it", () => {
    expect(takeFromStock(pipe, { kind: "measure", amount: 2 })).toMatchObject({ cents: 620, remainingCents: 0, remainingQty: 0, usedUp: true });
  });
  it("more than in stock", () => {
    expect(takeFromStock(pipe, { kind: "measure", amount: 2.5 })).toEqual({ ok: false, error: "too_much", overBy: 0.5 });
    expect(takeFromStock(pipe, { kind: "euro", cents: 621 })).toEqual({ ok: false, error: "too_much", overBy: 1 });
  });
  it("nothing chosen", () => {
    expect(takeFromStock(pipe, { kind: "measure", amount: 0 })).toMatchObject({ ok: false, error: "nothing" });
    expect(takeFromStock(screws, { kind: "part", fraction: 0 })).toMatchObject({ ok: false, error: "nothing" });
  });
  it("by part when the quantity is unknown", () => {
    expect(takeFromStock(screws, { kind: "part", fraction: 0.75 })).toEqual({
      ok: true, cents: 1421, remainingCents: 474, remainingQty: null, usedUp: false, usedLabel: "¾",
    });
    expect(takeFromStock(screws, { kind: "part", fraction: 1 })).toMatchObject({ cents: 1895, usedUp: true, usedLabel: "all" });
  });
  it("by euros shrinks a known quantity in proportion", () => {
    expect(takeFromStock(pipe, { kind: "euro", cents: 310 })).toEqual({
      ok: true, cents: 310, remainingCents: 310, remainingQty: 1, usedUp: false, usedLabel: "€3.10",
    });
    expect(takeFromStock(screws, { kind: "euro", cents: 1895 })).toMatchObject({ usedUp: true, remainingQty: null });
  });
  it("measure on an item without quantity is a programming error", () => {
    expect(() => takeFromStock(screws, { kind: "measure", amount: 1 })).toThrow();
  });
  it("labels and manual cents", () => {
    expect(stockLeftLabel(2, "m", 4)).toBe("2 of 4 m");
    expect(stockLeftLabel(12, "pcs", 12)).toBe("12 pcs");
    expect(stockLeftLabel(null, null, null)).toBeNull();
    expect(manualCents(1299, 3)).toBe(3897);
    expect(manualCents(1299, 1.5)).toBe(1949); // 1948.5 → 1949
    expect(() => manualCents(100, 0)).toThrow();
  });
});

describe("stock in the database", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createPgliteDb();
  });

  it("lists newest first and searches name and origin", async () => {
    const id = await addStock(db, { name: "Copper pipe 22 mm", qty: 3, unit: "m", valueCents: 1500 });
    const all = await listStock(db);
    expect(all).toHaveLength(5);
    expect(all[0]).toMatchObject({ id, origin: "Added manually", qty: 3, originalQty: 3 });
    expect((await listStock(db, "copper")).map((s) => s.name).sort()).toEqual(["Copper elbows 15 mm", "Copper pipe 22 mm"]);
    expect((await listStock(db, "praxis")).map((s) => s.name)).toEqual(["Sanitary silicone, white"]);
    expect(await listStock(db, "%")).toEqual([]);
  });

  it("add validates", async () => {
    await expect(addStock(db, { name: "", qty: 1, unit: "pcs", valueCents: 1 })).rejects.toThrow("what it is");
    await expect(addStock(db, { name: "x", qty: 1, unit: null, valueCents: 1 })).rejects.toThrow("unit");
    await expect(addStock(db, { name: "x", qty: 0, unit: "pcs", valueCents: 1 })).rejects.toThrow("more than 0");
    expect(await addStock(db, { name: "Leftover paint", qty: null, unit: null, valueCents: 500 })).toBeTruthy();
  });

  it("use part on a job: entry on the job, the rest stays", async () => {
    const before = (await getJob(db, DE_VRIES))!.toInvoice.materialsExcl;
    const r = await putStockOnJob(db, PVC, DE_VRIES, { kind: "measure", amount: 0.5 });
    expect(r).toMatchObject({ cents: 155, usedUp: false });
    expect(await getStockItem(db, PVC)).toMatchObject({ qty: 1.5, valueCents: 465, originalQty: 4 });
    const job = (await getJob(db, DE_VRIES))!;
    expect(job.open[0]).toMatchObject({ origin: "stock", label: "Stock", cents: 155, isNew: true });
    expect(job.open[0].lines).toEqual([{ name: "PVC pipe 32 mm", detail: "0.5 m", cents: 155, vatRate: 21 }]);
    expect(job.toInvoice.materialsExcl).toBe(before + 128); // 155 / 1.21
  });

  it("use all: the item leaves stock", async () => {
    await putStockOnJob(db, ELBOWS, DE_VRIES, { kind: "part", fraction: 1 });
    expect(await getStockItem(db, ELBOWS)).toBeNull();
    expect((await getJob(db, DE_VRIES))!.open[0]).toMatchObject({ cents: 1440 });
  });

  it("too much or a missing item/job changes nothing", async () => {
    await expect(putStockOnJob(db, PVC, DE_VRIES, { kind: "measure", amount: 3 })).rejects.toThrow("more than is in stock");
    await expect(putStockOnJob(db, PVC, "10000000-0000-0000-0000-000000000099", { kind: "measure", amount: 1 })).rejects.toThrow("Job");
    await removeStock(db, PVC);
    await expect(putStockOnJob(db, PVC, DE_VRIES, { kind: "measure", amount: 1 })).rejects.toThrow("no longer in stock");
    await expect(removeStock(db, PVC)).rejects.toThrow("no longer in stock");
    expect((await getJob(db, DE_VRIES))!.open).toHaveLength(1);
  });

  it("add manually on a job", async () => {
    const r = await addManualMaterial(db, DE_VRIES, { name: "Teflon tape", qty: 3, priceCents: 199 });
    expect(r.cents).toBe(597);
    const job = (await getJob(db, DE_VRIES))!;
    expect(job.open[0]).toMatchObject({ origin: "manual", label: "Added manually", cents: 597 });
    expect(job.open[0].lines[0]).toMatchObject({ name: "Teflon tape", detail: "3 × €1.99" });
    await expect(addManualMaterial(db, DE_VRIES, { name: "x", qty: 1, priceCents: 0 })).rejects.toThrow("Price");
    await expect(addManualMaterial(db, DE_VRIES, { name: " ", qty: 1, priceCents: 1 })).rejects.toThrow("what it is");
  });
});
