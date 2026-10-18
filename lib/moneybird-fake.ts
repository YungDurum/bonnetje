// Stand-in for Moneybird, for tests only: records every call and can be told to fail a step.
// The app uses it only when BONNETJE_FAKE_MONEYBIRD=1 (the Playwright run sets that);
// it never talks to the real Moneybird.
import { MoneybirdError, type Moneybird, type MoneybirdLine } from "./moneybird";

export class FakeMoneybird implements Moneybird {
  calls: { op: string; arg: unknown }[] = [];
  failOn = new Set<string>();
  private n = 0;

  private step(op: string, arg: unknown) {
    this.calls.push({ op, arg });
    if (this.failOn.has(op)) throw new MoneybirdError(`${op} failed`, 500);
    return { id: `mb-${op}-${++this.n}` };
  }

  async createContact(c: { companyName: string; address: string }) {
    return this.step("contact", c);
  }
  async createProject(p: { name: string }) {
    return this.step("project", p);
  }
  async createSalesInvoice(i: { contactId: string; projectId: string | null; reference: string; lines: MoneybirdLine[] }) {
    return this.step("invoice", i);
  }
  async sendSalesInvoice(id: string) {
    this.step("send", id);
  }
  async createReceipt(r: { reference: string; date: string; lines: MoneybirdLine[] }) {
    return this.step("receipt", r);
  }
  async addReceiptAttachment(id: string, f: { name: string }) {
    this.step("attach", { id, name: f.name });
  }
  ops() {
    return this.calls.map((c) => c.op);
  }
}
