import type { Queryable } from "./client";

/** Why a receipt isn't in Moneybird yet (null when sent, or nothing was tried). */
export async function receiptMoneybirdError(db: Queryable, receiptId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return null;
  const [r] = await db.query<{ moneybird_error: string | null }>("select moneybird_error from receipts where id = $1", [receiptId]);
  return r?.moneybird_error ?? null;
}
