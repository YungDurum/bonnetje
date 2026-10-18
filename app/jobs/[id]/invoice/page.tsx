import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getJob } from "@/lib/db/jobs";
import { openInvoice } from "@/lib/db/invoices";
import { formatEuro } from "@/lib/format";
import { buildInvoice, type InvoiceLine } from "@/lib/invoice";
import { builtFromLabel, formatInvoiceDate, hasLabourLine, sendState } from "@/lib/invoice-view";
import { getMoneybird } from "@/lib/moneybird";
import { BackLink } from "../../../_components/BackLink";
import { CircleCheckIcon } from "../../../_components/icons";
import { SendInvoice } from "./SendInvoice";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string | string[] }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  const db = await getDb();
  const job = await getJob(db, id);
  if (!job) notFound();
  const open = await openInvoice(db, id);

  if (!open && sent === "1" && job.toInvoice.total === 0) {
    return (
      <main className="screen">
        <header className="page-head">
          <BackLink href={`/jobs/${id}`} label="Back to job" />
          <div className="page-head-text">
            <h1 className="page-title">Invoice sent</h1>
            <p className="page-sub">{job.client}</p>
          </div>
        </header>
        <div className="screen-body">
          <div className="toast" role="status">
            <CircleCheckIcon />
            <span>Invoice for {job.client} is in Moneybird</span>
          </div>
          <Link href="/" className="btn btn-outline">
            Back to jobs
          </Link>
        </div>
      </main>
    );
  }

  let lines: InvoiceLine[];
  let subtotal: number;
  let vat: number;
  let total: number;
  let builtFrom: string;
  if (open) {
    lines = open.payload.lines;
    subtotal = open.subtotalCents;
    vat = open.vatCents;
    total = open.totalCents;
    builtFrom = builtFromLabel(open.payload.entryIds.length, open.payload.labour.half, open.payload.labour.mode);
  } else if (job.toInvoice.total > 0) {
    const draft = buildInvoice(job.open, job.toInvoice, job.labour, job.markupPct);
    lines = draft.lines;
    subtotal = draft.totals.subtotal;
    vat = draft.totals.vat;
    total = draft.totals.total;
    const half = job.toInvoice.labour > 0 ? (job.labour.mode === "hour" ? job.labour.hoursHalf : job.labour.daysHalf) : 0;
    builtFrom = builtFromLabel(draft.entryIds.length, half, job.labour.mode);
  } else {
    return (
      <main className="screen">
        <header className="page-head">
          <BackLink href={`/jobs/${id}`} label="Back to job" />
          <div className="page-head-text">
            <h1 className="page-title">Invoice preview</h1>
            <p className="page-sub">{job.client}</p>
          </div>
        </header>
        <div className="screen-body">
          <p className="note">There is nothing to invoice on this job yet.</p>
          <Link href={`/jobs/${id}`} className="btn btn-outline">
            Back to job
          </Link>
        </div>
      </main>
    );
  }

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const connected = (await getMoneybird().catch(() => null)) !== null;
  const state = sendState(connected);
  const failed = open?.status === "failed" ? open.error : null;

  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href={`/jobs/${id}`} label="Back to job" />
        <div className="page-head-text">
          <h1 className="page-title">Invoice preview</h1>
          <p className="page-sub">Built from {builtFrom}</p>
        </div>
      </header>

      <div className="screen-body invoice-body">
        <article className="invoice-sheet" aria-label="Invoice">
          <div>
            <h2 className="invoice-title">Invoice</h2>
            <span className="invoice-meta">Draft · {formatInvoiceDate(iso)}</span>
          </div>
          <div className="invoice-bill">
            <span className="invoice-label">Bill to</span>
            <strong>{job.client}</strong>
            {job.address ? <span>{job.address}</span> : null}
            <span>Re: {job.title}</span>
          </div>
          <div className="invoice-lines">
            {lines.map((l, i) => (
              <div key={i} className="invoice-row">
                <span>{l.description}</span>
                <span className="amount">{formatEuro(l.exclCents)}</span>
              </div>
            ))}
            {!hasLabourLine(lines) ? (
              <div className="invoice-row invoice-row-muted">
                <span>Labour</span>
                <span>
                  <em>no time logged</em>
                </span>
              </div>
            ) : null}
          </div>
          <div className="invoice-totals">
            <div className="invoice-row">
              <span>Subtotal excl. VAT</span>
              <span className="amount">{formatEuro(subtotal)}</span>
            </div>
            <div className="invoice-row">
              <span>VAT 21%</span>
              <span className="amount">{formatEuro(vat)}</span>
            </div>
            <div className="invoice-row invoice-total">
              <span>Total</span>
              <span className="amount">{formatEuro(total)}</span>
            </div>
          </div>
          <span className="note">Material lines are shown excl. VAT. Payment within 14 days.</span>
        </article>
      </div>

      <div className="bottom-bar bottom-bar-sticky invoice-bar">
        <SendInvoice jobId={id} canSend={state.canSend} note={state.note} retry={Boolean(open)} savedError={failed || null} />
      </div>
    </main>
  );
}
