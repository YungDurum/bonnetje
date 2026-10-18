# Bonnetje — build plan with Claude Code prompts

## Before you start (10 minutes)
1. Create an empty project folder and put these files in it:
   - `CLAUDE.md` in the root
   - `docs/BUILD_PLAN.md` (this file)
   - `docs/bonnetje-prototype.dc.html` (the clickable prototype, used as the reference)
2. Create `.env.local` with your Anthropic API key and a Moneybird **test administration** token.
3. Collect 10–20 real receipts (photos and a few PDFs), including faded thermal ones, in `samples/`.
4. Open Claude Code in the folder and paste the prompts below **one slice at a time**.
   Ask for a plan first, read it, then let it build. Don't start the next slice until the
   current one runs and its tests pass.

---

## Slice 0 — Project setup
> Read CLAUDE.md and docs/bonnetje-prototype.dc.html. Set up a Next.js (App Router, TypeScript) mobile-first PWA with Vitest and Playwright, ESLint and a typecheck script. Add the fonts and colour tokens from CLAUDE.md as CSS variables. Create a phone-width layout shell (390 px) with the neutral background. Update the commands section in CLAUDE.md. Make a plan first.

**Done when:** `npm run dev` shows an empty app shell on a phone-sized screen; `npm test` runs.

## Slice 1 — Data model and money logic (most important)
> Following CLAUDE.md, design the database schema (Supabase/Postgres migrations) for jobs, receipts, receipt lines, allocations, stock items, material entries, labour and the ledger. Then write a pure TypeScript module `lib/money.ts` with: excl/incl VAT, splitting a line into parts by amount or by euros (parts must add up exactly), leftover handling (stock / client / waste), the "To invoice" calculation per job (materials excl. VAT + markup + labour) and invoice totals. Write thorough Vitest unit tests first, including rounding edge cases and "more than 100% assigned". Add seed data matching the prototype (3 jobs, stock items, receipts). Plan first.

**Done when:** all money tests pass; seed data loads.

## Slice 2 — Home and jobs
> Build the home screen and job pages like the prototype: the dark "Not invoiced yet" card (materials · labour · excl. VAT), the jobs list sorted by amount to invoice with "to invoice" / "Invoiced" / "Nothing to invoice", "+ New job" with its form, and the Stock and Expenses tiles at the bottom. Build the job page: header (client, job · address), dark "To invoice" summary, materials list with foldable receipts and the green new-dot, collapsed "Already invoiced", labour row that opens the labour sheet (hourly/day rate, editable rate, ½ steps), and the full-width "Create invoice · €…" button. Use the money module from slice 1. Add a Playwright test: create a job, log hours, see "To invoice" update.

## Slice 3 — Receipt capture and reading
> Build "Add receipt" with: take a photo (camera via file input), choose from photos, upload a PDF. Send the file to the Claude API and extract the JSON described in CLAUDE.md, validated with zod. If lines don't add up to the total, show the receipt for review instead of guessing. Never invent a measure that isn't on the receipt. Store the original file with the receipt. Show the "Reading receipt…" screen while it runs. Test the extraction on the files in samples/ and write a short report of which receipts failed and why.

**Done when:** most sample receipts come through with correct lines and totals.

## Slice 4 — "Where did it go?" and the split editor
> Build the "Where did it go?" screen like the prototype: "Put everything on one job" (opens a list of jobs), "Still to place" items as very light yellow tiles, and "Placed" items with a green check and a summary. Tapping an item opens the split editor bottom sheet: unit switch (item's unit or € Euros; "Part" when the measure is unknown), one row per job with −/+ and a typed amount, "+ add another job", a live "Left over" line with Stock / Client keeps it / Waste, and a red "Too much" state. "Save receipt" is enabled only when every item is placed and nothing is over. Saving creates material entries per job, stock items for leftovers, and a ledger entry for the full receipt. Use the money module for every amount.

## Slice 5 — Stock
> Build the Stock page: search, list (newest first), tap an item for a sheet with "Use on a job" (choose job, then amount by unit or euros, with quick All/¾/½/¼) and "Remove from stock" with confirmation. Add "Add to stock" (name, amount, unit, value). On the job page, "Add material" opens a sheet with: Scan a receipt / From stock (with the same amount step) / Add manually.

## Slice 6 — Invoice and Moneybird
> Build the invoice preview (material lines excl. VAT, markup, labour, subtotal, VAT 21%, total) and "Send to Moneybird". Use the Moneybird API: create the contact and project for a job when it's created; send each saved receipt in full with its lines and the original file as attachment; create the sales invoice for the job. Check in the Moneybird docs whether project_id can be set per receipt line; if not, put the job name in the line description. After sending, mark the job's materials billed and reset its hours. Handle API errors clearly and keep a "Not sent" status with a retry.

## Slice 7 — Expenses & VAT and the inbox (if time allows)
> Build the Expenses page: quarter totals (incl. VAT, excl. VAT, VAT paid), every receipt with source and Moneybird status, a receipt detail with the original file and "where it went", "Send now" for unsent receipts, and "Export for your accountant" (CSV). Build the inbox for forwarded PDFs/emails and parse UBL e-invoices directly without AI.

---

## Demo checklist (the day before)
- Reset to seed data with one command.
- One receipt with a known measure (cable, 100 m) and one without (screws, no count).
- Moneybird test administration open in a second tab to show receipts and the invoice arriving.
- A recorded backup video of the full flow in case the wifi fails.
