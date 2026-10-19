"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addManualMaterialAction } from "../../actions";
import { Sheet } from "../../_components/Sheet";
import { BackIcon, CameraIcon, ChevronRight, PencilIcon, PlusIcon, TruckIcon } from "../../_components/icons";
import { leftText, type StockRowData } from "../../stock/StockList";
import { UseStep } from "../../stock/UseStep";
import { formatEuro, parseEuroInput } from "@/lib/format";
import { parseValue } from "@/lib/placement-ui";
import { manualCents } from "@/lib/stock";

type Step = { name: "menu" } | { name: "stock" } | { name: "amount"; item: StockRowData } | { name: "manual" };

/** "Add material" on the job page: a bottom sheet with Scan a receipt / From stock / Add manually. */
export function AddMaterial({ jobId, client, stock }: { jobId: string; client: string; stock: StockRowData[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ name: "menu" });
  const router = useRouter();

  function close() {
    setOpen(false);
    setStep({ name: "menu" });
  }
  function done(message: string) {
    close();
    router.replace(`/jobs/${jobId}?${new URLSearchParams({ saved: message })}`, { scroll: false });
  }

  const total = stock.reduce((sum, i) => sum + i.valueCents, 0);
  const summary = `${stock.length} ${stock.length === 1 ? "item" : "items"} in stock · ${formatEuro(total)}`;

  return (
    <div className="add-material">
      <button type="button" className="add-btn" onClick={() => setOpen(true)}>
        <PlusIcon size={16} />
        Add material
      </button>
      {open ? (
        <Sheet label="Add material" onClose={close}>
          {step.name === "menu" ? (
            <>
              <h2 className="sheet-title">Add material</h2>
              <Link href="/receipts/new" className="source-btn menu-btn">
                <span className="menu-icon">
                  <CameraIcon size={20} />
                </span>
                <span className="source-text">
                  <span className="source-title">Scan a receipt</span>
                  <span className="source-sub">Photo, PDF or e-invoice</span>
                </span>
                <ChevronRight />
              </Link>
              <button type="button" className="source-btn menu-btn" onClick={() => setStep({ name: "stock" })}>
                <span className="menu-icon">
                  <TruckIcon />
                </span>
                <span className="source-text">
                  <span className="source-title">From stock</span>
                  <span className="source-sub">{summary}</span>
                </span>
                <ChevronRight />
              </button>
              <button type="button" className="source-btn menu-btn" onClick={() => setStep({ name: "manual" })}>
                <span className="menu-icon">
                  <PencilIcon />
                </span>
                <span className="source-text">
                  <span className="source-title">Add manually</span>
                  <span className="source-sub">Something without a receipt</span>
                </span>
                <ChevronRight />
              </button>
            </>
          ) : null}

          {step.name === "stock" ? (
            <>
              <div className="sheet-back">
                <button type="button" className="round-btn" aria-label="Back" onClick={() => setStep({ name: "menu" })}>
                  <BackIcon />
                </button>
                <h2 className="sheet-title">From stock</h2>
              </div>
              <div className="list">
                {stock.map((i) => {
                  const left = leftText(i);
                  return (
                    <div key={i.id} className="pick-item">
                      <span className="row-text">
                        <span className="row-title">{i.name}</span>
                        <span className="row-sub">
                          {left ? `${left} · ` : ""}
                          {formatEuro(i.valueCents)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline"
                        aria-label={`Use ${i.name} on ${client}`}
                        onClick={() => setStep({ name: "amount", item: i })}
                      >
                        Use
                      </button>
                    </div>
                  );
                })}
                {stock.length === 0 ? <div className="list-empty">Nothing in stock right now.</div> : null}
              </div>
            </>
          ) : null}

          {step.name === "amount" ? (
            <>
              <div className="sheet-back">
                <button type="button" className="round-btn" aria-label="Back" onClick={() => setStep({ name: "stock" })}>
                  <BackIcon />
                </button>
                <div className="stack-2">
                  <h2 className="sheet-title">{step.item.name}</h2>
                  <span className="sheet-sub">
                    In stock: {leftText(step.item) ? `${leftText(step.item)} · ` : ""}
                    {formatEuro(step.item.valueCents)}
                  </span>
                </div>
              </div>
              <UseStep
                item={step.item}
                jobId={jobId}
                actionLabel={`Add to ${client}`}
                onUsed={(r) => done(`${step.item.name} (${r.usedLabel}) added from stock`)}
              />
            </>
          ) : null}

          {step.name === "manual" ? (
            <ManualForm jobId={jobId} client={client} onBack={() => setStep({ name: "menu" })} onDone={done} />
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

function ManualForm({
  jobId,
  client,
  onBack,
  onDone,
}: {
  jobId: string;
  client: string;
  onBack: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qtyText, setQtyText] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceCents = parseEuroInput(price);
  const qty = parseValue("measure", qtyText);
  const cents = priceCents !== null && priceCents > 0 && qty !== null && qty > 0 ? safeCents(priceCents, qty) : null;
  const valid = name.trim() !== "" && cents !== null && cents > 0;

  function submit() {
    if (!valid || priceCents === null || qty === null) return;
    setError(null);
    startTransition(async () => {
      const r = await addManualMaterialAction({ jobId, name: name.trim(), qty, priceCents });
      if (r.ok) onDone(`${name.trim()} added to ${client}`);
      else setError(r.error);
    });
  }

  return (
    <>
      <div className="sheet-back">
        <button type="button" className="round-btn" aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <h2 className="sheet-title">Add manually</h2>
      </div>
      <label className="field">
        <span className="field-label-plain">What is it?</span>
        <input className="input" type="text" placeholder="e.g. Radiator valve" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-row-2">
        <label className="field">
          <span className="field-label-plain">Price each, incl. VAT</span>
          <span className="input-group">
            <span className="amount input-prefix">€</span>
            <input
              className="input-bare amount"
              style={{ textAlign: "left" }}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              aria-invalid={price.trim() !== "" && priceCents === null ? true : undefined}
              onChange={(e) => setPrice(e.target.value)}
            />
          </span>
        </label>
        <label className="field">
          <span className="field-label-plain">Quantity</span>
          <input
            className="input amount"
            type="text"
            inputMode="decimal"
            value={qtyText}
            aria-invalid={qty === null || qty <= 0 ? true : undefined}
            onChange={(e) => setQtyText(e.target.value)}
          />
        </label>
      </div>
      <div className="summary-row">
        <span>Total on this job</span>
        <span className="amount" data-testid="manual-total">
          {formatEuro(cents ?? 0)}
        </span>
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-primary" disabled={!valid || pending} onClick={submit}>
        {valid ? `Add to ${client}` : "Fill in a name and price"}
      </button>
      <p className="note">
        Billed to the client. Without a receipt it is not booked as an expense, so scan the receipt if you have one.
      </p>
    </>
  );
}

function safeCents(priceCents: number, qty: number): number | null {
  try {
    return manualCents(priceCents, qty);
  } catch {
    return null;
  }
}
