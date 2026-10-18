import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const supabaseDir = join(process.cwd(), "supabase");
const migrationsDir = join(supabaseDir, "migrations");

let db: PGlite;

async function rows<T>(sql: string): Promise<T[]> {
  const res = await db.query<T>(sql);
  return res.rows;
}

beforeAll(async () => {
  db = new PGlite();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  await db.exec(readFileSync(join(supabaseDir, "seed.sql"), "utf8"));
});

afterAll(async () => {
  await db.close();
});

describe("schema + seed", () => {
  it("has the demo rows", async () => {
    const [jobs] = await rows<{ n: number }>("select count(*)::int as n from jobs");
    const [stock] = await rows<{ n: number }>("select count(*)::int as n from stock_items");
    const [ledger] = await rows<{ n: number }>("select count(*)::int as n from ledger");
    expect(jobs.n).toBe(3);
    expect(stock.n).toBe(4);
    expect(ledger.n).toBe(5);
  });

  it("receipt lines add up to the receipt total", async () => {
    const bad = await rows(
      `select r.id from receipts r
       join receipt_lines l on l.receipt_id = r.id
       group by r.id, r.total_cents
       having sum(l.line_cents) <> r.total_cents`,
    );
    expect(bad).toEqual([]);
    const [{ n }] = await rows<{ n: number }>(
      "select count(distinct receipt_id)::int as n from receipt_lines",
    );
    expect(n).toBe(5);
  });

  it("material entry cents equal the sum of their lines", async () => {
    const bad = await rows(
      `select e.id from material_entries e
       join material_entry_lines l on l.entry_id = e.id
       group by e.id, e.cents
       having sum(l.cents) <> e.cents`,
    );
    expect(bad).toEqual([]);
    const [{ n }] = await rows<{ n: number }>(
      "select count(distinct entry_id)::int as n from material_entry_lines",
    );
    expect(n).toBe(4);
  });

  it("unbilled material cents per job", async () => {
    const res = await rows<{ short_name: string; cents: number }>(
      `select j.short_name, coalesce(sum(e.cents), 0)::int as cents
       from jobs j left join material_entries e on e.job_id = j.id and not e.billed
       group by j.short_name`,
    );
    const by = Object.fromEntries(res.map((r) => [r.short_name, r.cents]));
    expect(by).toEqual({ "de Vries": 4620, Bakker: 16840, Jansen: 41349 });
  });

  it("rejects bad data", async () => {
    await expect(
      db.exec(
        `insert into stock_items (name, value_cents, origin) values ('x', -1, 'Added manually')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into stock_items (name, qty, unit, value_cents, origin) values ('x', 1, 'm2', 100, 'Added manually')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into allocations (line_id, job_id, position, kind, amount, cents) values
         ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 9, 'euro', 5, 500)`,
      ),
    ).rejects.toThrow();
  });
});
