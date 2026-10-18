"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { createJob, listJobs, setLabour } from "@/lib/db/jobs";
import { createReceipt, PlacementError, saveReceiptPlacement } from "@/lib/db/receipts";
import { formatEuro, parseEuroInput } from "@/lib/format";
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
    const saved = `Saved: ${parts.join(", ") || "nothing to bill"}.`;
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
