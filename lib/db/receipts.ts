// Receipts: create one (from a reader or a demo sample), load it for "Where did it go?",
// correct it on "Check receipt" when it doesn't add up,
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
  /** The reader noticed something else that needs a person (e.g. qty × price ≠ line total). */
  needsReview?: boolean;
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
  /** Key of the original file in the file store (lib/files.ts), if there is one. */
  filePath: string | null;
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
  const needsReview = sum !== r.totalCents || !!r.needsReview;
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
  file_path: string | null;
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
    `select id, supplier, receipt_date, source, total_cents, file_path, needs_review, moneybird_status from receipts where id = $1`,
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
    filePath: r.file_path,
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

export class ReceiptEditError extends Error {}

/** A line on "Check receipt": an existing line (with id) or a new one the photo didn't show. */
export type EditedLine = { id?: string; name: string; lineCents: Cents };

/**
 * Save "Check receipt": the user's corrected names, line totals and receipt total.
 * Lines left out are removed; new lines get qty 1, unknown measure and 21% VAT.
 * The receipt needs review until its lines add up to the total.
 */
export async function updateReceiptLines(
  db: Db,
  receiptId: string,
  edit: { totalCents: Cents; lines: EditedLine[] },
): Promise<{ needsReview: boolean }> {
  const isCents = (c: unknown) => Number.isSafeInteger(c) && (c as number) >= 0;
  if (!isCents(edit.totalCents)) throw new ReceiptEditError("The receipt total must be an amount of 0 or more");
  if (!edit.lines.length) throw new ReceiptEditError("A receipt needs at least one line");
  for (const l of edit.lines) {
    if (!l.name.trim()) throw new ReceiptEditError("Every line needs a name");
    if (!isCents(l.lineCents)) throw new ReceiptEditError("Every line needs an amount of 0 or more");
  }
  return db.transaction(async (tx) => {
    const [locked] = await tx.query<{ id: string }>("select id from receipts where id = $1 for update", [receiptId]);
    if (!locked) throw new ReceiptEditError("Receipt not found");
    const current = await tx.query<{ id: string; qty: number; line_cents: number; placed: boolean }>(
      "select id, qty, line_cents, placed from receipt_lines where receipt_id = $1",
      [receiptId],
    );
    if (current.some((l) => l.placed)) throw new ReceiptEditError("This receipt has already been saved");
    const byId = new Map(current.map((l) => [l.id, l]));
    const kept = new Set(edit.lines.flatMap((l) => (l.id ? [l.id] : [])));
    for (const id of kept) if (!byId.has(id)) throw new ReceiptEditError("A line on this receipt no longer exists");
    if (kept.size !== edit.lines.filter((l) => l.id).length) throw new ReceiptEditError("A line appears twice");

    for (const l of current) {
      if (!kept.has(l.id)) await tx.query("delete from receipt_lines where id = $1", [l.id]);
    }
    // move positions out of the way first: (receipt_id, position) is unique
    await tx.query("update receipt_lines set position = -position where receipt_id = $1", [receiptId]);
    for (const [i, l] of edit.lines.entries()) {
      const old = l.id ? byId.get(l.id) : undefined;
      if (old) {
        // keep the printed unit price unless the line total changed
        const unitPrice = old.line_cents === l.lineCents ? null : Math.round(l.lineCents / old.qty);
        await tx.query(
          "update receipt_lines set position = $2, name = $3, line_cents = $4, unit_price_cents = coalesce($5, unit_price_cents) where id = $1",
          [old.id, i + 1, l.name.trim(), l.lineCents, unitPrice],
        );
      } else {
        await tx.query(
          `insert into receipt_lines (receipt_id, position, name, short, qty, unit_price_cents, line_cents, measure, unit, vat_rate)
           values ($1, $2, $3, $3, 1, $4, $4, null, null, 21)`,
          [receiptId, i + 1, l.name.trim(), l.lineCents],
        );
      }
    }
    const needsReview = edit.lines.reduce((a, l) => a + l.lineCents, 0) !== edit.totalCents;
    await tx.query("update receipts set total_cents = $2, needs_review = $3 where id = $1", [receiptId, edit.totalCents, needsReview]);
    return { needsReview };
  });
}

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

