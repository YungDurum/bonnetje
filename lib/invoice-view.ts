// What the invoice page shows, from either a fresh draft or the unfinished invoice that a retry will send.
import { formatDay, formatHalf } from "./format";
import type { InvoiceLine } from "./invoice";
import type { LabourMode } from "./money";

export function builtFromLabel(entryCount: number, labourHalf: number, mode: LabourMode): string {
  const entries = `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;
  return `${entries} and ${labourHalf > 0 ? formatHalf(labourHalf, mode) : "no time logged"}`;
}

/** "2026-10-18" -> "18 Oct 2026". */
export function formatInvoiceDate(iso: string): string {
  return `${formatDay(iso).replace(/^\w+ /, "")} ${iso.slice(0, 4)}`;
}

export function hasLabourLine(lines: InvoiceLine[]): boolean {
  return lines.some((l) => l.description.startsWith("Labour,"));
}

export type SendState = { canSend: boolean; note: string };

export const NOT_CONNECTED = "Moneybird isn't connected yet. Add MONEYBIRD_TOKEN and MONEYBIRD_ADMINISTRATION_ID.";
export const SEND_NOTE = "Moneybird sends it to the client and handles payment and reminders.";

/** The send button is only enabled when Moneybird is connected. */
export function sendState(connected: boolean): SendState {
  return connected ? { canSend: true, note: SEND_NOTE } : { canSend: false, note: NOT_CONNECTED };
}
