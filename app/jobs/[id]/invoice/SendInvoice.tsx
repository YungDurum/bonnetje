"use client";

import { useState, useTransition } from "react";
import { sendInvoiceAction } from "../../../actions";

/** The Send / Try again button. Disabled while sending so a double tap can't send twice. */
export function SendInvoice({
  jobId,
  canSend,
  note,
  retry,
  savedError,
}: {
  jobId: string;
  canSend: boolean;
  note: string;
  retry: boolean;
  /** The reason the last attempt failed, as stored with the unfinished invoice. */
  savedError: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = error ?? savedError;
  const label = pending ? "Sending…" : retry || error ? "Try again" : "Send to Moneybird";

  function send() {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await sendInvoiceAction(jobId);
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <div className="invoice-actions">
      {shown ? (
        <p className="notice-error" role="alert">
          Not sent: {shown}
        </p>
      ) : null}
      <button type="button" className="btn btn-primary btn-icon" disabled={!canSend || pending} onClick={send}>
        {label}
      </button>
      <p className="add-note center">{note}</p>
    </div>
  );
}
