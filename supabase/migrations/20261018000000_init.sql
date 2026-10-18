-- Bonnetje initial schema.
-- All money is integer cents. Receipt amounts are incl. VAT; the VAT rate is kept per line.
-- Hours and days are stored in half steps (hours_half = 9 means 4.5 h) so labour needs no floats.

create table settings (
  id integer primary key default 1 check (id = 1),
  markup_pct integer not null default 15 check (markup_pct between 0 and 100),
  default_hour_rate_cents integer not null default 6250 check (default_hour_rate_cents >= 0),
  default_day_rate_cents integer not null default 45000 check (default_day_rate_cents >= 0)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  short_name text not null,
  title text not null,
  address text not null default '',
  labour_mode text not null default 'hour' check (labour_mode in ('hour', 'day')),
  hour_rate_cents integer not null check (hour_rate_cents >= 0),
  day_rate_cents integer not null check (day_rate_cents >= 0),
  hours_half integer not null default 0 check (hours_half >= 0),
  days_half integer not null default 0 check (days_half >= 0),
  moneybird_contact_id text,
  moneybird_project_id text,
  created_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  receipt_date date not null,
  source text not null check (source in ('photo', 'pdf', 'email', 'einvoice')),
  category text not null default 'Materials',
  total_cents integer not null check (total_cents >= 0),
  file_path text,
  -- lines did not add up to the total when read; a person has to check it
  needs_review boolean not null default false,
  moneybird_status text not null default 'pending' check (moneybird_status in ('sent', 'pending')),
  moneybird_id text,
  created_at timestamptz not null default now()
);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts (id) on delete cascade,
  position integer not null,
  name text not null,
  short text not null default '',
  qty numeric(12, 3) not null default 1 check (qty > 0),
  unit_price_cents integer not null,
  line_cents integer not null check (line_cents >= 0),
  -- total measure on the line (e.g. 100 m); null when the receipt does not say
  measure numeric(12, 3) check (measure is null or measure > 0),
  unit text check (unit in ('pcs', 'm', 'L', 'kg', 'boxes')),
  vat_rate integer not null default 21 check (vat_rate in (0, 9, 21)),
  leftover text not null default 'stock' check (leftover in ('stock', 'client', 'waste')),
  placed boolean not null default false,
  unique (receipt_id, position),
  check ((measure is null) = (unit is null))
);

-- How much of a receipt line went to which job.
-- kind 'measure': amount in the line's unit; 'part': fraction of the line (0..1); 'euro': amount is null, cents typed.
create table allocations (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references receipt_lines (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete restrict,
  position integer not null,
  kind text not null check (kind in ('measure', 'part', 'euro')),
  amount numeric(12, 3) check (amount is null or amount >= 0),
  cents integer not null check (cents >= 0),
  unique (line_id, position),
  check ((kind = 'euro') = (amount is null))
);

create table stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty numeric(12, 3) check (qty is null or qty >= 0),
  unit text check (unit in ('pcs', 'm', 'L', 'kg', 'boxes')),
  -- what it was bought with, for "2 of 4 m"
  original_qty numeric(12, 3) check (original_qty is null or original_qty > 0),
  value_cents integer not null check (value_cents >= 0),
  vat_rate integer not null default 21 check (vat_rate in (0, 9, 21)),
  origin text not null, -- supplier name or 'Added manually'
  source_line_id uuid references receipt_lines (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((qty is null) = (unit is null))
);

create table material_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  origin text not null check (origin in ('receipt', 'stock', 'manual')),
  receipt_id uuid references receipts (id) on delete set null,
  label text not null, -- supplier, 'Stock' or 'Added manually'
  entry_date date not null default current_date,
  cents integer not null check (cents >= 0), -- incl. VAT, sum of its lines
  billed boolean not null default false,
  billed_at timestamptz,
  created_at timestamptz not null default now(),
  check (billed = (billed_at is not null))
);

create table material_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references material_entries (id) on delete cascade,
  position integer not null,
  name text not null,
  detail text not null default '', -- e.g. '1 of 2 pcs'
  cents integer not null check (cents >= 0),
  vat_rate integer not null default 21 check (vat_rate in (0, 9, 21)),
  unique (entry_id, position)
);

create index on receipt_lines (receipt_id);
create index on allocations (line_id);
create index on allocations (job_id);
create index on material_entries (job_id) where not billed;
create index on material_entry_lines (entry_id);

-- Expenses: every receipt in full, whatever was split.
create view ledger as
select
  r.id,
  r.supplier,
  r.receipt_date,
  r.category,
  r.source,
  r.total_cents,
  r.moneybird_status,
  r.needs_review,
  r.file_path
from receipts r;
