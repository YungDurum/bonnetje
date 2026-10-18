"use client";

import { useState, useTransition } from "react";
import { setLabourAction } from "../../actions";
import { Sheet } from "../../_components/Sheet";
import { ChevronRight } from "../../_components/icons";
import { formatEuro, formatEuroInput, formatHalf, parseEuroInput } from "@/lib/format";
import { labourCents, type Labour, type LabourMode } from "@/lib/money";

/** The labour row on the job page and the bottom sheet it opens. */
export function LabourSection({ jobId, labour }: { jobId: string; labour: Labour }) {
  const [open, setOpen] = useState(false);

  const half = labour.mode === "hour" ? labour.hoursHalf : labour.daysHalf;
  const rate = labour.mode === "hour" ? labour.hourRateCents : labour.dayRateCents;

  return (
    <section className="stack-8">
      <h2 className="section-title">Labour</h2>
      <button type="button" className="card labour-row" onClick={() => setOpen(true)}>
        <span className="row-text">
          <span className="row-title">
            {half > 0 ? `${formatHalf(half, labour.mode)} × ${formatEuro(rate)}` : "No time logged yet"}
          </span>
          <span className="row-sub">{labour.mode === "hour" ? "Hourly" : "Day rate"} · tap to change</span>
        </span>
        <span className="amount row-amount">{formatEuro(labourCents(labour))}</span>
        <span className="chev">
          <ChevronRight />
        </span>
      </button>
      {open ? <LabourSheet jobId={jobId} labour={labour} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function LabourSheet({ jobId, labour, onClose }: { jobId: string; labour: Labour; onClose: () => void }) {
  const [mode, setMode] = useState<LabourMode>(labour.mode);
  // Each mode keeps its own rate and amount, like the prototype: switching shows the stored values.
  const [rateText, setRateText] = useState({
    hour: formatEuroInput(labour.hourRateCents),
    day: formatEuroInput(labour.dayRateCents),
  });
  const [halves, setHalves] = useState({ hour: labour.hoursHalf, day: labour.daysHalf });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hourly = mode === "hour";
  const rateCents = parseEuroInput(rateText[mode]);
  const half = halves[mode];
  const amount = rateCents === null ? null : labourCents({ ...labour, mode, hourRateCents: hourly ? rateCents : labour.hourRateCents, dayRateCents: hourly ? labour.dayRateCents : rateCents, hoursHalf: halves.hour, daysHalf: halves.day });
  const rateError = rateCents === null ? "Enter a rate like 62.50." : null;

  const step = (d: number) => setHalves({ ...halves, [mode]: Math.max(0, half + d) });

  function save() {
    if (rateCents === null) return;
    setError(null);
    startTransition(async () => {
      const res = await setLabourAction({ jobId, mode, rateCents, half });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <Sheet label="Labour" onClose={onClose}>
      <div className="sheet-head">
        <h2 className="sheet-title">Labour</h2>
        <div className="segmented" role="group" aria-label="Pay basis">
          <button type="button" aria-pressed={hourly} onClick={() => setMode("hour")}>
            Hourly
          </button>
          <button type="button" aria-pressed={!hourly} onClick={() => setMode("day")}>
            Day rate
          </button>
        </div>
      </div>

      <div className="field">
        <label className="rate-row">
          <span className="field-label-plain">{hourly ? "Rate per hour" : "Rate per day"}</span>
          <span className="input-group input-group-sm">
            <span className="amount input-prefix">€</span>
            <input
              className="amount input-bare rate-input"
              type="text"
              inputMode="decimal"
              value={rateText[mode]}
              onChange={(e) => setRateText({ ...rateText, [mode]: e.target.value })}
              aria-invalid={rateError ? true : undefined}
              aria-describedby={rateError ? "rate-error" : undefined}
            />
          </span>
        </label>
        {rateError ? (
          <span id="rate-error" className="error-text rate-error" role="alert">
            {rateError}
          </span>
        ) : null}
      </div>

      <div className="qty-row">
        <div className="qty-col">
          <span className="qty-label">{hourly ? "Hours worked" : "Days worked"}</span>
          <span className="amount qty-value" data-testid="labour-qty">
            {formatHalf(half, mode)}
          </span>
        </div>
        <span className="amount qty-amount" data-testid="labour-amount">
          {amount === null ? "—" : formatEuro(amount)}
        </span>
      </div>

      <div className="step-row">
        <button type="button" className="btn btn-outline" onClick={() => step(-1)} disabled={half === 0} aria-label={hourly ? "Remove half an hour" : "Remove half a day"}>
          {hourly ? "−½ h" : "−½ day"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => step(1)} aria-label={hourly ? "Add half an hour" : "Add half a day"}>
          {hourly ? "+½ h" : "+½ day"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => step(2)} aria-label={hourly ? "Add one hour" : "Add one day"}>
          {hourly ? "+1 h" : "+1 day"}
        </button>
      </div>

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-primary" onClick={save} disabled={rateCents === null || pending}>
        Save
      </button>
    </Sheet>
  );
}
