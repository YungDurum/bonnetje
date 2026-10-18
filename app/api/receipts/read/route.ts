// POST a photo or PDF (multipart "file", optional "name"): read it, keep the original,
// store the receipt, and answer { id } for "Where did it go?" — or { error, message }.
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { createReceipt } from "@/lib/db/receipts";
import { getReader, ReadError, readReceipt } from "@/lib/extract";
import type { ReadErrorCode } from "@/lib/extract/errors";
import { getFileStore, MAX_FILE_BYTES, sniffMediaType } from "@/lib/files";

export const dynamic = "force-dynamic";

const STATUS: Record<ReadErrorCode, number> = {
  no_key: 503,
  unsupported_file: 415,
  too_large: 413,
  not_a_receipt: 422,
  invalid: 422,
  timeout: 504,
  api: 502,
};

export type ReadResponse =
  | { id: string; needsReview: boolean }
  | { error: ReadErrorCode | "server"; message: string; retryable: boolean };

function fail(e: ReadError) {
  return Response.json({ error: e.code, message: e.message, retryable: e.retryable } satisfies ReadResponse, {
    status: STATUS[e.code],
  });
}

/** Today in the Netherlands as YYYY-MM-DD, for a receipt without a readable date. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(new ReadError("unsupported_file", "not a multipart upload"));
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(new ReadError("unsupported_file", "no file"));
  if (file.size > MAX_FILE_BYTES) return fail(new ReadError("too_large"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) return fail(new ReadError("unsupported_file", `type ${file.type || "unknown"}`));
  const name = String(form.get("name") || file.name || "");

  try {
    const { receipt, needsReview, problems } = await readReceipt({ bytes, mediaType, name }, getReader(), today(), req.signal);
    if (problems.length) console.warn(`Receipt ${name}: ${problems.join("; ")}`);
    const filePath = await getFileStore().save(bytes, mediaType);
    const id = await createReceipt(await getDb(), {
      supplier: receipt.supplier,
      date: receipt.date,
      source: mediaType === "application/pdf" ? "pdf" : "photo",
      totalCents: receipt.totalCents,
      filePath,
      needsReview,
      lines: receipt.lines.map((l) => ({
        name: l.name,
        short: l.short,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        lineCents: l.lineTotalCents,
        measure: l.measure,
        unit: l.unit,
        vatRate: l.vatRate,
      })),
    });
    revalidatePath("/");
    return Response.json({ id, needsReview } satisfies ReadResponse);
  } catch (e) {
    if (e instanceof ReadError) {
      console.warn(`Reading ${name} failed: ${e.code}${e.detail ? ` (${e.detail})` : ""}`);
      return fail(e);
    }
    console.error("Saving a read receipt failed", e);
    return Response.json(
      { error: "server", message: "Something went wrong saving the receipt. Try again.", retryable: true } satisfies ReadResponse,
      { status: 500 },
    );
  }
}
