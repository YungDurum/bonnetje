"use client";

import { useActionState, useState } from "react";
import { createJobAction, type NewJobState } from "../../actions";

type Mode = "hour" | "day";

export function NewJobForm({ defaultRates }: { defaultRates: { hour: string; day: string } }) {
  const [state, action, pending] = useActionState<NewJobState, FormData>(createJobAction, {});
  const [mode, setMode] = useState<Mode>("hour");
  const [rates, setRates] = useState(defaultRates);

  const err = (field: NonNullable<NewJobState["field"]>) => (state.field === field ? state.error : undefined);

  return (
    <form action={action} className="form" noValidate>
      <div className="form-fields">
        <label className="field">
          <span className="field-label">Client</span>
          <input
            className="input"
            name="client"
            type="text"
            placeholder="e.g. Fam. Smit"
            autoComplete="off"
            aria-invalid={err("client") ? true : undefined}
            aria-describedby={err("client") ? "err-client" : undefined}
          />
          {err("client") ? (
            <span id="err-client" className="error-text" role="alert">
              {err("client")}
            </span>
          ) : null}
        </label>
        <label className="field">
          <span className="field-label">What&apos;s the job?</span>
          <input
            className="input"
            name="title"
            type="text"
            placeholder="e.g. New radiators upstairs"
            autoComplete="off"
            aria-invalid={err("title") ? true : undefined}
            aria-describedby={err("title") ? "err-title" : undefined}
          />
          {err("title") ? (
            <span id="err-title" className="error-text" role="alert">
              {err("title")}
            </span>
          ) : null}
        </label>
        <label className="field">
          <span className="field-label">
            Address <span className="field-hint">(optional)</span>
          </span>
          <input className="input" name="address" type="text" placeholder="Street and town" autoComplete="off" />
        </label>

        <div className="field">
          <span className="field-label" id="labour-label">
            Labour on this job
          </span>
          <div className="segmented segmented-lg" role="group" aria-labelledby="labour-label">
            <button type="button" aria-pressed={mode === "hour"} onClick={() => setMode("hour")}>
              Hourly
            </button>
            <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>
              Day rate
            </button>
          </div>
          <input type="hidden" name="mode" value={mode} />
        </div>

        <label className="field">
          <span className="field-label">{mode === "hour" ? "Rate per hour" : "Rate per day"}</span>
          <span className="input-group">
            <span className="amount input-prefix">€</span>
            <input
              className="amount input-bare"
              name="rate"
              type="text"
              inputMode="decimal"
              value={rates[mode]}
              onChange={(e) => setRates({ ...rates, [mode]: e.target.value })}
              aria-invalid={err("rate") ? true : undefined}
              aria-describedby={err("rate") ? "err-rate" : undefined}
            />
          </span>
          {err("rate") ? (
            <span id="err-rate" className="error-text" role="alert">
              {err("rate")}
            </span>
          ) : null}
        </label>

        <p className="note">
          The client and the job are also created in Moneybird, so the invoice lands on the right contact and project.
        </p>
        {state.error && !state.field ? (
          <p className="error-text" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <div className="bottom-bar">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Create job
        </button>
      </div>
    </form>
  );
}
