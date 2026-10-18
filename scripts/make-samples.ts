// Generates the made-up sample receipts in samples/ (images and PDFs) plus the
// <name>.expected.json the extraction report compares against.
// Run: node scripts/make-samples.ts  (Node 22+, uses the Playwright Chromium)
//
// Suppliers, addresses and KvK/VAT numbers are fictional. The receipts are rendered
// from the data below, so every expected value matches what is printed.
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Unit = "pcs" | "m" | "L" | "kg" | "boxes";

type Line = {
  print: string; // the text on the receipt
  qty: number;
  unitCents: number; // incl. VAT
  vat: 21 | 9;
  measure: number | null; // total measure for the line, only when the receipt states it
  unit: Unit | null;
};

type Look = {
  rotate: number; // degrees
  light: number; // 0.6 (dim) .. 1 (bright)
  blur: number; // px
  table: string; // background colour
};

type Sample = {
  file: string; // name in samples/, extension picks the output
  note: string; // why this sample exists
  layout: "thermal" | "a4" | "a4-excl";
  supplier: string;
  address: string[];
  date: string; // YYYY-MM-DD
  time: string;
  lines: Line[];
  look?: Look;
  hideLine?: number; // index of a line covered by a fold (the photo can't show it)
  expected?: { needsReview?: boolean; error?: "not_a_receipt" };
};

const SAMPLES: Sample[] = [
  {
    file: "01-bouwmarkt-tegels.jpg",
    note: "Ordinary till receipt, measures printed in the item names.",
    layout: "thermal",
    supplier: "Klushuis Amersfoort",
    address: ["Ringweg 12", "3812 AB Amersfoort"],
    date: "2026-10-14",
    time: "09:14",
    look: { rotate: -2, light: 0.95, blur: 0.4, table: "#8a6b4e" },
    lines: [
      { print: "TEGEL 30X60 WIT DOOS", qty: 3, unitCents: 2495, vat: 21, measure: 3, unit: "boxes" },
      { print: "TEGELLIJM 25KG", qty: 1, unitCents: 1849, vat: 21, measure: 25, unit: "kg" },
      { print: "VOEGMIDDEL GRIJS 5KG", qty: 1, unitCents: 1299, vat: 21, measure: 5, unit: "kg" },
      { print: "TEGELKRUISJES 3MM 200ST", qty: 1, unitCents: 349, vat: 21, measure: 200, unit: "pcs" },
    ],
  },
  {
    file: "02-groothandel-elektra.pdf",
    note: "A4 wholesaler invoice as PDF, prices incl. VAT, one line is 5 lengths of 4 m.",
    layout: "a4",
    supplier: "Elektrogroothandel Van Dijk B.V.",
    address: ["Industrieweg 40", "3542 AD Utrecht"],
    date: "2026-10-15",
    time: "11:02",
    lines: [
      { print: "VD KABEL 3X2,5MM2 100M", qty: 1, unitCents: 8900, vat: 21, measure: 100, unit: "m" },
      { print: "WCD INBOUW 2-VOUDIG", qty: 2, unitCents: 645, vat: 21, measure: 2, unit: "pcs" },
      { print: "LASDOOS 10ST", qty: 1, unitCents: 780, vat: 21, measure: 10, unit: "pcs" },
      { print: "INSTALLATIEBUIS 16MM 4M", qty: 5, unitCents: 215, vat: 21, measure: 20, unit: "m" },
    ],
  },
  {
    file: "03-bouwmarkt-koffie-9procent.png",
    note: "Mixed VAT: coffee and a snack at 9%, materials at 21%.",
    layout: "thermal",
    supplier: "Bouwcentrum De Hoek",
    address: ["Havenstraat 3", "4811 KN Breda"],
    date: "2026-10-16",
    time: "07:41",
    look: { rotate: 1.5, light: 1, blur: 0.3, table: "#c9c4bb" },
    lines: [
      { print: "PVC BUIS 32MM 4M", qty: 2, unitCents: 789, vat: 21, measure: 8, unit: "m" },
      { print: "PVC BOCHT 32MM 45GR", qty: 4, unitCents: 129, vat: 21, measure: 4, unit: "pcs" },
      { print: "PVC LIJM 250ML", qty: 1, unitCents: 1095, vat: 21, measure: 0.25, unit: "L" },
      { print: "KOFFIE", qty: 2, unitCents: 220, vat: 9, measure: 2, unit: "pcs" },
      { print: "SAUCIJZENBROODJE", qty: 1, unitCents: 245, vat: 9, measure: 1, unit: "pcs" },
    ],
  },
  {
    file: "04-schroeven-onbekend.jpg",
    note: "Measures not on the receipt (assorted box, plugs): must come back as unknown. Dim, tilted photo.",
    layout: "thermal",
    supplier: "Doe-Het-Zelf Centrum Noord",
    address: ["Zuiderkade 88", "1013 AB Amsterdam"],
    date: "2026-10-17",
    time: "16:55",
    look: { rotate: -6, light: 0.7, blur: 0.8, table: "#4a4f55" },
    lines: [
      { print: "SCHROEVEN ASSORTIMENT", qty: 1, unitCents: 1295, vat: 21, measure: null, unit: null },
      { print: "SANITAIRKIT WIT", qty: 1, unitCents: 695, vat: 21, measure: 1, unit: "pcs" },
      { print: "PLUGGEN DOOS", qty: 2, unitCents: 449, vat: 21, measure: null, unit: null },
    ],
  },
  {
    file: "05-schilder-lange-bon.jpg",
    note: "Long receipt (11 lines). Cover film is sold in m², which is not a supported unit, so its measure is unknown.",
    layout: "thermal",
    supplier: "Verfgroothandel Kleurrijk",
    address: ["Molenweg 7", "6511 PT Nijmegen"],
    date: "2026-10-12",
    time: "08:20",
    look: { rotate: 0.8, light: 0.9, blur: 0.5, table: "#6b7b5e" },
    lines: [
      { print: "MUURVERF MAT WIT 10L", qty: 2, unitCents: 6495, vat: 21, measure: 20, unit: "L" },
      { print: "GRONDVERF 2,5L", qty: 1, unitCents: 3299, vat: 21, measure: 2.5, unit: "L" },
      { print: "LAKVERF HOOGGLANS 0,75L", qty: 2, unitCents: 2450, vat: 21, measure: 1.5, unit: "L" },
      { print: "KWAST PLAT 50MM", qty: 3, unitCents: 795, vat: 21, measure: 3, unit: "pcs" },
      { print: "VERFROLLER 25CM", qty: 2, unitCents: 1150, vat: 21, measure: 2, unit: "pcs" },
      { print: "SCHILDERSTAPE 50M", qty: 4, unitCents: 599, vat: 21, measure: 200, unit: "m" },
      { print: "AFDEKFOLIE 4X5M", qty: 3, unitCents: 349, vat: 21, measure: null, unit: null },
      { print: "SCHUURPAPIER K120 10ST", qty: 1, unitCents: 495, vat: 21, measure: 10, unit: "pcs" },
      { print: "PLAMUUR 1KG", qty: 1, unitCents: 1395, vat: 21, measure: 1, unit: "kg" },
      { print: "ACRYLAATKIT WIT", qty: 4, unitCents: 375, vat: 21, measure: 4, unit: "pcs" },
      { print: "VERFBAK 25CM", qty: 1, unitCents: 299, vat: 21, measure: 1, unit: "pcs" },
    ],
  },
  {
    file: "06-gevouwen-bon.jpg",
    note: "One line is hidden under a fold, so the visible lines don't add up to the total: must be flagged for review.",
    layout: "thermal",
    supplier: "Klushuis Amersfoort",
    address: ["Ringweg 12", "3812 AB Amersfoort"],
    date: "2026-10-13",
    time: "13:37",
    look: { rotate: 3, light: 0.9, blur: 0.5, table: "#8a6b4e" },
    hideLine: 1,
    lines: [
      { print: "GIPSPLAAT 260X60", qty: 6, unitCents: 895, vat: 21, measure: 6, unit: "pcs" },
      { print: "GIPSSCHROEF 3,5X25 500ST", qty: 1, unitCents: 1099, vat: 21, measure: 500, unit: "pcs" },
      { print: "METAL STUD 50MM 3M", qty: 4, unitCents: 449, vat: 21, measure: 12, unit: "m" },
    ],
    expected: { needsReview: true },
  },
  {
    file: "07-alleen-pinbon.jpg",
    note: "Only the card terminal slip, no items: not a receipt Bonnetje can use.",
    layout: "thermal",
    supplier: "Bouwcentrum De Hoek",
    address: ["Havenstraat 3", "4811 KN Breda"],
    date: "2026-10-16",
    time: "07:42",
    look: { rotate: -1, light: 0.95, blur: 0.4, table: "#c9c4bb" },
    lines: [],
    expected: { error: "not_a_receipt" },
  },
  {
    file: "08-geen-bon.png",
    note: "A handwritten shopping list, not a receipt.",
    layout: "thermal",
    supplier: "",
    address: [],
    date: "2026-10-18",
    time: "",
    look: { rotate: 2, light: 1, blur: 0.3, table: "#b8b2a7" },
    lines: [],
    expected: { error: "not_a_receipt" },
  },
  {
    file: "09-webshop-factuur-excl.pdf",
    note: "Webshop invoice that prints prices excl. VAT plus a VAT total. Lines must come back incl. VAT. Shipping has no measure.",
    layout: "a4-excl",
    supplier: "Gereedschapshop.nl",
    address: ["Postbus 120", "5600 AC Eindhoven"],
    date: "2026-10-11",
    time: "",
    lines: [
      { print: "LED bouwlamp 30W", qty: 1, unitCents: 4999, vat: 21, measure: 1, unit: "pcs" },
      { print: "Borenset HSS 15-delig", qty: 1, unitCents: 2499, vat: 21, measure: 15, unit: "pcs" },
      { print: "Verzendkosten", qty: 1, unitCents: 705, vat: 21, measure: null, unit: null },
    ],
  },
];

// --- money helpers (same rounding as lib/money.ts) ---------------------------------

const eur = (cents: number) =>
  (cents < 0 ? "-" : "") + Math.floor(Math.abs(cents) / 100) + "," + String(Math.abs(cents) % 100).padStart(2, "0");
const exclOf = (cents: number, vat: number) => Math.round(cents / (1 + vat / 100));
const lineTotal = (l: Line) => l.qty * l.unitCents;
const total = (s: Sample) => s.lines.reduce((a, l) => a + lineTotal(l), 0);
const dutchDate = (iso: string) => iso.split("-").reverse().join("-");

function vatRows(s: Sample) {
  return ([21, 9] as const)
    .map((rate) => {
      const incl = s.lines.filter((l) => l.vat === rate).reduce((a, l) => a + lineTotal(l), 0);
      const excl = exclOf(incl, rate);
      return { rate, incl, excl, vat: incl - excl };
    })
    .filter((r) => r.incl > 0);
}

// An invoice that prints excl. VAT computes VAT over the sum of its excl. line amounts.
function exclVatRows(s: Sample) {
  return ([21, 9] as const)
    .map((rate) => {
      const excl = s.lines.filter((l) => l.vat === rate).reduce((a, l) => a + exclOf(lineTotal(l), rate), 0);
      const vat = Math.round((excl * rate) / 100);
      return { rate, excl, vat, incl: excl + vat };
    })
    .filter((r) => r.excl > 0);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// --- layouts --------------------------------------------------------------------------

function thermal(s: Sample): string {
  if (s.file.startsWith("08-")) return shoppingList();
  const rows = s.lines
    .map((l, i) => {
      const body =
        l.qty === 1
          ? `<div class="row"><span>${esc(l.print)}</span><span>${eur(lineTotal(l))}${l.vat === 9 ? " B" : " A"}</span></div>`
          : `<div>${esc(l.print)}</div><div class="row"><span>&nbsp;&nbsp;${l.qty} x ${eur(l.unitCents)}</span><span>${eur(lineTotal(l))}${l.vat === 9 ? " B" : " A"}</span></div>`;
      return `<div class="line${i === s.hideLine ? " hidden" : ""}">${body}</div>`;
    })
    .join("");
  const vat = vatRows(s)
    .map((r) => `<div class="row4"><span>${r.rate === 9 ? "B" : "A"} ${r.rate}%</span><span>${eur(r.excl)}</span><span>${eur(r.vat)}</span><span>${eur(r.incl)}</span></div>`)
    .join("");
  const t = total(s);
  const pinOnly = s.lines.length === 0;
  const amount = pinOnly ? 4285 : t;
  return `
  <div class="paper thermal">
    <div class="c b big">${esc(s.supplier.toUpperCase())}</div>
    ${s.address.map((a) => `<div class="c">${esc(a)}</div>`).join("")}
    <div class="c small">KvK 90000001 &nbsp; BTW NL000000001B01</div>
    <hr/>
    ${
      pinOnly
        ? `<div class="c b">BETAALAUTOMAAT</div><div class="row"><span>Terminal</span><span>T7Q42X</span></div>
           <div class="row"><span>Datum</span><span>${dutchDate(s.date)} ${s.time}</span></div>
           <div class="row"><span>Kaart</span><span>xxxx xxxx xxxx 4821</span></div><hr/>
           <div class="c b">BETALING</div><div class="row b big"><span>Bedrag</span><span>EUR ${eur(amount)}</span></div>
           <hr/><div class="c">AUTORISATIECODE 0X81F2</div><div class="c">Akkoord</div><div class="c">Bewaar dit ticket</div>`
        : `<div class="row"><span>${dutchDate(s.date)} ${s.time}</span><span>Kassa 2 &nbsp;Bon 4417</span></div><hr/>
           ${rows}<hr/>
           <div class="row b big"><span>TOTAAL</span><span>EUR ${eur(t)}</span></div>
           <div class="row"><span>PIN</span><span>${eur(t)}</span></div><hr/>
           <div class="row4 b"><span>BTW</span><span>excl</span><span>btw</span><span>incl</span></div>${vat}<hr/>
           <div class="c">${s.lines.reduce((a, l) => a + l.qty, 0)} artikelen</div>
           <div class="c">Bedankt en tot ziens!</div>`
    }
  </div>`;
}

function shoppingList(): string {
  return `<div class="paper note">
    <div class="hand">Boodschappen</div>
    <div class="hand">- melk</div><div class="hand">- brood</div>
    <div class="hand">- kitspuit (bouwmarkt!)</div><div class="hand">- 2x schuurpapier</div>
    <div class="hand">- Jan bellen ivm offerte</div>
  </div>`;
}

function a4(s: Sample): string {
  const excl = s.layout === "a4-excl";
  const rows = s.lines
    .map((l) => {
      const price = excl ? exclOf(l.unitCents, l.vat) : l.unitCents;
      const amount = excl ? exclOf(lineTotal(l), l.vat) : lineTotal(l);
      return `<tr><td>${esc(l.print)}</td><td class="n">${l.qty}</td><td class="n">${eur(price)}</td><td class="n">${l.vat}%</td><td class="n">${eur(amount)}</td></tr>`;
    })
    .join("");
  const t = total(s);
  const vr = excl ? exclVatRows(s) : vatRows(s);
  const sumExcl = vr.reduce((a, r) => a + r.excl, 0);
  return `
  <div class="a4">
    <div class="head">
      <div><div class="logo">${esc(s.supplier)}</div>${s.address.map((a) => `<div>${esc(a)}</div>`).join("")}
        <div>KvK 90000002 · BTW NL000000002B01</div></div>
      <div class="meta"><div class="title">FACTUUR</div>
        <div>Factuurnummer: 2026-${s.file.slice(0, 2)}0417</div><div>Factuurdatum: ${dutchDate(s.date)}</div>
        <div>Klantnummer: 50213</div></div>
    </div>
    <div class="to"><b>Factuuradres</b><br/>Installatiebedrijf R. de Boer<br/>Lindelaan 9<br/>3701 GH Zeist</div>
    <table>
      <thead><tr><th>Omschrijving</th><th class="n">Aantal</th><th class="n">${excl ? "Prijs excl. btw" : "Prijs incl. btw"}</th><th class="n">Btw</th><th class="n">${excl ? "Bedrag excl. btw" : "Bedrag incl. btw"}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sum">
      <div class="row"><span>Subtotaal excl. btw</span><span>€ ${eur(sumExcl)}</span></div>
      ${vr.map((r) => `<div class="row"><span>Btw ${r.rate}% over € ${eur(r.excl)}</span><span>€ ${eur(r.vat)}</span></div>`).join("")}
      <div class="row b"><span>Totaal incl. btw</span><span>€ ${eur(t)}</span></div>
      ${excl ? "" : `<div class="row small"><span>Bedragen per regel zijn inclusief btw.</span><span></span></div>`}
    </div>
    <div class="foot">Betaald via iDEAL op ${dutchDate(s.date)}. Vragen? info@example.nl</div>
  </div>`;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "DejaVu Sans Mono", monospace; }
  .stage { width: 1200px; height: 1600px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .stage::after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.18), rgba(0,0,0,.25)); }
  .paper { background: #fbfaf5; box-shadow: 0 18px 40px rgba(0,0,0,.45); }
  .thermal { width: 560px; padding: 44px 40px 60px; font-size: 22px; line-height: 1.45; color: #2b2b2b; }
  .thermal hr { border: 0; border-top: 2px dashed #777; margin: 14px 0; }
  .c { text-align: center; } .b { font-weight: bold; } .big { font-size: 26px; } .small { font-size: 17px; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .row4 { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; text-align: right; } .row4 span:first-child { text-align: left; }
  .line { position: relative; }
  .line.hidden::after { content: ""; position: absolute; left: -60px; right: -60px; top: 2px; bottom: 0;
    background: linear-gradient(180deg, #d9d6cc, #a9a59a 50%, #d9d6cc); box-shadow: 0 0 14px rgba(0,0,0,.4); }
  .note { width: 620px; padding: 60px; background: #fffbe0; background-image: repeating-linear-gradient(#fffbe0 0 46px, #a8c3e0 46px 48px); }
  .hand { font-family: "DejaVu Serif", serif; font-style: italic; font-size: 34px; line-height: 48px; color: #1d3a8a; }
  .a4 { width: 794px; padding: 60px 64px; font-family: "DejaVu Sans", sans-serif; font-size: 13px; color: #222; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; } .logo { font-size: 22px; font-weight: bold; color: #0b4f8a; margin-bottom: 6px; }
  .meta { text-align: right; } .title { font-size: 26px; font-weight: bold; letter-spacing: 2px; margin-bottom: 8px; }
  .to { margin: 36px 0 28px; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; border-bottom: 2px solid #0b4f8a; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #ddd; } .n { text-align: right; }
  .sum { margin: 20px 0 0 auto; width: 360px; } .sum .row { padding: 3px 0; } .sum .b { border-top: 2px solid #222; margin-top: 4px; padding-top: 6px; font-size: 15px; }
  .foot { margin-top: 60px; color: #666; font-size: 11px; }
`;

function page(s: Sample): string {
  if (s.layout !== "thermal") return `<style>${CSS}</style>${a4(s)}`;
  const look = s.look!;
  return `<style>${CSS}
    .stage { background: ${look.table}; }
    .tilt { transform: rotate(${look.rotate}deg); filter: blur(${look.blur}px) brightness(${look.light}) contrast(.95); }
  </style><div class="stage"><div class="tilt">${thermal(s)}</div></div>`;
}

// --- expected output (the JSON shape from CLAUDE.md) -----------------------------------

function expected(s: Sample) {
  if (s.expected?.error) return { note: s.note, error: s.expected.error };
  const visible = s.lines.filter((_, i) => i !== s.hideLine);
  return {
    note: s.note,
    supplier: s.supplier,
    date: s.date,
    totalCents: total(s),
    needsReview: s.expected?.needsReview ?? false,
    lines: visible.map((l) => ({
      short: l.print,
      qty: l.qty,
      unitPriceCents: l.unitCents,
      lineTotalCents: lineTotal(l),
      measure: l.measure,
      unit: l.unit,
      vatRate: l.vat,
    })),
  };
}

// An excl.-VAT invoice only works as a sample if converting the lines back to incl. VAT
// gives the printed total; otherwise the expected answer would itself be ambiguous.
function checkExclInvoice(s: Sample) {
  const vr = exclVatRows(s);
  for (const l of s.lines) {
    const back = Math.round(exclOf(lineTotal(l), l.vat) * (1 + l.vat / 100));
    if (back !== lineTotal(l)) throw new Error(`${s.file}: ${l.print} doesn't round-trip excl. VAT`);
  }
  const printed = vr.reduce((a, r) => a + r.incl, 0);
  if (printed !== total(s)) throw new Error(`${s.file}: VAT rows don't add up`);
}

async function main() {
  const out = path.join(process.cwd(), "samples");
  await mkdir(out, { recursive: true });
  // Same lookup as playwright.config.ts: the sandbox ships its own Chromium.
  const sandboxChromium = "/opt/pw-browsers/chromium";
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
  const p = await ctx.newPage();
  for (const s of SAMPLES) {
    if (s.layout === "a4-excl") checkExclInvoice(s);
    await p.setContent(`<!doctype html><meta charset="utf-8">${page(s)}`);
    const file = path.join(out, s.file);
    const ext = path.extname(s.file);
    if (ext === ".pdf") await p.pdf({ path: file, format: "A4", printBackground: true });
    else if (ext === ".jpg") await p.screenshot({ path: file, type: "jpeg", quality: 78 });
    else await p.screenshot({ path: file, type: "png" });
    const json = path.join(out, s.file.replace(/\.[a-z]+$/, ".expected.json"));
    await writeFile(json, JSON.stringify(expected(s), null, 2) + "\n");
    console.log("wrote", s.file);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
