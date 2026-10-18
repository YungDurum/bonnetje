// The receipt JSON from CLAUDE.md ("Receipt extraction"), twice:
// - WireReceipt: what the model is asked to return. Structured outputs can't express
//   numeric limits, so this one only fixes the shape; it also lets the model say
//   "this is not a receipt" instead of making one up.
// - ExtractedReceipt: the strict version every reading must pass before it is stored.
import { z } from "zod";

export const UNITS = ["pcs", "m", "L", "kg", "boxes"] as const;

export const WireLine = z.object({
  name: z.string().describe("Short, clear English description of the item, e.g. 'Tile adhesive 25 kg'"),
  short: z.string().describe("The item text exactly as printed on the receipt"),
  qty: z.number().describe("Quantity bought, as printed (1 when no quantity is printed)"),
  unitPriceCents: z.number().describe("Price per unit incl. VAT, in euro cents"),
  lineTotalCents: z.number().describe("Line total incl. VAT, in euro cents"),
  measure: z
    .number()
    .nullable()
    .describe("Total measure bought on this line, only when the receipt states it; otherwise null"),
  // Free text on the wire: an unknown unit becomes "measure unknown" in the checks
  // instead of failing the whole reading.
  unit: z.string().nullable().describe(`Unit of the measure, one of ${UNITS.join(", ")}; null when measure is null`),
  vatRate: z.number().describe("VAT rate of this line in percent: 21 or 9"),
});

export const WireReceipt = z.object({
  isReceipt: z.boolean().describe("false when the document is not a purchase receipt or invoice with item lines"),
  problem: z.string().nullable().describe("When isReceipt is false or the document is unreadable: why, in one short sentence"),
  supplier: z.string().nullable().describe("Shop or supplier name"),
  date: z.string().nullable().describe("Purchase or invoice date as YYYY-MM-DD"),
  lines: z.array(WireLine),
  totalCents: z.number().nullable().describe("Total paid incl. VAT, in euro cents, as printed"),
});

export type WireReceipt = z.infer<typeof WireReceipt>;
export type WireLine = z.infer<typeof WireLine>;

const cents = z.number().int().min(0);

export const ExtractedLine = z
  .object({
    name: z.string().trim().min(1),
    short: z.string().trim().min(1),
    qty: z.number().positive(),
    unitPriceCents: cents,
    lineTotalCents: cents,
    measure: z.number().positive().nullable(),
    unit: z.enum(UNITS).nullable(),
    vatRate: z.union([z.literal(21), z.literal(9)]),
  })
  .refine((l) => (l.measure === null) === (l.unit === null), {
    message: "measure and unit must both be set or both be unknown",
  });

export const ExtractedReceipt = z.object({
  supplier: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(ExtractedLine).min(1),
  totalCents: cents,
});

export type ExtractedLine = z.infer<typeof ExtractedLine>;
export type ExtractedReceipt = z.infer<typeof ExtractedReceipt>;
