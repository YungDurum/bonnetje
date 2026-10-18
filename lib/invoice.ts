// The invoice for a job, built from what is still to invoice. Pure, no I/O.
// Every line is excl. VAT; VAT 21% is taken over the subtotal (lib/money.ts).
import { formatDay, formatEuro, formatHalf } from "./format";
import { exclVat, invoiceTotals, type Cents, type InvoiceTotals, type Labour, type ToInvoice } from "./money";

export type InvoiceLine = { description: string; exclCents: Cents };

export type InvoiceDraft = {
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  /** Entries that this invoice bills; they are marked billed once it is in Moneybird. */
  entryIds: string[];
};

export type InvoiceEntry = {
  id: string;
  origin: "receipt" | "stock" | "manual";
  label: string;
  date: string;
  billed: boolean;
  lines: { name: string; detail: string; cents: Cents; vatRate: 0 | 9 | 21 }[];
  cents: Cents;
};

function entryExcl(e: InvoiceEntry): Cents {
  // the same per-line conversion as To invoice, so the invoice and the job page agree to the cent
  return e.lines.length ? e.lines.reduce((a, l) => a + exclVat(l.cents, l.vatRate), 0) : exclVat(e.cents, 21);
}

function entryLabel(e: InvoiceEntry): string {
  if (e.origin === "receipt") return `Materials — ${e.label}, ${formatDay(e.date).replace(/^\w+ /, "")}`;
  const l = e.lines[0];
  const what = l ? (l.detail ? `${l.name} (${l.detail})` : l.name) : e.label;
  return `Materials — ${what}`;
}

export function labourLine(labour: Labour, labourCents: Cents): string {
  const rate = labour.mode === "hour" ? labour.hourRateCents : labour.dayRateCents;
  const half = labour.mode === "hour" ? labour.hoursHalf : labour.daysHalf;
  return `Labour, ${formatHalf(half, labour.mode)} × ${formatEuro(rate)}`;
}

/**
 * Lines: one per unbilled material entry (oldest first), the markup, and labour.
 * The subtotal always equals the job's To invoice.
 */
export function buildInvoice(
  entries: InvoiceEntry[],
  toInvoice: ToInvoice,
  labour: Labour,
  markupPct: number,
): InvoiceDraft {
  const open = entries.filter((e) => !e.billed).sort((a, b) => a.date.localeCompare(b.date));
  const lines: InvoiceLine[] = open.map((e) => ({ description: entryLabel(e), exclCents: entryExcl(e) }));
  if (toInvoice.markup > 0) lines.push({ description: `Material markup ${markupPct}%`, exclCents: toInvoice.markup });
  if (toInvoice.labour > 0) lines.push({ description: labourLine(labour, toInvoice.labour), exclCents: toInvoice.labour });

  const sum = lines.reduce((a, l) => a + l.exclCents, 0);
  if (sum !== toInvoice.total) {
    throw new Error(`Invoice lines (${sum}) don't add up to To invoice (${toInvoice.total})`);
  }
  return {
    lines,
    totals: invoiceTotals(lines.map((l) => ({ exclCents: l.exclCents, vatRate: 21 }))),
    entryIds: open.map((e) => e.id),
  };
}
