import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "../db/client";
import { openInvoice, sendJobInvoice, sendReceipt } from "../db/invoices";
import { createJob, getJob, setLabour } from "../db/jobs";
import { createReceipt, getReceipt, saveReceiptPlacement, toPlaceLines } from "../db/receipts";
import { buildInvoice } from "../invoice";
import { HttpMoneybird, moneybirdPrice, type MoneybirdLine } from "../moneybird";
import { FakeMoneybird } from "../moneybird-fake";
import { wholeLineChoice } from "../placement";
import { SAMPLE_RECEIPTS } from "../samples";

const DE_VRIES = "10000000-0000-0000-0000-000000000001";
const BAKKER = "10000000-0000-0000-0000-000000000002";
const JANSEN = "10000000-0000-0000-0000-000000000003";

describe("buildInvoice", () => {
  it("de Vries: lines excl. VAT add up to To invoice; VAT 21% on the subtotal", async () => {
    const db = await createPgliteDb();
    const job = (await getJob(db, DE_VRIES))!;
    const inv = buildInvoice(job.open, job.toInvoice, job.labour, job.markupPct);
    expect(inv.lines).toEqual([
      { description: "Materials — Gamma, 14 Oct", exclCents: 3818 },
      { description: "Material markup 15%", exclCents: 573 },
      { description: "Labour, 6 h × €62.50", exclCents: 37500 },
    ]);
    expect(inv.totals).toMatchObject({ subtotal: 41891, vat: 8797, total: 50688 });
    expect(inv.entryIds).toHaveLength(1);
  });

  it("no labour line without time, no markup line without materials", async () => {
    const db = await createPgliteDb();
    const bakker = (await getJob(db, BAKKER))!;
    expect(buildInvoice(bakker.open, bakker.toInvoice, bakker.labour, 15).lines.map((l) => l.description)).toEqual([
      "Materials — Technische Unie, 15 Oct",
      "Material markup 15%",
    ]);
    const id = await createJob(db, { client: "X", title: "Y", address: "", mode: "day", rateCents: 45000 });
    await setLabour(db, id, { mode: "day", rateCents: 45000, half: 1 });
    const j = (await getJob(db, id))!;
    expect(buildInvoice(j.open, j.toInvoice, j.labour, 15).lines).toEqual([{ description: "Labour, 0.5 days × €450.00", exclCents: 22500 }]);
  });
});

describe("sendJobInvoice", () => {
  let db: Db;
  let mb: FakeMoneybird;
  beforeEach(async () => {
    db = await createPgliteDb();
    mb = new FakeMoneybird();
  });

  it("creates contact, project and invoice, sends it, then bills materials and resets hours", async () => {
    const r = await sendJobInvoice(db, mb, DE_VRIES);
    expect(r.ok).toBe(true);
    expect(mb.ops()).toEqual(["contact", "project", "invoice", "send"]);
    const sent = mb.calls[2].arg as { contactId: string; projectId: string; lines: MoneybirdLine[] };
    expect(sent.contactId).toBe("mb-contact-1");
    expect(sent.projectId).toBe("mb-project-2");
    expect(sent.lines.map((l) => l.priceCents)).toEqual([3818, 573, 37500]);
    expect(sent.lines.every((l) => l.vatRate === 21)).toBe(true);

    const job = (await getJob(db, DE_VRIES))!;
    expect(job.toInvoice.total).toBe(0);
    expect(job.status).toBe("invoiced");
    expect(job.labour.hoursHalf).toBe(0);
    expect(job.labour.daysHalf).toBe(2); // only the billed mode is reset
    expect(job.billed).toHaveLength(1);
    expect(r.ok && r.invoice).toMatchObject({ status: "sent", subtotalCents: 41891, vatCents: 8797, totalCents: 50688 });
    expect(await openInvoice(db, DE_VRIES)).toBeNull();
  });

  it("the contact and project are created once per job", async () => {
    await sendJobInvoice(db, mb, DE_VRIES);
    await setLabour(db, DE_VRIES, { mode: "hour", rateCents: 6250, half: 2 });
    await sendJobInvoice(db, mb, DE_VRIES);
    expect(mb.ops()).toEqual(["contact", "project", "invoice", "send", "invoice", "send"]);
  });

  it("nothing to invoice", async () => {
    const id = await createJob(db, { client: "X", title: "Y", address: "", mode: "hour", rateCents: 6250 });
    expect(await sendJobInvoice(db, mb, id)).toEqual({ ok: false, error: "Nothing to invoice on this job", invoice: null });
    expect(mb.calls).toEqual([]);
  });

  it("a failure bills nothing and keeps a 'failed' invoice with the reason; retry sends the same invoice", async () => {
    mb.failOn.add("send");
    const r = await sendJobInvoice(db, mb, JANSEN);
    expect(r).toMatchObject({ ok: false, error: "send failed" });
    let job = (await getJob(db, JANSEN))!;
    expect(job.toInvoice.total).toBe(67424);
    expect(job.labour.hoursHalf).toBe(9);
    expect(await openInvoice(db, JANSEN)).toMatchObject({ status: "failed", error: "send failed", moneybirdId: "mb-invoice-3" });

    // more time logged in between: the retry sends the original invoice, the new time stays
    await setLabour(db, JANSEN, { mode: "hour", rateCents: 6250, half: 11 });
    mb.failOn.clear();
    const retry = await sendJobInvoice(db, mb, JANSEN);
    expect(retry.ok).toBe(true);
    // the invoice was already created: only the send is retried, no duplicate
    expect(mb.ops()).toEqual(["contact", "project", "invoice", "send", "send"]);
    job = (await getJob(db, JANSEN))!;
    expect(job.labour.hoursHalf).toBe(2); // 5.5 h − 4.5 h billed
    expect(job.toInvoice.materialsExcl).toBe(0);
  });

  it("a failure before the invoice exists retries from that step", async () => {
    mb.failOn.add("project");
    expect((await sendJobInvoice(db, mb, BAKKER)).ok).toBe(false);
    mb.failOn.clear();
    expect((await sendJobInvoice(db, mb, BAKKER)).ok).toBe(true);
    expect(mb.ops()).toEqual(["contact", "project", "project", "invoice", "send"]);
  });

  it("materials added after the invoice was prepared stay unbilled", async () => {
    mb.failOn.add("invoice");
    await sendJobInvoice(db, mb, DE_VRIES);
    await db.query(`insert into material_entries (job_id, origin, label, cents) values ($1, 'manual', 'Added manually', 1210)`, [DE_VRIES]);
    mb.failOn.clear();
    await sendJobInvoice(db, mb, DE_VRIES);
    const job = (await getJob(db, DE_VRIES))!;
    expect(job.open.map((e) => e.cents)).toEqual([1210]);
    expect(job.toInvoice.materialsExcl).toBe(1000);
  });
});

describe("sendReceipt", () => {
  let db: Db;
  let mb: FakeMoneybird;
  beforeEach(async () => {
    db = await createPgliteDb();
    mb = new FakeMoneybird();
  });

  it("sends the full receipt with job names in the descriptions", async () => {
    const id = await createReceipt(db, SAMPLE_RECEIPTS[1]);
    const lines = toPlaceLines((await getReceipt(db, id))!);
    await saveReceiptPlacement(db, id, [
      { kind: "measure", rows: [{ jobId: DE_VRIES, value: 30 }, { jobId: BAKKER, value: 20 }], leftover: "stock", placed: true },
      wholeLineChoice(lines[1], BAKKER),
      { kind: "measure", rows: [], leftover: "stock", placed: true },
    ]);
    await db.query("update jobs set moneybird_project_id = 'p-bakker' where id = $1", [BAKKER]);

    expect(await sendReceipt(db, mb, id)).toEqual({ ok: true });
    const sent = mb.calls[0].arg as { date: string; lines: MoneybirdLine[] };
    expect(sent.date).toBe("2026-10-18");
    expect(sent.lines).toEqual([
      { description: "Installation cable 3×2.5 mm², 100 m → de Vries, Bakker", priceCents: 8900, vatRate: 21, projectId: null },
      { description: "2 × Flush socket, double → Bakker", priceCents: 1290, vatRate: 21, projectId: "p-bakker" },
      { description: "Junction boxes, 10 pcs", priceCents: 780, vatRate: 21, projectId: null },
    ]);
    // the full receipt, whatever was split
    expect(sent.lines.reduce((a, l) => a + l.priceCents, 0)).toBe(SAMPLE_RECEIPTS[1].totalCents);
    expect((await getReceipt(db, id))!.moneybirdStatus).toBe("sent");
    // already sent: nothing more happens
    expect(await sendReceipt(db, mb, id)).toEqual({ ok: true });
    expect(mb.calls).toHaveLength(1);
  });

  it("attaches the original file, and retries the attachment alone if it failed", async () => {
    const id = await createReceipt(db, { ...SAMPLE_RECEIPTS[0], filePath: "uploads/hornbach.jpg" });
    const read = async (p: string) => ({ name: p.split("/").pop()!, type: "image/jpeg", data: new Uint8Array([1, 2, 3]) });
    mb.failOn.add("attach");
    expect(await sendReceipt(db, mb, id, read)).toEqual({ ok: false, error: "attach failed" });
    const [r] = await db.query<{ moneybird_status: string; moneybird_error: string }>("select moneybird_status, moneybird_error from receipts where id = $1", [id]);
    expect(r).toEqual({ moneybird_status: "pending", moneybird_error: "attach failed" });
    mb.failOn.clear();
    expect(await sendReceipt(db, mb, id, read)).toEqual({ ok: true });
    expect(mb.ops()).toEqual(["receipt", "attach", "attach"]);
  });

  it("a missing original file is an error, not silently skipped", async () => {
    const id = await createReceipt(db, { ...SAMPLE_RECEIPTS[0], filePath: "uploads/gone.jpg" });
    expect(await sendReceipt(db, mb, id)).toMatchObject({ ok: false, error: expect.stringContaining("missing") });
  });
});

describe("HttpMoneybird (request shape, against a fake fetch)", () => {
  type Req = { url: string; method: string; headers: Record<string, string>; body: unknown };
  function fakeFetch(responses: Record<string, unknown>, status = 200) {
    const reqs: Req[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      reqs.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body });
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      return new Response(JSON.stringify(key ? responses[key] : { error: "nope" }), { status: key ? status : 404 });
    }) as unknown as typeof fetch;
    return { fn, reqs };
  }
  const taxRates = [
    { id: "t21s", percentage: "21.0", tax_rate_type: "sales_invoice", active: true },
    { id: "t9s", percentage: "9.0", tax_rate_type: "sales_invoice", active: true },
    { id: "t21p", percentage: "21.0", tax_rate_type: "purchase_invoice", active: true },
  ];

  it("prices as decimal strings", () => {
    expect(moneybirdPrice(41891)).toBe("418.91");
    expect(moneybirdPrice(5)).toBe("0.05");
    expect(moneybirdPrice(-250)).toBe("-2.50");
  });

  it("creates a sales invoice with details_attributes and the right tax rate, then sends it", async () => {
    const { fn, reqs } = fakeFetch({ "tax_rates.json": taxRates, "sales_invoices.json": { id: 123 }, "send_invoice.json": {} });
    const mb = new HttpMoneybird("tok", "999", fn);
    const { id } = await mb.createSalesInvoice({
      contactId: "c1", projectId: "p1", reference: "Ref",
      lines: [{ description: "Labour", priceCents: 37500, vatRate: 21 }],
    });
    await mb.sendSalesInvoice(id);
    expect(id).toBe("123");
    const create = reqs.find((r) => r.url.endsWith("sales_invoices.json"))!;
    expect(create.url).toBe("https://moneybird.com/api/v2/999/sales_invoices.json");
    expect(create.method).toBe("POST");
    expect(create.headers.Authorization).toBe("Bearer tok");
    expect(create.body).toEqual({
      sales_invoice: {
        contact_id: "c1", reference: "Ref", prices_are_incl_tax: false,
        details_attributes: [{ description: "Labour", price: "375.00", amount: "1", tax_rate_id: "t21s", project_id: "p1" }],
      },
    });
    const send = reqs.at(-1)!;
    expect(send).toMatchObject({ method: "PATCH", body: { sales_invoice_sending: { delivery_method: "Email" } } });
    expect(send.url).toBe("https://moneybird.com/api/v2/999/sales_invoices/123/send_invoice.json");
  });

  it("receipts use incl. VAT prices and the purchase tax rate", async () => {
    const { fn, reqs } = fakeFetch({ "tax_rates.json": taxRates, "documents/receipts.json": { id: "r9" } });
    await new HttpMoneybird("tok", "999", fn).createReceipt({
      reference: "Gamma", date: "2026-10-14", lines: [{ description: "Tap → de Vries", priceCents: 2995, vatRate: 21, projectId: "p1" }],
    });
    expect(reqs.at(-1)!.body).toEqual({
      receipt: {
        reference: "Gamma", date: "2026-10-14", prices_are_incl_tax: true,
        details_attributes: [{ description: "Tap → de Vries", price: "29.95", amount: "1", tax_rate_id: "t21p", project_id: "p1" }],
      },
    });
  });

  it("turns HTTP errors into readable messages", async () => {
    const { fn } = fakeFetch({ "contacts.json": { error: "Token invalid" } }, 401);
    await expect(new HttpMoneybird("bad", "999", fn).createContact({ companyName: "X", address: "" })).rejects.toThrow(
      "the Moneybird token was refused: Token invalid",
    );
    const missing = fakeFetch({ "tax_rates.json": taxRates.filter((t) => t.percentage !== "9.0") });
    await expect(
      new HttpMoneybird("t", "1", missing.fn).createSalesInvoice({ contactId: "c", projectId: null, reference: "", lines: [{ description: "x", priceCents: 1, vatRate: 9 }] }),
    ).rejects.toThrow("No active 9% tax rate");
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(new HttpMoneybird("t", "1", down).createProject({ name: "x" })).rejects.toThrow("Could not reach Moneybird");
  });
});
