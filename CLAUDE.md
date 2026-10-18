# Bonnetje — project guide for Claude Code

Bonnetje is a mobile web app for one-van tradespeople (plumbers, electricians, painters).
They scan a receipt, put every item (or part of an item) on the right job, keep leftovers
in stock, log their hours, and send a finished invoice to Moneybird.

**Reference design:** `docs/bonnetje-prototype.dc.html` is a clickable prototype of every
screen and flow. Match its screens, wording, flows and calculations. It is a reference,
not code to copy: it runs on a design-tool runtime (`support.js`) that is not part of this
project. Rebuild the UI in our stack.
**If the prototype and this file disagree, this file wins.** Known difference: a few buttons
in the prototype are dark (`#16191D`), e.g. "Add to stock", "Send now"; build those as orange
action buttons, because dark is for information only (see UI rules). The selected option in a
segmented switch may stay dark.

## Stack
- Next.js (App Router) + TypeScript, run as a mobile-first PWA (390 px wide target).
- Database: Supabase (Postgres). For local dev, the Supabase CLI.
- Receipt reading: Claude API (vision) → strict JSON (see "Receipt extraction").
- Bookkeeping: Moneybird API (receipts, sales invoices, contacts, projects).
- Tests: Vitest for logic, Playwright for the main flows.

Commands:
- Install: `npm install`
- Dev: `npm run dev`
- Tests: `npm test` (unit) · `npm run test:e2e` (flows)
- Lint/types: `npm run lint` · `npm run typecheck`
- Database: `npm run db:check` (migrations + seed in memory, no Docker) · `npm run db:reset` (local Supabase, needs the Supabase CLI + Docker)

## Environment
Secrets live in `.env.local` (never commit it): `ANTHROPIC_API_KEY`, `MONEYBIRD_TOKEN`,
`MONEYBIRD_ADMINISTRATION_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
Use a Moneybird **test administration** during development.

## Domain model
- **Job**: client, title, address, labour mode (`hour` | `day`), rate (cents), hours/days logged.
- **Receipt**: supplier, date, source (`photo` | `pdf` | `email` | `einvoice`), total incl. VAT,
  original file, Moneybird status (`sent` | `pending`), lines.
- **ReceiptLine**: name, quantity bought, unit price, total measure + unit word
  (`pcs` | `m` | `L` | `kg` | `boxes`) — the measure may be **unknown** (not on the receipt).
- **Allocation** (per line): one or more `{ jobId, amount }` rows, amount in the line's unit
  or in euros. Leftover goes to one of: `stock` (default) | `client` (billed to the first
  job on the line) | `waste` (not billed).
- **StockItem**: name, quantity + unit (optional), value in cents, origin (supplier or "Added manually").
- **MaterialEntry** (on a job): origin (`receipt` | `stock` | `manual`), cents incl. VAT,
  item lines, `billed` flag.
- **Ledger** (expenses): every receipt in full, with source and Moneybird status.

## Money rules (get these exactly right, with unit tests)
- All amounts are **integer cents**. Never use floats for money in storage.
- Receipt prices are **incl. VAT**. Excl. VAT = `round(cents / 1.21)` for 21% lines.
  Keep the VAT rate per line (21% default, 9% exists) — don't hard-code 21% beyond the demo.
- Splitting a line: part cents = `round(lineCents × usedAmount / totalAmount)`, applied to the
  running total (part i = rounded total up to i − rounded total before i) so the parts never add up
  to more than the line and a fully assigned line has no stray cent. The leftover is
  `lineCents − sum(parts)`, so parts + leftover always equal the line exactly. See `lib/money.ts`.
- Assigning more than 100% of a line is an error; the user must fix it before saving.
- **To invoice (per job)** = unbilled materials excl. VAT + markup % on those materials
  + labour (hours × hourly rate, or days × day rate). Show it excl. VAT.
- Invoice: subtotal excl. VAT + 21% VAT = total.
- After "Send to Moneybird": mark that job's material entries `billed`, reset its hours/days to 0.
- The **full receipt** always goes to Moneybird as a business cost, whatever was split.
  Splitting only decides what is billed to which client.

## Product rules
- **No automatic job matching.** The user always chooses the job. AI only reads receipts.
- **No payment tracking.** After the invoice is in Moneybird, Moneybird handles payment and reminders.
- Never invent a quantity the receipt doesn't state. Unknown measure → split by part or by euros.
- Stock can be added from receipts (leftovers), added manually, used on a job (all or part,
  by amount or euros), and removed (used up / thrown away, not billed).
- A job created in Bonnetje is a contact + project in Moneybird.

## UI rules
- Colour roles: **orange** `#C2410C` = actions; **green** `#15803D` = done;
  **red** `#B91C1C` = errors; **dark** `#16191D` = information cards only (not buttons);
  very light yellow `#FFFCEB` = item tiles still to place. Neutral grey background `#EEF0F2`.
- Fonts: Archivo (UI) and IBM Plex Mono (amounts).
- Touch targets ≥ 44 px. Text contrast ≥ 4.5:1. Real `<button>`/`<input>`/`<label>` elements.
- Editors open as bottom sheets (split editor, stock item, add material, labour).
- Wording: "Stock" (never "van stock"), "To invoice", "Still to place", "Placed".

## Receipt extraction
Send the image/PDF to the Claude API and require JSON only, validated with a schema (zod):
`{ supplier, date, lines: [{ name, short, qty, unitPriceCents, lineTotalCents, measure: number|null, unit: "pcs"|"m"|"L"|"kg"|"boxes"|null, vatRate }], totalCents }`.
Check that the lines add up to the total; if not, flag the receipt for review instead of guessing.
E-invoices (UBL XML) are parsed directly, no AI needed.

## How to work in this repo
- **Plan first** for anything bigger than a small fix; wait for approval of the plan.
- Build in the slices from `docs/BUILD_PLAN.md`, one at a time. Each slice ends working and tested.
- Write unit tests for every money calculation before or with the code.
- Run tests, lint and typecheck before saying a slice is done; open the screen and check it.
- Keep demo seed data (3 jobs, a few stock items, sample receipts) so the app always demos.
- Small, focused commits with clear messages.
