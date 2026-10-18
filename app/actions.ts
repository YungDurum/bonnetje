"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { createJob, setLabour } from "@/lib/db/jobs";
import { parseEuroInput } from "@/lib/format";

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
