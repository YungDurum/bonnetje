// Jobs, their materials and labour. Totals come from lib/money.ts only.
import {
  toInvoice,
  type Cents,
  type Labour,
  type LabourMode,
  type Material,
  type ToInvoice,
  type VatRate,
} from "../money";
import type { Db, Queryable } from "./client";

export type Settings = {
  markupPct: number;
  defaultHourRateCents: Cents;
  defaultDayRateCents: Cents;
};

export type Job = {
  id: string;
  client: string;
  shortName: string;
  title: string;
  address: string;
  labour: Labour;
};

export type MaterialEntryLine = { name: string; detail: string; cents: Cents; vatRate: VatRate };

export type MaterialEntry = {
  id: string;
  origin: "receipt" | "stock" | "manual";
  label: string;
  date: string; // YYYY-MM-DD
  cents: Cents; // incl. VAT
  billed: boolean;
  isNew: boolean;
  lines: MaterialEntryLine[];
};

export type JobStatus = "to_invoice" | "invoiced" | "nothing";

export type JobSummary = Job & {
  toInvoice: ToInvoice;
  status: JobStatus;
};

export type JobDetail = JobSummary & {
  open: MaterialEntry[];
  billed: MaterialEntry[];
  markupPct: number;
};

type JobRow = {
  id: string;
  client: string;
  short_name: string;
  title: string;
  address: string;
  labour_mode: LabourMode;
  hour_rate_cents: number;
  day_rate_cents: number;
  hours_half: number;
  days_half: number;
};

type EntryRow = {
  id: string;
  job_id: string;
  origin: MaterialEntry["origin"];
  label: string;
  entry_date: string;
  cents: number;
  billed: boolean;
  is_new: boolean;
  line_name: string | null;
  line_detail: string | null;
  line_cents: number | null;
  line_vat: number | null;
};

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    client: r.client,
    shortName: r.short_name,
    title: r.title,
    address: r.address,
    labour: {
      mode: r.labour_mode,
      hoursHalf: r.hours_half,
      daysHalf: r.days_half,
      hourRateCents: r.hour_rate_cents,
      dayRateCents: r.day_rate_cents,
    },
  };
}

export async function getSettings(db: Queryable): Promise<Settings> {
  const [s] = await db.query<{ markup_pct: number; default_hour_rate_cents: number; default_day_rate_cents: number }>(
    "select markup_pct, default_hour_rate_cents, default_day_rate_cents from settings where id = 1",
  );
  // A fresh database without seed data still works with the defaults.
  return s
    ? {
        markupPct: s.markup_pct,
        defaultHourRateCents: s.default_hour_rate_cents,
        defaultDayRateCents: s.default_day_rate_cents,
      }
    : { markupPct: 15, defaultHourRateCents: 6250, defaultDayRateCents: 45000 };
}

const jobColumns =
  "id, client, short_name, title, address, labour_mode, hour_rate_cents, day_rate_cents, hours_half, days_half";

async function entriesFor(db: Queryable, jobId?: string): Promise<Map<string, MaterialEntry[]>> {
  // "New" = added today and not billed yet: the green dot on the job page.
  const rows = await db.query<EntryRow>(
    `select e.id, e.job_id, e.origin, e.label, e.entry_date, e.cents, e.billed,
            (not e.billed and e.entry_date = current_date) as is_new,
            l.name as line_name, l.detail as line_detail, l.cents as line_cents, l.vat_rate as line_vat
       from material_entries e
       left join material_entry_lines l on l.entry_id = e.id
      where ($1::uuid is null or e.job_id = $1::uuid)
      order by e.entry_date, e.created_at, e.id, l.position`,
    [jobId ?? null],
  );
  const byJob = new Map<string, MaterialEntry[]>();
  const byId = new Map<string, MaterialEntry>();
  for (const r of rows) {
    let e = byId.get(r.id);
    if (!e) {
      e = {
        id: r.id,
        origin: r.origin,
        label: r.label,
        date: r.entry_date,
        cents: r.cents,
        billed: r.billed,
        isNew: r.is_new,
        lines: [],
      };
      byId.set(r.id, e);
      const list = byJob.get(r.job_id) ?? [];
      list.push(e);
      byJob.set(r.job_id, list);
    }
    if (r.line_name !== null) {
      e.lines.push({ name: r.line_name, detail: r.line_detail ?? "", cents: r.line_cents!, vatRate: r.line_vat as VatRate });
    }
  }
  return byJob;
}

function asMaterials(entries: MaterialEntry[]): Material[] {
  // An entry without item lines still counts, at 21%.
  return entries.map((e) => ({
    billed: e.billed,
    lines: e.lines.length ? e.lines : [{ cents: e.cents, vatRate: 21 }],
  }));
}

function summarise(job: Job, entries: MaterialEntry[], markupPct: number): JobSummary {
  const t = toInvoice(asMaterials(entries), markupPct, job.labour);
  const status: JobStatus = t.total > 0 ? "to_invoice" : entries.some((e) => e.billed) ? "invoiced" : "nothing";
  return { ...job, toInvoice: t, status };
}

/** Home: every job with what is still to invoice, highest first. */
export async function listJobs(db: Queryable): Promise<JobSummary[]> {
  const settings = await getSettings(db);
  const jobs = (await db.query<JobRow>(`select ${jobColumns} from jobs order by created_at, id`)).map(toJob);
  const entries = await entriesFor(db);
  return sortForHome(jobs.map((j) => summarise(j, entries.get(j.id) ?? [], settings.markupPct)));
}

/** Highest "To invoice" first; ties keep their order (oldest job first). */
export function sortForHome(jobs: JobSummary[]): JobSummary[] {
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => b.j.toInvoice.total - a.j.toInvoice.total || a.i - b.i)
    .map((x) => x.j);
}

export type HomeTotals = { materials: Cents; labour: Cents; total: Cents };

/** "Not invoiced yet": materials (incl. markup) · labour, excl. VAT. */
export function homeTotals(jobs: JobSummary[]): HomeTotals {
  let materials = 0;
  let labour = 0;
  for (const j of jobs) {
    materials += j.toInvoice.materialsExcl + j.toInvoice.markup;
    labour += j.toInvoice.labour;
  }
  return { materials, labour, total: materials + labour };
}

export async function getJob(db: Queryable, id: string): Promise<JobDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.query<JobRow>(`select ${jobColumns} from jobs where id = $1`, [id]);
  if (!row) return null;
  const settings = await getSettings(db);
  const entries = (await entriesFor(db, id)).get(id) ?? [];
  return {
    ...summarise(toJob(row), entries, settings.markupPct),
    // newest first, like the prototype
    open: entries.filter((e) => !e.billed).reverse(),
    billed: entries.filter((e) => e.billed).reverse(),
    markupPct: settings.markupPct,
  };
}

export type NewJob = {
  client: string;
  title: string;
  address: string;
  mode: LabourMode;
  rateCents: Cents;
};

export async function createJob(db: Db, input: NewJob): Promise<string> {
  const client = input.client.trim();
  const title = input.title.trim();
  if (!client) throw new Error("Client is required");
  if (!title) throw new Error("Job is required");
  if (!Number.isSafeInteger(input.rateCents) || input.rateCents < 0) throw new Error("Rate must be 0 or more");
  const s = await getSettings(db);
  const hour = input.mode === "hour" ? input.rateCents : s.defaultHourRateCents;
  const day = input.mode === "day" ? input.rateCents : s.defaultDayRateCents;
  // Short name for compact lists: drop a leading "Fam." / initials, e.g. "Fam. de Vries" → "de Vries".
  const short = client.replace(/^(fam\.?|[A-Z]\.)\s+/i, "") || client;
  const [r] = await db.query<{ id: string }>(
    `insert into jobs (client, short_name, title, address, labour_mode, hour_rate_cents, day_rate_cents)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [client, short, title, input.address.trim(), input.mode, hour, day],
  );
  return r.id;
}

export type LabourUpdate = { mode: LabourMode; rateCents: Cents; half: number };

/** Labour sheet: switch hourly/day rate, set that mode's rate and amount (in half steps). */
export async function setLabour(db: Queryable, id: string, u: LabourUpdate): Promise<void> {
  if (!Number.isSafeInteger(u.rateCents) || u.rateCents < 0) throw new Error("Rate must be 0 or more");
  if (!Number.isSafeInteger(u.half) || u.half < 0) throw new Error("Time must be 0 or more, in ½ steps");
  const [rateCol, halfCol] =
    u.mode === "hour" ? ["hour_rate_cents", "hours_half"] : ["day_rate_cents", "days_half"];
  const done = await db.query<{ id: string }>(
    `update jobs set labour_mode = $2, ${rateCol} = $3, ${halfCol} = $4 where id = $1 returning id`,
    [id, u.mode, u.rateCents, u.half],
  );
  if (!done.length) throw new Error("Job not found");
}
