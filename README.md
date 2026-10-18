# Bonnetje

A mobile web app for one-van tradespeople (plumbers, electricians, painters). Scan a receipt,
put every item (or part of an item) on the right job, keep leftovers in stock, log your hours,
and send a finished invoice to [Moneybird](https://www.moneybird.com).

*Bonnetje* is Dutch for "little receipt".

## What it does

- **Receipts** – take a photo or upload a PDF; Claude (vision) reads it into structured lines.
  Receipts whose lines don't add up to the total are flagged for review instead of guessed.
- **Where did it go?** – place each line on one or more jobs, by amount or by euros. Leftovers
  go to stock, to the client, or to waste.
- **Jobs** – per job, see what is *to invoice*: unbilled materials (excl. VAT) + markup + labour
  (hours or days).
- **Stock** – leftovers from receipts, items added manually, used on a job (all or part) or removed.
- **Invoice** – preview and send to Moneybird. The full receipt always goes in as a business cost,
  whatever was split.

See [`CLAUDE.md`](CLAUDE.md) for the domain model and money rules, and
[`docs/bonnetje-prototype.dc.html`](docs/bonnetje-prototype.dc.html) for the clickable design
prototype.

## Stack

- Next.js (App Router) + TypeScript, mobile-first PWA (390 px target)
- Postgres via Supabase; PGlite (in-process Postgres) for local dev and tests
- Claude API for receipt reading, Moneybird API for bookkeeping
- Vitest (unit) and Playwright (end-to-end)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open <http://localhost:3000> in a phone-sized viewport.

### Environment

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Receipt reading |
| `MONEYBIRD_TOKEN`, `MONEYBIRD_ADMINISTRATION_ID` | Moneybird API (use a **test administration** in development) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project |
| `DATABASE_URL` | Postgres connection string, read on the server |

Without `DATABASE_URL` the app runs on PGlite with the same migrations and demo seed data
(3 jobs, stock items, sample receipts), stored in `.data/`. Set `BONNETJE_DB=memory` to start
fresh on every run.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Main flows (Playwright) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run db:check` | Run migrations and seed in memory (no Docker) |
| `npm run db:reset` | Reset local Supabase (needs the Supabase CLI and Docker) |

## Project layout

```
app/          Next.js routes: home, jobs, receipts, stock, expenses
lib/          Money logic, placement logic, formatting, data layer (db/)
supabase/     Migrations and demo seed data
e2e/          Playwright flows
docs/         Build plan and clickable prototype
```

## Money rules in short

- All amounts are integer cents; receipt prices include VAT (21% default, 9% supported per line).
- Splitting a line rounds on the running total, so parts plus leftover always equal the line exactly.
- Assigning more than 100% of a line is an error.
- After sending an invoice, that job's materials are marked billed and its hours reset.

The full rules, with unit tests, live in [`lib/money.ts`](lib/money.ts) and
[`CLAUDE.md`](CLAUDE.md).

## Status

Built in slices, see [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md). Done: setup, data model and
money logic, home and jobs, placement ("Where did it go?") and split editor. Still to come:
Claude receipt extraction, full stock screens, Moneybird integration, expenses and inbox
(the Stock and Expenses pages exist as early versions).
