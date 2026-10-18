// Stock: list, add by hand, use on a job (all or part), remove (used up / thrown away).
// Also "Add manually" on a job, which is a material entry without a receipt.
import { formatEuro } from "../format";
import type { Cents, Unit, VatRate } from "../money";
import { manualCents, takeFromStock, type StockUse } from "../stock";
import type { Db, Queryable } from "./client";

export type StockItem = {
  id: string;
  name: string;
  qty: number | null;
  unit: Unit | null;
  originalQty: number | null;
  valueCents: Cents;
  vatRate: VatRate;
  origin: string;
  createdAt: string;
};

type StockRow = {
  id: string;
  name: string;
  qty: number | null;
  unit: Unit | null;
  original_qty: number | null;
  value_cents: number;
  vat_rate: VatRate;
  origin: string;
  created_at: Date | string;
};

function toItem(r: StockRow): StockItem {
  return {
    id: r.id,
    name: r.name,
    qty: r.qty,
    unit: r.unit,
    originalQty: r.original_qty,
    valueCents: r.value_cents,
    vatRate: r.vat_rate,
    origin: r.origin,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

const columns = "id, name, qty, unit, original_qty, value_cents, vat_rate, origin, created_at";

export class StockError extends Error {}

/** Newest first; `search` matches name or origin, case-insensitive. */
export async function listStock(db: Queryable, search = ""): Promise<StockItem[]> {
  const q = search.trim();
  const rows = await db.query<StockRow>(
    `select ${columns} from stock_items
      where $1 = '' or name ilike '%' || $1 || '%' or origin ilike '%' || $1 || '%'
      order by created_at desc, id desc`,
    [q.replace(/[\\%_]/g, (c) => "\\" + c)],
  );
  return rows.map(toItem);
}

export async function getStockItem(db: Queryable, id: string): Promise<StockItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.query<StockRow>(`select ${columns} from stock_items where id = $1`, [id]);
  return r ? toItem(r) : null;
}

export type NewStockItem = { name: string; qty: number | null; unit: Unit | null; valueCents: Cents };

/** "Add to stock": things you already had. Not an expense (that's what receipts are for). */
export async function addStock(db: Queryable, s: NewStockItem): Promise<string> {
  const name = s.name.trim();
  if (!name) throw new StockError("Fill in what it is");
  if ((s.qty === null) !== (s.unit === null)) throw new StockError("Give both an amount and a unit");
  if (s.qty !== null && !(s.qty > 0)) throw new StockError("Amount must be more than 0");
  if (!Number.isSafeInteger(s.valueCents) || s.valueCents < 0) throw new StockError("Value must be 0 or more");
  const [{ id }] = await db.query<{ id: string }>(
    `insert into stock_items (name, qty, unit, original_qty, value_cents, origin)
     values ($1, $2, $3, $2, $4, 'Added manually') returning id`,
    [name, s.qty, s.unit, s.valueCents],
  );
  return id;
}

/** Remove from stock: used up or thrown away. Not billed. */
export async function removeStock(db: Queryable, id: string): Promise<void> {
  const done = await db.query<{ id: string }>("delete from stock_items where id = $1 returning id", [id]);
  if (!done.length) throw new StockError("This item is no longer in stock");
}

export type StockUsed = { entryId: string; cents: Cents; usedUp: boolean; usedLabel: string };

/** Use (part of) a stock item on a job: a material entry "Stock" on the job, the rest stays. */
export async function putStockOnJob(db: Db, stockId: string, jobId: string, use: StockUse): Promise<StockUsed> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<StockRow>(`select ${columns} from stock_items where id = $1 for update`, [stockId]);
    if (!row) throw new StockError("This item is no longer in stock");
    const item = toItem(row);
    const [job] = await tx.query<{ id: string }>("select id from jobs where id = $1", [jobId]);
    if (!job) throw new StockError("Job not found");

    let r;
    try {
      r = takeFromStock(item, use);
    } catch (e) {
      throw new StockError(e instanceof Error ? e.message : String(e));
    }
    if (!r.ok) {
      throw new StockError(r.error === "nothing" ? "Choose how much you used" : "That's more than is in stock");
    }

    const [{ id: entryId }] = await tx.query<{ id: string }>(
      `insert into material_entries (job_id, origin, label, cents) values ($1, 'stock', 'Stock', $2) returning id`,
      [jobId, r.cents],
    );
    await tx.query(
      `insert into material_entry_lines (entry_id, position, name, detail, cents, vat_rate) values ($1, 1, $2, $3, $4, $5)`,
      [entryId, item.name, r.usedUp && use.kind !== "euro" ? "" : r.usedLabel, r.cents, item.vatRate],
    );
    if (r.usedUp) {
      await tx.query("delete from stock_items where id = $1", [stockId]);
    } else {
      await tx.query("update stock_items set qty = $2, value_cents = $3 where id = $1", [stockId, r.remainingQty, r.remainingCents]);
    }
    return { entryId, cents: r.cents, usedUp: r.usedUp, usedLabel: r.usedLabel };
  });
}

export type ManualMaterial = { name: string; qty: number; priceCents: Cents };

/** "Add manually" on a job: price incl. VAT × quantity, at 21%. */
export async function addManualMaterial(db: Db, jobId: string, m: ManualMaterial): Promise<{ entryId: string; cents: Cents }> {
  const name = m.name.trim();
  if (!name) throw new StockError("Fill in what it is");
  if (!Number.isSafeInteger(m.priceCents) || m.priceCents <= 0) throw new StockError("Price must be more than 0");
  if (!(m.qty > 0)) throw new StockError("Quantity must be more than 0");
  const cents = manualCents(m.priceCents, m.qty);
  return db.transaction(async (tx) => {
    const [job] = await tx.query<{ id: string }>("select id from jobs where id = $1", [jobId]);
    if (!job) throw new StockError("Job not found");
    const [{ id: entryId }] = await tx.query<{ id: string }>(
      `insert into material_entries (job_id, origin, label, cents) values ($1, 'manual', 'Added manually', $2) returning id`,
      [jobId, cents],
    );
    const detail = m.qty === 1 ? "" : `${m.qty} × ${formatEuro(m.priceCents)}`;
    await tx.query(
      `insert into material_entry_lines (entry_id, position, name, detail, cents, vat_rate) values ($1, 1, $2, $3, $4, 21)`,
      [entryId, name, detail, cents],
    );
    return { entryId, cents };
  });
}
