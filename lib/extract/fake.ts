// A reader that doesn't call Claude (BONNETJE_READER=fake): for the e2e tests and demos
// without an API key. It answers from samples/<name>.expected.json when the uploaded
// file has a sample's name, and with a small fixed receipt otherwise.
import { readFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { ReadError } from "./errors";
import type { ReceiptReader } from "./reader";
import type { WireReceipt } from "./schema";

type Expected =
  | { error: string }
  | (Omit<WireReceipt, "isReceipt" | "problem" | "lines"> & { lines: Omit<WireReceipt["lines"][number], "name">[] });

const FALLBACK: WireReceipt = {
  isReceipt: true,
  problem: null,
  supplier: "Klushuis Amersfoort",
  date: "2026-10-18",
  totalCents: 3148,
  lines: [
    { name: "Tile adhesive 25 kg", short: "TEGELLIJM 25KG", qty: 1, unitPriceCents: 1849, lineTotalCents: 1849, measure: 25, unit: "kg", vatRate: 21 },
    { name: "Grout, grey 5 kg", short: "VOEGMIDDEL GRIJS 5KG", qty: 1, unitPriceCents: 1299, lineTotalCents: 1299, measure: 5, unit: "kg", vatRate: 21 },
  ],
};

const tidy = (short: string) => short.charAt(0) + short.slice(1).toLowerCase();

export function fakeReader(samplesDir = join(process.cwd(), "samples")): ReceiptReader {
  return async (file) => {
    const base = file.name ? parse(file.name).name : "";
    let expected: Expected;
    try {
      expected = JSON.parse(await readFile(join(samplesDir, `${base}.expected.json`), "utf8"));
    } catch {
      return FALLBACK;
    }
    if ("error" in expected) throw new ReadError("not_a_receipt", `fake reader: ${expected.error}`);
    return {
      isReceipt: true,
      problem: null,
      supplier: expected.supplier,
      date: expected.date,
      totalCents: expected.totalCents,
      lines: expected.lines.map((l) => ({ ...l, name: tidy(l.short) })),
    };
  };
}
