// Receipts: create one (from a reader or a demo sample), load it for "Where did it go?",
// and save the placement — material entries, stock and allocations — in one transaction.
import type { Cents, Unit, VatRate } from "../money";
import { computePlacement, type LineChoice, type PlaceLine, type Placement } from "../placement";
import type { Db, Queryable } from "./client";

export type ReceiptSource = "photo" | "pdf" | "email" | "einvoice";

export type NewReceiptLine = {
  name: string;
  short: string;
  qty: number;
  unitPriceCents: Cents;
  lineCents: Cents;
  measure: number | null;
  unit: Unit | null;
  vatRate: VatRate;
};

export type NewReceipt = {
  supplier: string;
  date: string; // YYYY-MM-DD
  source: ReceiptSource;
  totalCents: Cents;
  filePath?: string | null;
  lines: NewReceiptLine[];
};

export type ReceiptLine = NewReceiptLine & { id: string; position: number; placed: boolean };

export type Receipt = {
  id: string;
  supplier: string;
  date: string;
  source: ReceiptSource;
  totalCents: Cents;
  needsReview: boolean;
  moneybirdStatus: "sent" | "pending";
  /** Every line placed: the receipt has been saved. */
  placed: boolean;
  lines: ReceiptLine[];
};

/** Lines that don't add up to the total are flagged for review instead of guessed at. */
export async function createReceipt(db: Db, r: NewReceipt): Promise<string> {
  if (!r.supplier.trim()) throw new Error("Supplier is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error("Date must be YYYY-MM-DD");
  if (!r.lines.length) throw new Error("A receipt needs at least one line");
  const sum = r.lines.reduce((a, l) => a + l.lineCents, 0);
  const needsReview = sum !== r.totalCents;
  return db.transaction(async (tx) => {
    const [{ id }] = await tx.query<{ id: string }>(
      `insert into receipts (supplier, receipt_date, source, total_cents, file_path, needs_review)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [r.supplier.trim(), r.date, r.source, r.totalCents, r.filePath ?? null, needsReview],
    );
    for (const [i, l] of r.lines.entries()) {
      await tx.query(
        `insert into receipt_lines (receipt_id, position, name, short, qty, unit_price_cents, line_cents, measure, unit, vat_rate)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, i + 1, l.name, l.short, l.qty, l.unitPriceCents, l.lineCents, l.measure, l.unit, l.vatRate],
      );
    }
    return id;
  });
}

type ReceiptRow = {
  id: string;
  supplier: string;
  receipt_date: string;
  source: ReceiptSource;
  total_cents: number;
  needs_review: boolean;
  moneybird_status: "sent" | "pending";
};

type LineRow = {
  id: string;
  position: number;
  name: string;
  short: string;
  qty: number;
  unit_price_cents: number;
  line_cents: number;
  measure: number | null;
  unit: Unit | null;
  vat_rate: VatRate;
  placed: boolean;
};

export async function getReceipt(db: Queryable, id: string): Promise<Receipt | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.query<ReceiptRow>(
    `select id, supplier, receipt_date, source, total_cents, needs_review, moneybird_status from receipts where id = $1`,
    [id],
  );
  if (!r) return null;
  const lines = await db.query<LineRow>(
    `select id, position, name, short, qty, unit_price_cents, line_cents, measure, unit, vat_rate, placed
       from receipt_lines where receipt_id = $1 order by position`,
    [id],
  );
  return {
    id: r.id,
    supplier: r.supplier,
    date: r.receipt_date,
    source: r.source,
    totalCents: r.total_cents,
    needsReview: r.needs_review,
    moneybirdStatus: r.moneybird_status,
    placed: lines.length > 0 && lines.every((l) => l.placed),
    lines: lines.map((l) => ({
      id: l.id,
      position: l.position,
      name: l.name,
      short: l.short,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      lineCents: l.line_cents,
      measure: l.measure,
      unit: l.unit,
      vatRate: l.vat_rate,
      placed: l.placed,
    })),
  };
}

export function toPlaceLines(r: Receipt): PlaceLine[] {
  return r.lines.map((l) => ({
    id: l.id,
    name: l.name,
    lineCents: l.lineCents,
    measure: l.measure,
    unit: l.unit,
    vatRate: l.vatRate,
  }));
}

export class PlacementError extends Error {}

/**
 * Save "Where did it go?". Recomputes the placement from the stored lines (never trusts
 * amounts from the client), then writes allocations, one material entry per job,
 * stock items for leftovers, and marks every line placed.
 */
export async function saveReceiptPlacement(db: Db, receiptId: string, choices: LineChoice[]): Promise<Placement> {
  return db.transaction(async (tx) => {
    // lock the receipt so a double tap can't save it twice
    const [locked] = await tx.query<{ id: string }>("select id from receipts where id = $1 for update", [receiptId]);
    if (!locked) throw new PlacementError("Receipt not found");
    const receipt = (await getReceipt(tx, receiptId))!;
    if (receipt.lines.some((l) => l.placed)) throw new PlacementError("This receipt has already been saved");
    if (receipt.needsReview) throw new PlacementError("Check this receipt first: its lines don't add up to the total");

    const jobIds = [...new Set(choices.flatMap((c) => c.rows.map((r) => r.jobId)))];
    if (jobIds.length) {
      const found = await tx.query<{ id: string }>("select id from jobs where id = any($1::uuid[])", [jobIds]);
      if (found.length !== jobIds.length) throw new PlacementError("One of the jobs no longer exists");
    }

    let p: Placement;
    try {
      p = computePlacement(toPlaceLines(receipt), choices);
    } catch (e) {
      throw new PlacementError(e instanceof Error ? e.message : String(e));
    }
    if (p.tooMuch) throw new PlacementError("Too much assigned on a line; fix it before saving");
    if (!p.canSave) throw new PlacementError("Every item needs a place before saving");

    for (const a of p.allocations) {
      await tx.query(
        `insert into allocations (line_id, job_id, position, kind, amount, cents) values ($1, $2, $3, $4, $5, $6)`,
        [a.lineId, a.jobId, a.position, a.kind, a.amount, a.cents],
      );
    }
    for (const l of p.lines) {
      await tx.query("update receipt_lines set leftover = $2, placed = true where id = $1", [l.lineId, l.leftover]);
    }
    for (const j of p.jobs) {
      const [{ id: entryId }] = await tx.query<{ id: string }>(
        `insert into material_entries (job_id, origin, receipt_id, label, cents)
         values ($1, 'receipt', $2, $3, $4) returning id`,
        [j.jobId, receiptId, receipt.supplier, j.cents],
      );
      for (const [i, l] of j.lines.entries()) {
        await tx.query(
          `insert into material_entry_lines (entry_id, position, name, detail, cents, vat_rate)
           values ($1, $2, $3, $4, $5, $6)`,
          [entryId, i + 1, l.name, l.detail, l.cents, l.vatRate],
        );
      }
    }
    for (const s of p.stock) {
      await tx.query(
        `insert into stock_items (name, qty, unit, original_qty, value_cents, vat_rate, origin, source_line_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [s.name, s.qty, s.unit, s.originalQty, s.valueCents, s.vatRate, receipt.supplier, s.lineId],
      );
    }
    return p;
  });
}

