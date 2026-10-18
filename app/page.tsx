import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { homeTotals, listJobs, type JobSummary } from "@/lib/db/jobs";
import { getOverview } from "@/lib/db/overview";
import { formatEuro, formatHalf } from "@/lib/format";
import { Toast } from "./_components/Toast";
import { CameraIcon, ChartIcon, CheckIcon, PinIcon, PlusIcon, TruckIcon } from "./_components/icons";

export const dynamic = "force-dynamic";

function JobCard({ job }: { job: JobSummary }) {
  const { labour } = job;
  const half = labour.mode === "hour" ? labour.hoursHalf : labour.daysHalf;
  const count = `${job.openCount} ${job.openCount === 1 ? "receipt" : "receipts"} · ${formatHalf(half, labour.mode)}`;
  return (
    <Link href={`/jobs/${job.id}`} className="card job-card">
      <span className="job-client">{job.client}</span>
      <span className="job-title">{job.title}</span>
      {job.address ? (
        <span className="job-address">
          <PinIcon />
          {job.address}
        </span>
      ) : null}
      <span className="job-foot">
        <span className="job-count">{count}</span>
        {job.status === "to_invoice" ? (
          <span className="job-total">
            <span className="amount">{formatEuro(job.toInvoice.total)}</span>
            <span className="job-total-label">to invoice</span>
          </span>
        ) : job.status === "invoiced" ? (
          <span className="job-invoiced">
            <CheckIcon />
            Invoiced
          </span>
        ) : (
          <span className="job-count">Nothing to invoice</span>
        )}
      </span>
    </Link>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  const { saved } = await searchParams;
  const db = await getDb();
  const [jobs, overview] = await Promise.all([listJobs(db), getOverview(db)]);
  const totals = homeTotals(jobs);
  const { stock, expenses } = overview;

  return (
    <main className="screen">
      <div className="screen-body home-body">
        <h1 className="brand">
          bonnetje<span className="brand-dot">.</span>
        </h1>

        <Toast text={saved} />

        <section className="info-card info-card-lg" aria-label="Not invoiced yet">
          <div className="info-label">Not invoiced yet</div>
          <div className="amount info-total">{formatEuro(totals.total)}</div>
          <div className="info-sub">
            Materials {formatEuro(totals.materials)} · labour {formatEuro(totals.labour)} · excl. VAT
          </div>
        </section>

        <section className="stack-10">
          <div className="section-row">
            <h2 className="section-title">Active jobs</h2>
            <Link href="/jobs/new" className="text-btn">
              <PlusIcon />
              New job
            </Link>
          </div>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </section>

        <div className="tiles">
          <Link href="/stock" className="card tile">
            <span className="tile-icon">
              <TruckIcon />
            </span>
            <span className="tile-title">Stock</span>
            <span className="tile-sub">
              {stock.count} {stock.count === 1 ? "item" : "items"} · {formatEuro(stock.valueCents)}
            </span>
          </Link>
          <Link href="/expenses" className="card tile">
            <span className="tile-icon">
              <ChartIcon />
            </span>
            <span className="tile-title">Expenses &amp; VAT</span>
            <span className="tile-sub">
              {expenses.quarterLabel} · {expenses.count} {expenses.count === 1 ? "receipt" : "receipts"}
            </span>
            <span className={expenses.notInMoneybird ? "tile-status tile-status-todo" : "tile-status tile-status-ok"}>
              {expenses.notInMoneybird ? `${expenses.notInMoneybird} not in Moneybird` : "All in Moneybird"}
            </span>
          </Link>
        </div>
      </div>

      <div className="bottom-bar bottom-bar-sticky">
        <Link href="/receipts/new" className="btn btn-primary btn-lg btn-icon">
          <CameraIcon size={22} />
          Add receipt
        </Link>
      </div>
    </main>
  );
}
