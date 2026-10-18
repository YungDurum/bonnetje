import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/db/jobs";
import { getReceipt } from "@/lib/db/receipts";
import { formatDay, formatEuro } from "@/lib/format";
import { BackLink } from "../../_components/BackLink";
import { CircleCheckIcon } from "../../_components/icons";
import { ReceiptPlacer } from "./ReceiptPlacer";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const receipt = await getReceipt(db, id);
  if (!receipt) notFound();
  const jobs = await listJobs(db);

  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Back to home" />
        <div className="page-head-text">
          <h1 className="page-title">{receipt.placed ? receipt.supplier : "Where did it go?"}</h1>
          <p className="page-sub">
            {receipt.placed ? "" : `${receipt.supplier} · `}
            {formatEuro(receipt.totalCents)} · {formatDay(receipt.date)}
          </p>
        </div>
      </header>

      {receipt.placed ? (
        <div className="screen-body">
          <div className="toast" role="status">
            <CircleCheckIcon />
            <span>This receipt is saved.</span>
          </div>
          <p className="note">Every item has a place, so it can&apos;t be changed here any more.</p>
          <Link href="/" className="btn btn-outline">
            Back to home
          </Link>
          <Link href="/receipts/new" className="btn btn-outline">
            Add another receipt
          </Link>
        </div>
      ) : (
        <ReceiptPlacer
          receipt={{
            id: receipt.id,
            totalCents: receipt.totalCents,
            needsReview: receipt.needsReview,
            lines: receipt.lines.map((l) => ({
              id: l.id,
              name: l.name,
              short: l.short,
              qty: l.qty,
              unitPriceCents: l.unitPriceCents,
              lineCents: l.lineCents,
              measure: l.measure,
              unit: l.unit,
              vatRate: l.vatRate,
            })),
          }}
          jobs={jobs.map((j) => ({ id: j.id, client: j.client, shortName: j.shortName, title: j.title }))}
        />
      )}
    </main>
  );
}
