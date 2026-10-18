import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { createJob, getJob, homeTotals, listJobs, setLabour, sortForHome, type JobSummary } from "../db/jobs";

const DE_VRIES = "10000000-0000-0000-0000-000000000001";
const BAKKER = "10000000-0000-0000-0000-000000000002";
const JANSEN = "10000000-0000-0000-0000-000000000003";

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe("listJobs (seed data)", () => {
  it("returns every job with To invoice, highest first", async () => {
    const jobs = await listJobs(db);
    expect(jobs.map((j) => [j.client, j.toInvoice.total])).toEqual([
      ["M. Jansen", 67424], // 34173 + 5126 markup + 4.5 h × €62.50
      ["Fam. de Vries", 41891], // 3818 + 573 + 6 h
      ["Bakker & Zn", 16006], // 13918 + 2088, no hours
    ]);
    expect(jobs.every((j) => j.status === "to_invoice")).toBe(true);
  });

  it("home card: materials (with markup) · labour", async () => {
    const t = homeTotals(await listJobs(db));
    expect(t).toEqual({
      materials: 3818 + 573 + 13918 + 2088 + 34173 + 5126,
      labour: 37500 + 28125,
      total: 67424 + 41891 + 16006,
    });
  });
});

describe("job status", () => {
  it("Invoiced when everything is billed and no hours; Nothing to invoice for a new job", async () => {
    await db.query("update material_entries set billed = true, billed_at = now() where job_id = $1", [BAKKER]);
    const id = await createJob(db, { client: "Fam. Peters", title: "Leaking tap", address: "", mode: "hour", rateCents: 6250 });
    const jobs = await listJobs(db);
    const by = (jid: string) => jobs.find((j) => j.id === jid)!;
    expect(by(BAKKER).status).toBe("invoiced");
    expect(by(BAKKER).toInvoice.total).toBe(0);
    expect(by(id).status).toBe("nothing");
    // zero-amount jobs go to the bottom, oldest first
    expect(jobs.slice(-2).map((j) => j.id)).toEqual([BAKKER, id]);
  });
});

describe("getJob", () => {
  it("splits open and billed materials, newest first, with lines", async () => {
    const j = (await getJob(db, JANSEN))!;
    expect(j.open.map((e) => [e.label, e.cents])).toEqual([
      ["Praxis", 2399],
      ["Wasco", 38950],
    ]);
    expect(j.open[1].lines.map((l) => l.name)).toEqual(["Flue gas set", "Expansion vessel 18 L", "Ball valve 22 mm"]);
    expect(j.billed).toEqual([]);
    expect(j.markupPct).toBe(15);
    expect(j.toInvoice).toEqual({ materialsExcl: 34173, markup: 5126, labour: 28125, total: 67424 });
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getJob(db, "10000000-0000-0000-0000-000000000099")).toBeNull();
    expect(await getJob(db, "nope'; drop table jobs; --")).toBeNull();
  });

  it("seed entries are not marked new; a fresh entry is", async () => {
    expect((await getJob(db, DE_VRIES))!.open.every((e) => !e.isNew)).toBe(true);
    await db.query(
      `insert into material_entries (job_id, origin, label, cents) values ($1, 'manual', 'Added manually', 1210)`,
      [DE_VRIES],
    );
    const j = (await getJob(db, DE_VRIES))!;
    expect(j.open[0]).toMatchObject({ label: "Added manually", isNew: true, lines: [] });
    // an entry without lines counts at 21%: 1210 → 1000 excl.
    expect(j.toInvoice.materialsExcl).toBe(3818 + 1000);
  });
});

describe("createJob", () => {
  it("creates a job with the chosen rate and the default for the other mode", async () => {
    const id = await createJob(db, { client: " Fam. Peters ", title: "Day job", address: "Dorpsstraat 1", mode: "day", rateCents: 50000 });
    const j = (await getJob(db, id))!;
    expect(j.client).toBe("Fam. Peters");
    expect(j.shortName).toBe("Peters");
    expect(j.labour).toEqual({ mode: "day", hoursHalf: 0, daysHalf: 0, hourRateCents: 6250, dayRateCents: 50000 });
    expect(j.status).toBe("nothing");
  });

  it("requires client and job", async () => {
    await expect(createJob(db, { client: " ", title: "x", address: "", mode: "hour", rateCents: 0 })).rejects.toThrow("Client");
    await expect(createJob(db, { client: "x", title: "", address: "", mode: "hour", rateCents: 0 })).rejects.toThrow("Job");
    await expect(createJob(db, { client: "x", title: "y", address: "", mode: "hour", rateCents: 12.5 })).rejects.toThrow();
  });
});

describe("setLabour", () => {
  it("logging 2 h on a new job makes To invoice €125.00", async () => {
    const id = await createJob(db, { client: "Fam. Peters", title: "Tap", address: "", mode: "hour", rateCents: 6250 });
    await setLabour(db, id, { mode: "hour", rateCents: 6250, half: 4 });
    const j = (await getJob(db, id))!;
    expect(j.toInvoice.total).toBe(12500);
    expect(j.status).toBe("to_invoice");
  });

  it("switching to day rate keeps the logged hours for later", async () => {
    await setLabour(db, DE_VRIES, { mode: "day", rateCents: 48000, half: 3 });
    const j = (await getJob(db, DE_VRIES))!;
    expect(j.labour).toEqual({ mode: "day", hoursHalf: 12, daysHalf: 3, hourRateCents: 6250, dayRateCents: 48000 });
    expect(j.toInvoice.labour).toBe(72000); // 1.5 days × €480
  });

  it("rejects bad input and unknown jobs", async () => {
    await expect(setLabour(db, DE_VRIES, { mode: "hour", rateCents: -1, half: 0 })).rejects.toThrow();
    await expect(setLabour(db, DE_VRIES, { mode: "hour", rateCents: 6250, half: 1.5 })).rejects.toThrow();
    await expect(
      setLabour(db, "10000000-0000-0000-0000-000000000099", { mode: "hour", rateCents: 6250, half: 2 }),
    ).rejects.toThrow("not found");
  });
});

describe("sortForHome", () => {
  it("is stable for equal amounts", () => {
    const mk = (id: string, total: number) => ({ id, toInvoice: { total } }) as unknown as JobSummary;
    expect(sortForHome([mk("a", 0), mk("b", 5), mk("c", 0), mk("d", 5)]).map((j) => j.id)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("db client", () => {
  it("returns numeric columns as numbers and dates as YYYY-MM-DD", async () => {
    const [r] = await db.query<{ m: unknown; d: unknown }>(
      "select l.measure as m, r.receipt_date as d from receipt_lines l join receipts r on r.id = l.receipt_id where l.short = 'EURO95 41,2L'",
    );
    expect(r).toEqual({ m: 41.2, d: "2026-10-12" });
  });

  it("each in-memory database is separate", async () => {
    const other = await createPgliteDb();
    await db.query("delete from material_entries");
    const [{ n }] = await other.query<{ n: number }>("select count(*)::int as n from material_entries");
    expect(n).toBe(4);
  });
});
