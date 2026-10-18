// Reading a receipt: send the photo or PDF to Claude, get the receipt JSON back
// (structured output, so it always has the WireReceipt shape), then run the checks.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { assess, type Assessment } from "./checks";
import { ReadError } from "./errors";
import { WireReceipt } from "./schema";

export const RECEIPT_MODEL = "claude-sonnet-5-5";

export type ReceiptMediaType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export type ReceiptFile = { bytes: Uint8Array; mediaType: ReceiptMediaType; name?: string };

/** Anything that turns a file into the reader's raw answer: Claude, or a fake in tests. */
export type ReceiptReader = (file: ReceiptFile, signal?: AbortSignal) => Promise<WireReceipt>;

export const SYSTEM_PROMPT = `You read purchase receipts and supplier invoices for a Dutch tradesperson's bookkeeping (plumber, electrician, painter). Most are Dutch. Return the receipt exactly as printed; never guess.

Lines
- One entry per bought item, in printed order. Include costs such as shipping or deposits as lines.
- Leave out payment lines (PIN, contant, wisselgeld), subtotals, VAT summaries and loyalty points.
- A discount or return printed as its own line gets a negative lineTotalCents; do not take it off another line yourself.
- "short" is the item text exactly as printed. "name" is a short, clear English description.
- "qty" is the quantity as printed ("3 x 24,95" means qty 3, unit price 24,95); 1 when none is printed.

Money
- All amounts in euro cents, including VAT. Dutch amounts use a decimal comma: "24,95" is 2495.
- If the document prints prices excluding VAT, convert each line to incl. VAT: round(excl × (1 + rate/100)). totalCents is the total incl. VAT as printed.
- vatRate is 21 or 9, taken from the VAT codes or VAT summary on the receipt (21 is the standard rate; 9 is for food and drinks, among others).
- Do not change amounts to make them add up. If something is unreadable, give what is printed.

Measure (the total amount bought on the line, used to split it over jobs)
- Only when the receipt states it. Never estimate.
- Item sold per piece: measure = qty, unit "pcs".
- Pack contents printed ("200ST", "10 stuks", "15-delig"): measure = contents × qty, unit "pcs".
- Size printed ("25KG", "4M", "2,5L", "250ML"): measure = size × qty in kg, m or L (250 ml is 0.25 L).
- Sold per box ("DOOS") without a printed count: measure = qty, unit "boxes".
- Anything else (assortments, shipping, sizes in units other than pcs, m, L, kg, boxes such as m²): measure null and unit null.

Not a receipt
- If the document is not a receipt or invoice with item lines (a card payment slip only, a note, a photo of something else), set isReceipt false, explain in "problem", and leave lines empty.`;

function contentFor(file: ReceiptFile): Anthropic.Beta.BetaContentBlockParam {
  const data = Buffer.from(file.bytes).toString("base64");
  return file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data } };
}

/** The part of the SDK the reader uses, so tests can pass a fake. */
export type ParseFn = (
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
) => Promise<{ stop_reason: string | null; parsed_output?: unknown }>;

/**
 * A reader backed by the Claude API. Without `parse` it builds a real client from
 * `apiKey` (ANTHROPIC_API_KEY); without a key every read fails with "no_key".
 */
export function claudeReader(opts: { apiKey?: string; parse?: ParseFn; timeoutMs?: number } = {}): ReceiptReader {
  let parse = opts.parse;
  if (!parse) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return async () => Promise.reject(new ReadError("no_key"));
    const client = new Anthropic({
      apiKey,
      // Developer tools (Claude Code among them) set ANTHROPIC_BASE_URL for their own
      // traffic; the app always talks to the Claude API itself.
      baseURL: "https://api.anthropic.com",
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: 1,
    });
    parse = (params, options) => client.beta.messages.parse(params, options);
  }
  const call = parse;

  return async (file, signal) => {
    let res: Awaited<ReturnType<ParseFn>>;
    try {
      res = await call(
        {
          model: RECEIPT_MODEL,
          max_tokens: 16000,
          // If the model declines, the API retries on its default fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { format: betaZodOutputFormat(WireReceipt), effort: "medium" },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: [contentFor(file), { type: "text", text: "Read this receipt." }] }],
        },
        { signal },
      );
    } catch (e) {
      throw toReadError(e);
    }
    if (res.stop_reason === "refusal") throw new ReadError("invalid", "the model declined to read it");
    if (res.stop_reason === "max_tokens") throw new ReadError("invalid", "answer was cut off (max_tokens)");
    const parsed = WireReceipt.safeParse(res.parsed_output);
    if (!parsed.success) throw new ReadError("invalid", `answer didn't match the schema: ${parsed.error.message}`);
    return parsed.data;
  };
}

function toReadError(e: unknown): ReadError {
  if (e instanceof ReadError) return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ReadError("timeout");
  if (e instanceof Anthropic.APIUserAbortError) return new ReadError("timeout", "cancelled");
  if (e instanceof Anthropic.AuthenticationError) return new ReadError("api", "the API key was refused");
  if (e instanceof Anthropic.BadRequestError) return new ReadError("invalid", `bad request: ${e.message}`);
  if (e instanceof Anthropic.APIError) return new ReadError("api", `${e.status ?? "connection"}: ${e.message}`);
  // The SDK throws while parsing an answer that isn't valid JSON for the schema.
  return new ReadError("invalid", e instanceof Error ? e.message : String(e));
}

/** Read a receipt and check it. `today` (YYYY-MM-DD) stands in for a date the receipt doesn't show. */
export async function readReceipt(
  file: ReceiptFile,
  reader: ReceiptReader,
  today: string,
  signal?: AbortSignal,
): Promise<Assessment> {
  return assess(await reader(file, signal), today);
}
