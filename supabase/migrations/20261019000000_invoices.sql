-- Invoices sent to Moneybird, and Moneybird send state for receipts.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete restrict,
  -- 'pending': being sent (or the send was interrupted); 'sent': in Moneybird; 'failed': retry possible
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  vat_cents integer not null check (vat_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  -- what was sent, so a retry sends exactly the same invoice
  payload jsonb not null,
  moneybird_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (total_cents = subtotal_cents + vat_cents),
  check ((status = 'sent') = (moneybird_id is not null and sent_at is not null))
);

-- At most one unfinished invoice per job.
create unique index invoices_one_open_per_job on invoices (job_id) where status <> 'sent';

alter table material_entries add column invoice_id uuid references invoices (id) on delete set null;

alter table receipts add column moneybird_error text;

-- Created in Moneybird but not yet sent to the client (lets a retry skip creating it twice).
alter table invoices add column moneybird_sent boolean not null default false;
-- The original photo/PDF has been attached to the receipt in Moneybird.
alter table receipts add column moneybird_attached boolean not null default false;
