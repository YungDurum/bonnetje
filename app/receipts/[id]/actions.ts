"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { ReceiptEditError, updateReceiptLines, type EditedLine } from "@/lib/db/receipts";

export type CheckReceiptResult = { ok: true; needsReview: boolean } | { ok: false; error: string };

function validEdit(edit: unknown): edit is { totalCents: number; lines: EditedLine[] } {
  const e = edit as { totalCents?: unknown; lines?: unknown };
  return (
    !!e &&
    typeof e.totalCents === "number" &&
    Array.isArray(e.lines) &&
    e.lines.every(
      (l: { id?: unknown; name?: unknown; lineCents?: unknown }) =>
        l && (l.id === undefined || typeof l.id === "string") && typeof l.name === "string" && typeof l.lineCents === "number",
    )
  );
}

/** Save "Check receipt": corrected lines and total. */
export async function checkReceiptAction(receiptId: string, edit: unknown): Promise<CheckReceiptResult> {
  if (!validEdit(edit)) return { ok: false, error: "Could not save these changes." };
  try {
    const { needsReview } = await updateReceiptLines(await getDb(), receiptId, edit);
    revalidatePath(`/receipts/${receiptId}`);
    return { ok: true, needsReview };
  } catch (e) {
    if (e instanceof ReceiptEditError) return { ok: false, error: e.message };
    console.error("Check receipt failed", e);
    return { ok: false, error: "Could not save these changes. Try again." };
  }
}
