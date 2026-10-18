// Moneybird API (v2) client.
//
// UNVERIFIED: written without access to developer.moneybird.com (blocked in the environment
// this was built in). Endpoints and field names follow Moneybird's public v2 API as known at the
// time; check them against the docs and a test administration before relying on this:
//   - POST   /{admin}/contacts.json                       { contact: { company_name, address1 } }
//   - POST   /{admin}/projects.json                       { project: { name } }
//   - GET    /{admin}/tax_rates.json                      [{ id, percentage, tax_rate_type, active }]
//   - POST   /{admin}/sales_invoices.json                 { sales_invoice: { contact_id, reference,
//                                                           prices_are_incl_tax, details_attributes: [...] } }
//   - PATCH  /{admin}/sales_invoices/{id}/send_invoice.json { sales_invoice_sending: { delivery_method } }
//   - POST   /{admin}/documents/receipts.json             { receipt: { reference, date, prices_are_incl_tax,
//                                                           details_attributes: [...] } }
//   - POST   /{admin}/documents/receipts/{id}/attachments.json  multipart field "file"
// Open question from the build plan: whether `project_id` is accepted per receipt detail line.
// We send it AND put the job name in the line description, so nothing is lost if it isn't.
import type { Cents, VatRate } from "./money";

export type MoneybirdLine = {
  description: string;
  /** Unit price in cents; excl. VAT for sales invoices, incl. VAT for receipts. */
  priceCents: Cents;
  amount?: number;
  vatRate: VatRate;
  projectId?: string | null;
};

export interface Moneybird {
  createContact(c: { companyName: string; address: string }): Promise<{ id: string }>;
  createProject(p: { name: string }): Promise<{ id: string }>;
  /** Creates a draft sales invoice. */
  createSalesInvoice(i: {
    contactId: string;
    projectId: string | null;
    reference: string;
    lines: MoneybirdLine[];
  }): Promise<{ id: string }>;
  /** Has Moneybird send the invoice to the client; from then on Moneybird handles payment. */
  sendSalesInvoice(id: string): Promise<void>;
  createReceipt(r: { reference: string; date: string; lines: MoneybirdLine[] }): Promise<{ id: string }>;
  addReceiptAttachment(receiptId: string, file: { name: string; type: string; data: Uint8Array }): Promise<void>;
}

export class MoneybirdError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Cents → Moneybird's decimal string, "12.34". */
export function moneybirdPrice(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`not whole cents: ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

type TaxRate = { id: string; percentage: string; tax_rate_type: string; active?: boolean };

export class HttpMoneybird implements Moneybird {
  private taxRates?: Promise<TaxRate[]>;

  constructor(
    private readonly token: string,
    private readonly administrationId: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = "https://moneybird.com/api/v2",
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/${this.administrationId}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } catch (e) {
      throw new MoneybirdError(`Could not reach Moneybird: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: unknown; message?: unknown };
        detail = String(j.error ?? j.message ?? "");
      } catch {
        // not JSON
      }
      const why =
        res.status === 401 ? "the Moneybird token was refused" :
        res.status === 403 ? "the token has no access to this administration" :
        res.status === 404 ? "not found in Moneybird (check the administration ID)" :
        res.status === 429 ? "Moneybird is rate limiting; try again in a minute" :
        `Moneybird answered ${res.status}`;
      throw new MoneybirdError(detail ? `${why}: ${detail}` : why, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async taxRateId(rate: VatRate, kind: "sales_invoice" | "purchase_invoice"): Promise<string> {
    this.taxRates ??= this.request<TaxRate[]>("GET", "tax_rates.json");
    const rates = await this.taxRates.catch((e) => {
      this.taxRates = undefined;
      throw e;
    });
    const hit = rates.find((t) => t.tax_rate_type === kind && t.active !== false && Number(t.percentage) === rate);
    if (!hit) throw new MoneybirdError(`No active ${rate}% tax rate for ${kind.replace("_", " ")}s in Moneybird`);
    return hit.id;
  }

  private async details(lines: MoneybirdLine[], kind: "sales_invoice" | "purchase_invoice") {
    return Promise.all(
      lines.map(async (l) => ({
        description: l.description,
        price: moneybirdPrice(l.priceCents),
        amount: String(l.amount ?? 1),
        tax_rate_id: await this.taxRateId(l.vatRate, kind),
        ...(l.projectId ? { project_id: l.projectId } : {}),
      })),
    );
  }

  async createContact(c: { companyName: string; address: string }) {
    const r = await this.request<{ id: string }>("POST", "contacts.json", {
      contact: { company_name: c.companyName, address1: c.address },
    });
    return { id: String(r.id) };
  }

  async createProject(p: { name: string }) {
    const r = await this.request<{ id: string }>("POST", "projects.json", { project: { name: p.name } });
    return { id: String(r.id) };
  }

  async createSalesInvoice(i: { contactId: string; projectId: string | null; reference: string; lines: MoneybirdLine[] }) {
    const details = await this.details(
      i.lines.map((l) => ({ ...l, projectId: l.projectId ?? i.projectId })),
      "sales_invoice",
    );
    const inv = await this.request<{ id: string }>("POST", "sales_invoices.json", {
      sales_invoice: {
        contact_id: i.contactId,
        reference: i.reference,
        prices_are_incl_tax: false,
        details_attributes: details,
      },
    });
    return { id: String(inv.id) };
  }

  async sendSalesInvoice(id: string) {
    await this.request("PATCH", `sales_invoices/${id}/send_invoice.json`, {
      sales_invoice_sending: { delivery_method: "Email" },
    });
  }

  async createReceipt(r: { reference: string; date: string; lines: MoneybirdLine[] }) {
    const res = await this.request<{ id: string }>("POST", "documents/receipts.json", {
      receipt: {
        reference: r.reference,
        date: r.date,
        prices_are_incl_tax: true,
        details_attributes: await this.details(r.lines, "purchase_invoice"),
      },
    });
    return { id: String(res.id) };
  }

  async addReceiptAttachment(receiptId: string, file: { name: string; type: string; data: Uint8Array }) {
    const form = new FormData();
    form.append("file", new Blob([file.data as BlobPart], { type: file.type }), file.name);
    await this.request("POST", `documents/receipts/${receiptId}/attachments.json`, undefined, form);
  }
}

/** The configured client, or null when MONEYBIRD_TOKEN / MONEYBIRD_ADMINISTRATION_ID are not set. */
export function getMoneybird(): Moneybird | null {
  const token = process.env.MONEYBIRD_TOKEN;
  const admin = process.env.MONEYBIRD_ADMINISTRATION_ID;
  return token && admin ? new HttpMoneybird(token, admin) : null;
}
