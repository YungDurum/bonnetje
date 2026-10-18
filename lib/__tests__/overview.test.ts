import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { getOverview } from "../db/overview";

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe("getOverview (seed data)", () => {
  it("counts stock items and their value", async () => {
    const o = await getOverview(db, "2026-10-18");
    expect(o.stock).toEqual({ count: 4, valueCents: 620 + 1180 + 1440 + 1390 });
  });

  it("sums this quarter's receipts", async () => {
    const o = await getOverview(db, "2026-10-18");
    expect(o.expenses).toEqual({
      quarterLabel: "Q4 2026",
      count: 5,
      totalCents: 7840 + 7570 + 16840 + 40190 + 4798,
      notInMoneybird: 1,
    });
  });

  it("another quarter has no receipts", async () => {
    const o = await getOverview(db, "2026-07-01");
    expect(o.expenses).toEqual({ quarterLabel: "Q3 2026", count: 0, totalCents: 0, notInMoneybird: 0 });
  });

  it("works on an empty database", async () => {
    const empty = await createPgliteDb({ seed: false });
    const o = await getOverview(empty, "2026-10-18");
    expect(o.stock).toEqual({ count: 0, valueCents: 0 });
    expect(o.expenses.count).toBe(0);
  });
});
