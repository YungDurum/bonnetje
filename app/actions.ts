"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { createJob, listJobs, setLabour } from "@/lib/db/jobs";
import { createReceipt, PlacementError, saveReceiptPlacement } from "@/lib/db/receipts";
import { ensureMoneybirdJob, sendJobInvoice, sendReceipt } from "@/lib/db/invoices";
import { readStoredFile } from "@/lib/files";
import { NOT_CONNECTED } from "@/lib/invoice-view";
import { getMoneybird } from "@/lib/moneybird";
import { addManualMaterial, addStock, putStockOnJob, removeStock, StockError } from "@/lib/db/stock";
import { formatEuro, parseEuroInput } from "@/lib/format";
import type { Unit } from "@/lib/money";
import type { StockUse } from "@/lib/stock";
import type { LineChoice } from "@/lib/placement";
import { SAMPLE_RECEIPTS } from "@/lib/samples";

export type NewJobState = { error?: string; field?: "client" | "title" | "rate" };

export async function createJobAction(_prev: NewJobState, formData: FormData): Promise<NewJobState> {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const client = text("client");
  const title = text("title");
  const address = text("address");
  const mode = text("mode");
  const rateCents = parseEuroInput(text("rate"));

  if (!client) return { error: "Fill in a client.", field: "client" };
  if (!title) return { error: "Fill in what the job is.", field: "title" };
  if (mode !== "hour" && mode !== "day") return { error: "Choose hourly or day rate." };
  if (rateCents === null) return { error: "Enter a rate like 62.50.", field: "rate" };

  const db = await getDb();
  let id: string;
  try {
    id = await createJob(db, { client, title, address, mode, rateCents });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the job." };
  }
  // A job is a contact + project in Moneybird. If this fails it is retried when invoicing.
  try {
    const mb = await getMoneybird();
    if (mb) await ensureMoneybirdJob(db, mb, id);
  } catch {
    // never block creating the job
  }
  revalidatePath("/");
  redirect(`/jobs/${id}`);
}

export type LabourInput = { jobId: string; mode: "hour" | "day"; rateCents: number; half: number };
export type LabourResult = { ok: true } | { ok: false; error: string };

export async function setLabourAction(input: LabourInput): Promise<LabourResult> {
  const { jobId, mode, rateCents, half } = input;
  if (mode !== "hour" && mode !== "day") return { ok: false, error: "Choose hourly or day rate." };
  if (!Number.isSafeInteger(rateCents) || rateCents < 0) return { ok: false, error: "Enter a rate like 62.50." };
  if (!Number.isSafeInteger(half) || half < 0) return { ok: false, error: "Time can't be below 0." };
  try {
    await setLabour(await getDb(), jobId, { mode, rateCents, half });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Demo: create one of the sample receipts and open it on "Where did it go?". */
export async function createSampleReceiptAction(index: number): Promise<void> {
  const sample = Number.isInteger(index) ? SAMPLE_RECEIPTS[index] : undefined;
  if (!sample) redirect("/receipts/new");
  const id = await createReceipt(await getDb(), sample);
  redirect(`/receipts/${id}`);
}

export type SaveReceiptResult = { ok: false; error: string };

function validChoices(choices: unknown): choices is LineChoice[] {
  return (
    Array.isArray(choices) &&
    choices.every(
      (c) =>
        c &&
        ["measure", "part", "euro"].includes(c.kind) &&
        ["stock", "client", "waste"].includes(c.leftover) &&
        typeof c.placed === "boolean" &&
        Array.isArray(c.rows) &&
        c.rows.every(
          (r: { jobId?: unknown; value?: unknown }) =>
            typeof r?.jobId === "string" &&
            typeof r.value === "number" &&
            Number.isFinite(r.value) &&
            r.value >= 0 &&
            r.value < 1e9,
        ),
    )
  );
}

/** Save "Where did it go?": the server recomputes everything; then go to the first job with a "Saved" message. */
export async function saveReceiptAction(receiptId: string, choices: LineChoice[]): Promise<SaveReceiptResult> {
  if (!validChoices(choices)) return { ok: false, error: "Something is wrong with the split. Reload and try again." };
  const db = await getDb();
  let target: string;
  try {
    const p = await saveReceiptPlacement(db, receiptId, choices);
    const clients = new Map((await listJobs(db)).map((j) => [j.id, j.client]));
    const parts = p.jobs.map((j) => `${formatEuro(j.cents)} → ${clients.get(j.jobId) ?? "job"}`);
    if (p.stockCents > 0) parts.push(`${formatEuro(p.stockCents)} → stock`);
    if (p.wasteCents > 0) parts.push(`${formatEuro(p.wasteCents)} waste`);
    let sent = false;
    try {
      const mb = await getMoneybird();
      if (mb) sent = (await sendReceipt(db, mb, receiptId, readStoredFile)).ok;
    } catch {
      // the receipt stays 'pending'; it can be sent again from the receipt page
    }
    const saved = `Saved: ${parts.join(", ") || "nothing to bill"}.${sent ? " Receipt sent to Moneybird." : ""}`;
    revalidatePath("/");
    revalidatePath("/stock");
    revalidatePath("/expenses");
    for (const j of p.jobs) revalidatePath(`/jobs/${j.jobId}`);
    target = `${p.jobs[0] ? `/jobs/${p.jobs[0].jobId}` : "/"}?${new URLSearchParams({ saved })}`;
  } catch (e) {
    if (e instanceof PlacementError) return { ok: false, error: e.message };
    return { ok: false, error: "Could not save the receipt. Try again." };
  }
  redirect(target);
}

// ---------- Moneybird ----------

export type MoneybirdResult = { ok: true } | { ok: false; error: string };

/** Send the job's invoice to Moneybird; on success go to the confirmation. */
export async function sendInvoiceAction(jobId: string): Promise<MoneybirdResult> {
  if (!isId(jobId)) return { ok: false, error: "Job not found" };
  let mb;
  try {
    mb = await getMoneybird();
  } catch {
    return { ok: false, error: "Could not reach Moneybird. Try again." };
  }
  if (!mb) return { ok: false, error: NOT_CONNECTED };
  const r = await sendJobInvoice(await getDb(), mb, jobId);
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  if (!r.ok) return { ok: false, error: r.error };
  redirect(`/jobs/${jobId}/invoice?sent=1`);
}

/** Send a saved receipt to Moneybird again. */
export async function sendReceiptAction(receiptId: string): Promise<MoneybirdResult> {
  if (!isId(receiptId)) return { ok: false, error: "Receipt not found" };
  let mb;
  try {
    mb = await getMoneybird();
  } catch {
    return { ok: false, error: "Could not reach Moneybird. Try again." };
  }
  if (!mb) return { ok: false, error: NOT_CONNECTED };
  const r = await sendReceipt(await getDb(), mb, receiptId, readStoredFile);
  revalidatePath(`/receipts/${receiptId}`);
  revalidatePath("/expenses");
  return r;
}

// ---------- stock ----------

export type StockResult = { ok: true } | { ok: false; error: string };
export type UseResult = { ok: true; usedLabel: string; usedUp: boolean } | { ok: false; error: string };

const UNITS: Unit[] = ["pcs", "m", "L", "kg", "boxes"];
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e7;
const isCents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < 1e9;
const failure = (e: unknown, fallback: string) => ({
  ok: false as const,
  error: e instanceof StockError ? e.message : fallback,
});

export type AddStockInput = { name: string; qty: number; unit: Unit; valueCents: number };

export async function addStockAction(input: AddStockInput): Promise<StockResult> {
  const { name, qty, unit, valueCents } = input ?? ({} as AddStockInput);
  if (typeof name !== "string" || !name.trim() || name.length > 200) return { ok: false, error: "Fill in what it is" };
  if (!isAmount(qty)) return { ok: false, error: "Amount must be more than 0" };
  if (!UNITS.includes(unit)) return { ok: false, error: "Choose a unit" };
  if (!isCents(valueCents)) return { ok: false, error: "Value must be 0 or more" };
  try {
    await addStock(await getDb(), { name, qty, unit, valueCents });
  } catch (e) {
    return failure(e, "Could not add to stock. Try again.");
  }
  revalidatePath("/");
  revalidatePath("/stock");
  return { ok: true };
}

export async function removeStockAction(id: string): Promise<StockResult> {
  if (!isId(id)) return { ok: false, error: "This item is no longer in stock" };
  try {
    await removeStock(await getDb(), id);
  } catch (e) {
    return failure(e, "Could not remove it. Try again.");
  }
  revalidatePath("/");
  revalidatePath("/stock");
  return { ok: true };
}

function validUse(use: unknown): use is StockUse {
  const u = use as { kind?: unknown; amount?: unknown; fraction?: unknown; cents?: unknown } | null;
  if (!u) return false;
  if (u.kind === "measure") return isAmount(u.amount);
  if (u.kind === "part") return typeof u.fraction === "number" && u.fraction > 0 && u.fraction <= 1;
  if (u.kind === "euro") return isCents(u.cents);
  return false;
}

export async function putStockOnJobAction(stockId: string, jobId: string, use: StockUse): Promise<UseResult> {
  if (!isId(stockId) || !isId(jobId)) return { ok: false, error: "This item is no longer in stock" };
  if (!validUse(use)) return { ok: false, error: "Choose how much you used" };
  try {
    const r = await putStockOnJob(await getDb(), stockId, jobId, use);
    revalidatePath("/");
    revalidatePath("/stock");
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, usedLabel: r.usedLabel, usedUp: r.usedUp };
  } catch (e) {
    return failure(e, "Could not put it on the job. Try again.");
  }
}

export type ManualInput = { jobId: string; name: string; qty: number; priceCents: number };

export async function addManualMaterialAction(input: ManualInput): Promise<StockResult> {
  const { jobId, name, qty, priceCents } = input ?? ({} as ManualInput);
  if (!isId(jobId)) return { ok: false, error: "Job not found" };
  if (typeof name !== "string" || !name.trim() || name.length > 200) return { ok: false, error: "Fill in what it is" };
  if (!isAmount(qty)) return { ok: false, error: "Quantity must be more than 0" };
  if (!isCents(priceCents) || priceCents === 0) return { ok: false, error: "Price must be more than 0" };
  try {
    await addManualMaterial(await getDb(), jobId, { name, qty, priceCents });
  } catch (e) {
    return failure(e, "Could not add it. Try again.");
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
