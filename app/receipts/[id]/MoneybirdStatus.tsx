"use client";

import { useState, useTransition } from "react";
import { sendReceiptAction } from "../../actions";

/** Moneybird status of a saved receipt, with "Send now" when it isn't there yet. */
export function MoneybirdStatus({
  receiptId,
  sent,
  error,
  connected,
}: {
  receiptId: string;
  sent: boolean;
  error: string | null;
  connected: boolean;
}) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="note" role="status" style={{ color: "var(--green)", fontWeight: 600 }}>
        In Moneybird
      </p>
    );
  }
  const shown = local ?? error;
  return (
    <div className="moneybird-row">
      <p className="error-text" role={shown ? "alert" : undefined}>
        Not sent to Moneybird{shown ? `: ${shown}` : ""}
      </p>
      {connected ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            setLocal(null);
            start(async () => {
              const r = await sendReceiptAction(receiptId);
              if (!r.ok) setLocal(r.error);
            });
          }}
        >
          {pending ? "Sending…" : "Send now"}
        </button>
      ) : (
        <p className="note">Moneybird isn&apos;t connected yet. Add MONEYBIRD_TOKEN and MONEYBIRD_ADMINISTRATION_ID.</p>
      )}
    </div>
  );
}
