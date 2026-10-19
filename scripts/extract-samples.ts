// Run every receipt in samples/ through the real reader (Claude) and write
// docs/extraction-report.md: which receipts came through correctly, and why the others didn't.
// Run: npm run extract:samples   (needs ANTHROPIC_API_KEY; calls the Claude API once per sample)
//      npm run extract:samples -- --fake   (fake reader, no API, report not written: checks the script itself)
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareWithExpected, type Expected, type Outcome } from "../lib/extract/compare";
import { ReadError } from "../lib/extract/errors";
import { fakeReader } from "../lib/extract/fake";
import { claudeReader, readReceipt, RECEIPT_MODEL } from "../lib/extract/reader";
import { sniffMediaType } from "../lib/files";

const SAMPLES = path.join(process.cwd(), "samples");
const REPORT = path.join(process.cwd(), "docs", "extraction-report.md");
const FILE = /\.(jpe?g|png|webp|pdf|heic)$/i;
// The API takes images up to 5 MB; the app shrinks photos in the browser first, this script doesn't.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Fixed, so a receipt without a readable date shows up the same way every run.
const TODAY = "2000-01-01";
const FAKE = process.argv.includes("--fake");

type Row = { file: string; result: "pass" | "fail" | "no expected" | "skipped"; seconds?: number; notes: string[]; read?: string };

function summarize(o: Outcome): string {
  if (!o.ok) return `error: ${o.code}${o.detail ? ` (${o.detail})` : ""}`;
  const r = o.assessment.receipt;
  const lines = r.lines.map(
    (l) =>
      `  - ${l.short}: ${l.qty} × ${l.unitPriceCents} = ${l.lineTotalCents}, VAT ${l.vatRate}%, measure ${l.measure === null ? "unknown" : `${l.measure} ${l.unit}`}`,
  );
  return [
    `${r.supplier}, ${r.date}, total ${r.totalCents}${o.assessment.needsReview ? ", flagged for review" : ""}`,
    ...lines,
    ...o.assessment.problems.map((p) => `  - noticed: ${p}`),
  ].join("\n");
}

async function main() {
  const files = (await readdir(SAMPLES).catch(() => [] as string[])).filter((f) => FILE.test(f)).sort();
  const header = [`# Receipt extraction report`, "", `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run extract:samples\`.`, ""];

  if (!files.length) {
    await writeFile(REPORT, [...header, "No receipts in `samples/`, so nothing was tested. Add photos or PDFs there (with an optional `<name>.expected.json`) and run it again.", ""].join("\n"));
    console.log("samples/ is empty; wrote a report saying so.");
    return;
  }
  if (!FAKE && !process.env.ANTHROPIC_API_KEY) {
    await writeFile(REPORT, [...header, `Not run: \`ANTHROPIC_API_KEY\` is not set. ${files.length} samples are waiting in \`samples/\`.`, ""].join("\n"));
    console.log("ANTHROPIC_API_KEY is not set; wrote a report saying so.");
    process.exitCode = 1;
    return;
  }

  const reader = FAKE ? fakeReader(SAMPLES) : claudeReader();
  const rows: Row[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(path.join(SAMPLES, file)));
    const mediaType = sniffMediaType(bytes);
    if (!mediaType) {
      rows.push({ file, result: "skipped", notes: ["not a JPEG, PNG, WebP or PDF (HEIC is converted by the browser in the app)"] });
      continue;
    }
    if (mediaType !== "application/pdf" && bytes.length > MAX_IMAGE_BYTES) {
      rows.push({ file, result: "skipped", notes: ["photo over 5 MB; the app shrinks it before reading, this script doesn't"] });
      continue;
    }
    const started = Date.now();
    let outcome: Outcome;
    try {
      outcome = { ok: true, assessment: await readReceipt({ bytes, mediaType, name: file }, reader, TODAY) };
    } catch (e) {
      if (!(e instanceof ReadError)) throw e;
      outcome = { ok: false, code: e.code, detail: e.detail };
    }
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    let expected: Expected | null = null;
    try {
      expected = JSON.parse(await readFile(path.join(SAMPLES, file.replace(/\.[^.]+$/, ".expected.json")), "utf8"));
    } catch {
      // no expected answer for this sample
    }
    const diffs = expected ? compareWithExpected(outcome, expected) : [];
    const result = !expected ? "no expected" : diffs.length ? "fail" : "pass";
    rows.push({ file, result, seconds, notes: diffs, read: summarize(outcome) });
    console.log(`${result.padEnd(11)} ${file} (${seconds}s)${diffs.length ? `\n  ${diffs.join("\n  ")}` : ""}`);
  }

  const count = (r: Row["result"]) => rows.filter((x) => x.result === r).length;
  const out = [
    ...header,
    `Model: \`${RECEIPT_MODEL}\`. Passed ${count("pass")} of ${count("pass") + count("fail")} samples with an expected answer` +
      (count("no expected") ? `; ${count("no expected")} without one` : "") +
      (count("skipped") ? `; ${count("skipped")} skipped` : "") +
      ".",
    "",
    "A sample passes when supplier, date, total, review flag and every line (qty, unit price, line total, VAT, measure) match its `.expected.json`.",
    "",
    "| Sample | Result | Time | What was different |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.file} | ${r.result} | ${r.seconds === undefined ? "" : `${r.seconds}s`} | ${r.notes.join("; ").replace(/\|/g, "\\|") || ""} |`),
    "",
    "## What was read",
    "",
    ...rows.flatMap((r) => (r.read ? [`### ${r.file}`, "", r.read, ""] : [])),
  ];
  if (FAKE) {
    console.log(`\nFake run: ${count("pass")} passed, ${count("fail")} failed (report not written).`);
    return;
  }
  await writeFile(REPORT, out.join("\n"));
  console.log(`\nWrote ${path.relative(process.cwd(), REPORT)}: ${count("pass")} passed, ${count("fail")} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
