import { createSampleReceiptAction } from "@/app/actions";
import { formatDay, formatEuro } from "@/lib/format";
import { SAMPLE_RECEIPTS } from "@/lib/samples";
import { BackLink } from "../../_components/BackLink";
import { CameraIcon, ChevronRight, FileIcon, ImageIcon } from "../../_components/icons";

export default function NewReceiptPage() {
  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Close" />
        <div className="page-head-text">
          <h1 className="page-title">Add a receipt</h1>
          <p className="page-sub">Paper, PDF, email or e-invoice</p>
        </div>
      </header>

      <div className="screen-body">
        <section className="stack-10" aria-label="Ways to add a receipt">
          <button type="button" className="source-btn" disabled>
            <CameraIcon />
            <span className="source-text">
              <span className="source-title">Take a photo</span>
              <span className="source-sub">Paper receipt from the shop</span>
            </span>
          </button>
          <button type="button" className="source-btn" disabled>
            <ImageIcon />
            <span className="source-text">
              <span className="source-title">Choose from your photos</span>
              <span className="source-sub">A picture of a receipt you took earlier</span>
            </span>
          </button>
          <button type="button" className="source-btn" disabled>
            <FileIcon />
            <span className="source-text">
              <span className="source-title">Upload a PDF</span>
              <span className="source-sub">Invoice from a wholesaler or webshop</span>
            </span>
          </button>
          <p className="note">Reading receipts is coming in the next step. Until then, try one of the samples below.</p>
        </section>

        <section className="stack-8" aria-label="Try a sample receipt">
          <h2 className="section-title">Try a sample receipt</h2>
          <div className="list">
            {SAMPLE_RECEIPTS.map((r, i) => (
              <form key={i} action={createSampleReceiptAction.bind(null, i)} className="row">
                <button type="submit" className="row-head" style={{ cursor: "pointer" }}>
                  <span className="row-text">
                    <span className="row-title">{r.supplier}</span>
                    <span className="row-sub">
                      {formatDay(r.date)} · {r.lines.length} {r.lines.length === 1 ? "item" : "items"}
                    </span>
                  </span>
                  <span className="amount row-amount">{formatEuro(r.totalCents)}</span>
                  <span className="chev">
                    <ChevronRight />
                  </span>
                </button>
              </form>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
