// Database access. Plain Postgres SQL, two backends:
// - DATABASE_URL set → node-postgres (Supabase's Postgres in production)
// - otherwise → PGlite, an in-process Postgres for development and tests,
//   loaded with the same migrations and seed data. BONNETJE_DB=memory keeps it
//   in memory (fresh on every start); otherwise it lives in .data/pglite.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Queryable = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

export type Db = Queryable & {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
};

const NUMERIC = 1700;
const DATE = 1082;
// numeric columns hold measures (2.5 L) with at most 3 decimals: safe as JS numbers.
// dates stay "YYYY-MM-DD" strings so time zones can't shift them.
const parsers = {
  [NUMERIC]: (v: string) => parseFloat(v),
  [DATE]: (v: string) => v,
};

const supabaseDir = join(process.cwd(), "supabase");

function schemaSql(): string[] {
  const dir = join(supabaseDir, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return files.map((f) => readFileSync(join(dir, f), "utf8"));
}

function seedSql(): string {
  return readFileSync(join(supabaseDir, "seed.sql"), "utf8");
}

type PGliteLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: { query: PGliteLike["query"] }) => Promise<T>): Promise<T>;
  dumpDataDir(): Promise<Blob>;
};

async function openPglite(dataDir: string | undefined, seed: boolean, from?: Blob): Promise<PGliteLike> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite({ dataDir, parsers, loadDataDir: from }) as unknown as PGliteLike;
  const existing = await pg.query<{ t: string | null }>("select to_regclass('public.jobs')::text as t");
  if (!existing.rows[0].t) {
    for (const sql of schemaSql()) await pg.exec(sql);
    if (seed) await pg.exec(seedSql());
  }
  return pg;
}

function wrapPglite(pg: PGliteLike): Db {
  const wrap = (q: { query: PGliteLike["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      return (await q.query<T>(sql, params)).rows;
    },
  });
  return { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))) };
}

// Building the schema takes several seconds; in-memory databases start from a dump of one seeded copy.
let template: Promise<Blob> | undefined;

/**
 * A PGlite database with schema and seed data. Without dataDir it is in memory and fresh
 * each call (tests, BONNETJE_DB=memory); with dataDir it is kept on disk and seeded once.
 */
export async function createPgliteDb(opts: { dataDir?: string; seed?: boolean } = {}): Promise<Db> {
  const seed = opts.seed ?? true;
  if (opts.dataDir || !seed) return wrapPglite(await openPglite(opts.dataDir, seed));
  template ??= openPglite(undefined, true).then((pg) => pg.dumpDataDir());
  return wrapPglite(await openPglite(undefined, true, await template));
}

async function createPgDb(url: string): Promise<Db> {
  const pgMod = await import("pg");
  const { Pool, types } = pgMod.default;
  types.setTypeParser(NUMERIC, parsers[NUMERIC]);
  types.setTypeParser(DATE, parsers[DATE]);
  const pool = new Pool({ connectionString: url });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params)).rows as T[];
          },
        });
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

// One instance per server process, kept across dev hot reloads.
const g = globalThis as unknown as { __bonnetjeDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__bonnetjeDb) {
    const url = process.env.DATABASE_URL;
    g.__bonnetjeDb = url
      ? createPgDb(url)
      : createPgliteDb({
          dataDir: process.env.BONNETJE_DB === "memory" ? undefined : join(process.cwd(), ".data", "pglite"),
        });
  }
  return g.__bonnetjeDb;
}
