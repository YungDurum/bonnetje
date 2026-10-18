import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getJob, type MaterialEntry } from "@/lib/db/jobs";
import { formatDay, formatEuro } from "@/lib/format";
import { Toast } from "../../_components/Toast";
import { BackLink } from "../../_components/BackLink";
import { InvoiceIcon, PlusIcon } from "../../_components/icons";
import { InvoicedSection } from "./InvoicedSection";
import { LabourSection } from "./LabourSection";
import { MaterialRow, type RowData } from "./MaterialRow";

export const dynamic = "force-dynamic";

function toRow(e: MaterialEntry): RowData & { expandable: boolean } {
  const isReceipt = e.origin === "receipt";
  const date = formatDay(e.date);
  const items = e.lines.length;
  return {
    id: e.id,
    title: isReceipt ? e.label : (e.lines[0]?.name ?? e.label),
    sub: isReceipt
      ? `${date} · ${items ? `${items} ${items === 1 ? "item" : "items"}` : e.label}`
      : `${e.origin === "stock" ? "From stock" : "Added manually"} · ${date}`,
    amount: formatEuro(e.cents),
    isNew: e.isNew,
    lines: e.lines.map((l) => ({ name: l.name, detail: l.detail, amount: formatEuro(l.cents) })),
    expandable: isReceipt && items > 0,
  };
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const job = await getJob(await getDb(), id);
  if (!job) notFound();

  const openRows = job.open.map(toRow);
  const billedRows = job.billed.map(toRow);
  const t = job.toInvoice;

  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Back to jobs" />
        <div className="page-head-text">
          <h1 className="page-title">{job.client}</h1>
          <p className="page-sub">{job.address ? `${job.title} · ${job.address}` : job.title}</p>
        </div>
      </header>

      <div className="screen-body">
        <Toast text={saved} />
        <section className="info-card" aria-label="To invoice">
          <span className="info-label">To invoice</span>
          <span className="amount info-total info-total-sm">{formatEuro(t.total)}</span>
          <span className="info-sub">
            Materials {formatEuro(t.materialsExcl)} · markup {formatEuro(t.markup)} · labour {formatEuro(t.labour)} ·
            excl. VAT
          </span>
        </section>

        <section className="stack-8">
          <div className="section-row section-row-base">
            <h2 className="section-title">Materials</h2>
            <span className="count-label">{openRows.length ? `${openRows.length} open` : ""}</span>
          </div>
          <div className="list">
            {openRows.map((r) => (
              <MaterialRow key={r.id} row={r} expandable={r.expandable} />
            ))}
            {openRows.length === 0 ? <div className="list-empty">No open materials on this job.</div> : null}
            <div className="add-material">
              <button type="button" className="add-btn" disabled>
                <PlusIcon size={16} />
                Add material
              </button>
              <span className="add-note">Adding materials is coming in a later step.</span>
            </div>
          </div>
        </section>

        <LabourSection jobId={job.id} labour={job.labour} />

        {billedRows.length ? <InvoicedSection rows={billedRows} /> : null}
      </div>

      <div className="bottom-bar bottom-bar-sticky">
        {t.total > 0 ? (
          <button type="button" className="btn btn-primary btn-icon" disabled title="Coming soon">
            <InvoiceIcon />
            Create invoice · {formatEuro(t.total)}
          </button>
        ) : (
          <button type="button" className="btn btn-disabled" disabled>
            Nothing to invoice yet
          </button>
        )}
        {t.total > 0 ? <p className="add-note center">Creating the invoice is coming in a later step.</p> : null}
      </div>
    </main>
  );
}
