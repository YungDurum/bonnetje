// Sending a job's invoice and receipts to Moneybird.
//
// Invoice: build it from what is still to invoice, store it as 'pending' (with the exact
// payload), make sure the job has a Moneybird contact + project, create the invoice, then
// send it. Only when Moneybird has it are the materials marked billed and the logged time
// taken off. A failure leaves status 'failed' with the reason; a retry sends the stored
// payload again and skips steps that already succeeded.
import { buildInvoice, type InvoiceLine } from "../invoice";
import type { Cents } from "../money";
import { MoneybirdError, type Moneybird } from "../moneybird";
import type { Db, Queryable } from "./client";
import { getJob } from "./jobs";

export type InvoicePayload = {
  reference: string;
  lines: InvoiceLine[];
  entryIds: string[];
  labour: { mode: "hour" | "day"; half: number };
};

export type InvoiceRecord = {
  id: string;
  jobId: string;
  status: "pending" | "sent" | "failed";
  subtotalCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
  payload: InvoicePayload;
  moneybirdId: string | null;
  error: string | null;
};

export type SendResult = { ok: true; invoice: InvoiceRecord } | { ok: false; error: string; invoice: InvoiceRecord | null };

type InvoiceRow = {
  id: string;
  job_id: string;
  status: InvoiceRecord["status"];
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  payload: InvoicePayload | string;
  moneybird_id: string | null;
  moneybird_sent: boolean;
  error: string | null;
};

function toRecord(r: InvoiceRow): InvoiceRecord {
  return {
    id: r.id,
    jobId: r.job_id,
    status: r.status,
    subtotalCents: r.subtotal_cents,
    vatCents: r.vat_cents,
    totalCents: r.total_cents,
    payload: typeof r.payload === "string" ? (JSON.parse(r.payload) as InvoicePayload) : r.payload,
    moneybirdId: r.moneybird_id,
    error: r.error,
  };
}

const invoiceColumns = "id, job_id, status, subtotal_cents, vat_cents, total_cents, payload, moneybird_id, moneybird_sent, error";

/** The unfinished (pending or failed) invoice for a job, if any. */
export async function openInvoice(db: Queryable, jobId: string): Promise<InvoiceRecord | null> {
  const [r] = await db.query<InvoiceRow>(`select ${invoiceColumns} from invoices where job_id = $1 and status <> 'sent'`, [jobId]);
  return r ? toRecord(r) : null;
}

/** Create the Moneybird contact and project for a job if it doesn't have them yet. */
export async function ensureMoneybirdJob(db: Queryable, mb: Moneybird, jobId: string): Promise<{ contactId: string; projectId: string }> {
  const [j] = await db.query<{ client: string; title: string; address: string; moneybird_contact_id: string | null; moneybird_project_id: string | null }>(
    "select client, title, address, moneybird_contact_id, moneybird_project_id from jobs where id = $1",
    [jobId],
  );
  if (!j) throw new Error("Job not found");
  let contactId = j.moneybird_contact_id;
  if (!contactId) {
    contactId = (await mb.createContact({ companyName: j.client, address: j.address })).id;
    await db.query("update jobs set moneybird_contact_id = $2 where id = $1", [jobId, contactId]);
  }
  let projectId = j.moneybird_project_id;
  if (!projectId) {
    projectId = (await mb.createProject({ name: `${j.client} — ${j.title}` })).id;
    await db.query("update jobs set moneybird_project_id = $2 where id = $1", [jobId, projectId]);
  }
  return { contactId, projectId };
}

function reasonOf(e: unknown): string {
  if (e instanceof MoneybirdError) return e.message;
  return `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
}

/** Build the invoice and keep it as 'pending', or return the unfinished one to retry. */
async function preparedInvoice(db: Db, jobId: string): Promise<{ invoice: InvoiceRecord } | { problem: string }> {
  return db.transaction(async (tx) => {
    // serialise sends for one job
    await tx.query("select id from jobs where id = $1 for update", [jobId]);
    const existing = await openInvoice(tx, jobId);
    if (existing) return { invoice: existing };

    const job = await getJob(tx, jobId);
    if (!job) return { problem: "Job not found" };
    if (job.toInvoice.total === 0) return { problem: "Nothing to invoice on this job" };

    const draft = buildInvoice(job.open, job.toInvoice, job.labour, job.markupPct);
    const [{ n }] = await tx.query<{ n: number }>("select count(*)::int + 1 as n from invoices");
    const payload: InvoicePayload = {
      reference: `${job.title} · ${new Date().getFullYear()}-${String(n).padStart(4, "0")}`,
      lines: draft.lines,
      entryIds: draft.entryIds,
      labour: {
        mode: job.labour.mode,
        half: job.toInvoice.labour > 0 ? (job.labour.mode === "hour" ? job.labour.hoursHalf : job.labour.daysHalf) : 0,
      },
    };
    const [row] = await tx.query<InvoiceRow>(
      `insert into invoices (job_id, subtotal_cents, vat_cents, total_cents, payload)
       values ($1, $2, $3, $4, $5) returning ${invoiceColumns}`,
      [jobId, draft.totals.subtotal, draft.totals.vat, draft.totals.total, JSON.stringify(payload)],
    );
    return { invoice: toRecord(row) };
  });
}

export async function sendJobInvoice(db: Db, mb: Moneybird, jobId: string): Promise<SendResult> {
  const prepared = await preparedInvoice(db, jobId);
  if ("problem" in prepared) return { ok: false, error: prepared.problem, invoice: null };
  const inv = prepared.invoice;

  const fail = async (e: unknown): Promise<SendResult> => {
    const error = reasonOf(e);
    await db.query("update invoices set status = 'failed', error = $2 where id = $1", [inv.id, error]);
    return { ok: false, error, invoice: { ...inv, status: "failed", error } };
  };

  try {
    const { contactId, projectId } = await ensureMoneybirdJob(db, mb, jobId);
    let mbId = inv.moneybirdId;
    if (!mbId) {
      mbId = (
        await mb.createSalesInvoice({
          contactId,
          projectId,
          reference: inv.payload.reference,
          lines: inv.payload.lines.map((l) => ({ description: l.description, priceCents: l.exclCents, vatRate: 21 })),
        })
      ).id;
      await db.query("update invoices set moneybird_id = $2 where id = $1", [inv.id, mbId]);
    }
    const [{ moneybird_sent }] = await db.query<{ moneybird_sent: boolean }>("select moneybird_sent from invoices where id = $1", [inv.id]);
    if (!moneybird_sent) {
      await mb.sendSalesInvoice(mbId);
      await db.query("update invoices set moneybird_sent = true where id = $1", [inv.id]);
    }
  } catch (e) {
    return fail(e);
  }

  // In Moneybird: mark what it billed and take the billed time off.
  const done = await db.transaction(async (tx) => {
    await tx.query(
      `update material_entries set billed = true, billed_at = now(), invoice_id = $2
        where id = any($1::uuid[]) and not billed`,
      [inv.payload.entryIds, inv.id],
    );
    const col = inv.payload.labour.mode === "hour" ? "hours_half" : "days_half";
    await tx.query(`update jobs set ${col} = greatest(0, ${col} - $2) where id = $1`, [jobId, inv.payload.labour.half]);
    const [row] = await tx.query<InvoiceRow>(
      `update invoices set status = 'sent', sent_at = now(), error = null where id = $1 returning ${invoiceColumns}`,
      [inv.id],
    );
    return toRecord(row);
  });
  return { ok: true, invoice: done };
}

// ---------- receipts ----------

type ReceiptLineRow = {
  name: string;
  qty: number;
  unit_price_cents: number;
  line_cents: number;
  vat_rate: 0 | 9 | 21;
  jobs: string | null; // "de Vries, Bakker"
  project_id: string | null; // only when the whole line went to one job
};

/**
 * The full receipt goes to Moneybird as a business cost, whatever was split. The job names are
 * in each line's description; project_id is set when a line went to exactly one job.
 * `readFile` loads the original (photo/PDF) for the attachment.
 */
export async function sendReceipt(
  db: Db,
  mb: Moneybird,
  receiptId: string,
  readFile: (path: string) => Promise<{ name: string; type: string; data: Uint8Array } | null> = async () => null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await db.query<{
    supplier: string;
    receipt_date: string;
    moneybird_status: string;
    moneybird_id: string | null;
    moneybird_attached: boolean;
    file_path: string | null;
  }>(
    "select supplier, receipt_date, moneybird_status, moneybird_id, moneybird_attached, file_path from receipts where id = $1",
    [receiptId],
  );
  if (!r) return { ok: false, error: "Receipt not found" };
  if (r.moneybird_status === "sent") return { ok: true };

  const lines = await db.query<ReceiptLineRow>(
    `select l.name, l.qty, l.unit_price_cents, l.line_cents, l.vat_rate,
            string_agg(j.short_name, ', ' order by a.position) as jobs,
            case when count(distinct a.job_id) = 1 then max(j.moneybird_project_id) end as project_id
       from receipt_lines l
       left join allocations a on a.line_id = l.id
       left join jobs j on j.id = a.job_id
      where l.receipt_id = $1
      group by l.id
      order by l.position`,
    [receiptId],
  );

  try {
    let mbId = r.moneybird_id;
    if (!mbId) {
      mbId = (
        await mb.createReceipt({
          reference: `${r.supplier} ${r.receipt_date}`,
          date: r.receipt_date,
          lines: lines.map((l) => ({
            description: `${l.qty !== 1 ? `${l.qty} × ` : ""}${l.name}${l.jobs ? ` → ${l.jobs}` : ""}`,
            priceCents: l.line_cents,
            vatRate: l.vat_rate,
            projectId: l.project_id,
          })),
        })
      ).id;
      await db.query("update receipts set moneybird_id = $2 where id = $1", [receiptId, mbId]);
    }
    if (r.file_path && !r.moneybird_attached) {
      const file = await readFile(r.file_path);
      if (!file) throw new Error(`the original file ${r.file_path} is missing`);
      await mb.addReceiptAttachment(mbId, file);
      await db.query("update receipts set moneybird_attached = true where id = $1", [receiptId]);
    }
    await db.query("update receipts set moneybird_status = 'sent', moneybird_error = null where id = $1", [receiptId]);
    return { ok: true };
  } catch (e) {
    const error = reasonOf(e);
    await db.query("update receipts set moneybird_error = $2 where id = $1", [receiptId, error]);
    return { ok: false, error };
  }
}
