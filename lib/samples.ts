// Demo receipts from the prototype (BN_SAMPLES), used until receipt reading (slice 3)
// exists and for demos. Each is what a reader would return for that receipt.
import type { NewReceipt, NewReceiptLine } from "./db/receipts";
import type { Unit } from "./money";

type Item = { name: string; short: string; qty: number; unit: number; measure: number | null; word: Unit | null };

function line(i: Item): NewReceiptLine {
  return {
    name: i.name,
    short: i.short,
    qty: i.qty,
    unitPriceCents: i.unit,
    lineCents: i.qty * i.unit,
    measure: i.measure,
    unit: i.word,
    vatRate: 21,
  };
}

function receipt(supplier: string, date: string, source: NewReceipt["source"], items: Item[]): NewReceipt {
  const lines = items.map(line);
  return { supplier, date, source, totalCents: lines.reduce((a, l) => a + l.lineCents, 0), lines };
}

export const SAMPLE_RECEIPTS: NewReceipt[] = [
  receipt("Hornbach", "2026-10-18", "photo", [
    { name: "Wall tiles 30×60 white", short: "TEGEL 30X60 WIT", qty: 3, unit: 2495, measure: 3, word: "boxes" },
    { name: "Tile adhesive 25 kg", short: "TEGELLIJM 25KG", qty: 1, unit: 1849, measure: 25, word: "kg" },
    { name: "Grout, grey 5 kg", short: "VOEGMIDDEL GRIJS", qty: 1, unit: 1299, measure: 5, word: "kg" },
    { name: "Screws 4×40, 200 pcs", short: "SCHROEF 4X40 200ST", qty: 1, unit: 1895, measure: 200, word: "pcs" },
    { name: "Ceiling paint white 2.5 L", short: "PLAFONDVERF 2,5L", qty: 1, unit: 3499, measure: 2.5, word: "L" },
  ]),
  receipt("Technische Unie", "2026-10-18", "photo", [
    { name: "Installation cable 3×2.5 mm², 100 m", short: "VD KABEL 3X2.5 100M", qty: 1, unit: 8900, measure: 100, word: "m" },
    { name: "Flush socket, double", short: "WCD INBOUW 2V", qty: 2, unit: 645, measure: 2, word: "pcs" },
    { name: "Junction boxes, 10 pcs", short: "LASDOOS 10ST", qty: 1, unit: 780, measure: 10, word: "pcs" },
  ]),
  receipt("Wasco", "2026-10-17", "pdf", [
    { name: "Thermostatic radiator valve", short: "THERM. RADIATORKRAAN", qty: 4, unit: 2450, measure: 4, word: "pcs" },
    { name: "Copper pipe 15 mm, 5 m", short: "KOPERBUIS 15MM 5M", qty: 1, unit: 2895, measure: 5, word: "m" },
    { name: "Press fittings 15 mm, 10 pcs", short: "PERSFITTING 15MM 10ST", qty: 1, unit: 3480, measure: 10, word: "pcs" },
  ]),
  receipt("Bol.com", "2026-10-16", "email", [
    { name: "LED work light 30 W", short: "LED BOUWLAMP 30W", qty: 1, unit: 4999, measure: 1, word: "pcs" },
    { name: "Drill bit set, 15 pcs", short: "BORENSET 15DLG", qty: 1, unit: 2499, measure: 15, word: "pcs" },
  ]),
  receipt("Technische Unie", "2026-10-17", "einvoice", [
    { name: "Cable duct 40×40, 2 m", short: "KABELGOOT 40X40 2M", qty: 3, unit: 645, measure: 6, word: "m" },
    { name: "Circuit breaker 16 A", short: "AUTOMAAT 16A", qty: 2, unit: 1295, measure: 2, word: "pcs" },
    { name: "Residual current device 40 A", short: "AARDLEKSCHAKELAAR 40A", qty: 1, unit: 4950, measure: 1, word: "pcs" },
  ]),
  // Not in the prototype: a receipt whose measure is unknown (demo checklist: "screws, no count").
  receipt("Praxis", "2026-10-18", "photo", [
    { name: "Screws, assorted box", short: "SCHROEVEN ASS.", qty: 1, unit: 1295, measure: null, word: null },
    { name: "Sanitary silicone, white", short: "SANITAIRKIT WIT", qty: 1, unit: 695, measure: 1, word: "pcs" },
  ]),
];
