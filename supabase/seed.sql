-- Bonnetje demo data, taken from docs/bonnetje-prototype.dc.html (BN_JOBS, BN_SEED, BN_STOCK,
-- BN_LEDGER, BN_HOURS, BN_DAYS). Plain SQL; Supabase runs it after the migrations.
-- Fixed UUID prefixes: 10 jobs, 20 receipts, 30 receipt lines, 40 stock, 50 material entries,
-- 60 material entry lines, 70 allocations.

insert into settings (id, markup_pct, default_hour_rate_cents, default_day_rate_cents)
values (1, 15, 6250, 45000);

-- Jobs. hours_half / days_half are half steps: 6 h -> 12, 4.5 h -> 9, 1 day -> 2, 0.5 day -> 1.
insert into jobs (id, client, short_name, title, address, labour_mode, hour_rate_cents, day_rate_cents, hours_half, days_half) values
  ('10000000-0000-0000-0000-000000000001', 'Fam. de Vries', 'de Vries', 'Bathroom renovation', 'Lindenlaan 14, Amstelveen', 'hour', 6250, 45000, 12, 2),
  ('10000000-0000-0000-0000-000000000002', 'Bakker & Zn', 'Bakker', 'Kitchen rewiring', 'Javastraat 40, Amsterdam', 'hour', 6250, 45000, 0, 0),
  ('10000000-0000-0000-0000-000000000003', 'M. Jansen', 'Jansen', 'Boiler replacement', 'Westzijde 88, Zaandam', 'hour', 6250, 45000, 9, 1);

-- Receipts (the ledger). Line cents of each receipt add up to total_cents.
insert into receipts (id, supplier, receipt_date, source, category, total_cents, moneybird_status) values
  ('20000000-0000-0000-0000-000000000001', 'Shell',           '2026-10-12', 'photo',    'Fuel',      7840,  'sent'),
  ('20000000-0000-0000-0000-000000000002', 'Gamma',           '2026-10-14', 'photo',    'Materials', 7570,  'sent'),
  ('20000000-0000-0000-0000-000000000003', 'Technische Unie', '2026-10-15', 'einvoice', 'Materials', 16840, 'sent'),
  ('20000000-0000-0000-0000-000000000004', 'Wasco',           '2026-10-16', 'pdf',      'Materials', 40190, 'sent'),
  ('20000000-0000-0000-0000-000000000005', 'Praxis',          '2026-10-16', 'photo',    'Materials', 4798,  'pending');

-- Receipt lines. Shell fuel is a business cost, not billed to a client: no allocation, leftover 'waste'.
-- Gamma primer (2.5 L) has no allocation and its leftover goes to stock (stock item s2, 1 of 2.5 L).
-- Wasco PVC pipe (4 m) has no allocation and its leftover goes to stock (stock item s1); the stock
-- item shows 2 of 4 m because 2 m were used up/removed afterwards, which the prototype does not bill.
insert into receipt_lines (id, receipt_id, position, name, short, qty, unit_price_cents, line_cents, measure, unit, vat_rate, leftover, placed) values
  -- Shell
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'Euro 95 fuel',                      'EURO95 41,2L',        1, 7840,  7840,  41.2, 'L',  21, 'waste', true),
  -- Gamma
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1, 'Washbasin tap',                     'KRAAN WASTAFEL',      1, 2995,  2995,  null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 2, 'Chrome siphon',                     'SIFON CHROOM',        1, 1249,  1249,  null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 3, 'Coupling 15 mm',                    'KOPPELING 15MM',      1, 376,   376,   null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 4, 'Primer, white 2.5 L',               'PRIMER WIT 2,5L',     1, 2950,  2950,  2.5,  'L',  21, 'stock', true),
  -- Technische Unie
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 1, 'Installation cable 3×2.5 mm²',      'VD KABEL 3X2.5 50M',  1, 4950,  4950,  50,   'm',  21, 'stock', true),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 2, 'Consumer unit, 6 groups',          'GROEPENKAST 6GR',     1, 10495, 10495, null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', 3, 'Surface socket, double',            'WCD OPBOUW 2V',       1, 1395,  1395,  null, null, 21, 'stock', true),
  -- Wasco
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000004', 1, 'Flue gas set',                      'ROOKGASAFVOER SET',   1, 31200, 31200, null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000004', 2, 'Expansion vessel 18 L',             'EXPANSIEVAT 18L',     1, 5890,  5890,  null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000004', 3, 'Ball valve 22 mm',                  'KOGELKRAAN 22MM',     1, 1860,  1860,  null, null, 21, 'stock', true),
  ('30000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000004', 4, 'PVC pipe 32 mm',                    'PVC BUIS 32MM 4M',    1, 1240,  1240,  4,    'm',  21, 'stock', true),
  -- Praxis: 2 sealants bought, 1 billed to Jansen, the other not billed (waste)
  ('30000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000005', 1, 'Sealant',                           '2X AFDICHTKIT',       2, 2399,  4798,  2,    'pcs', 21, 'waste', true);

-- Allocations. A fully assigned line with a known measure uses kind 'measure' (amount = measure);
-- without a known measure it uses kind 'part' with amount 1 (the whole line).
insert into allocations (id, line_id, job_id, position, kind, amount, cents) values
  -- Gamma tap, siphon, coupling -> de Vries
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 1, 'part',    1,  2995),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 1, 'part',    1,  1249),
  ('70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 1, 'part',    1,  376),
  -- Technische Unie, all lines -> Bakker
  ('70000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 1, 'measure', 50, 4950),
  ('70000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 1, 'part',    1,  10495),
  ('70000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 1, 'part',    1,  1395),
  -- Wasco flue gas set, expansion vessel, ball valve -> Jansen
  ('70000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 1, 'part',    1,  31200),
  ('70000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', 1, 'part',    1,  5890),
  ('70000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', 1, 'part',    1,  1860),
  -- Praxis: 1 of 2 sealants -> Jansen
  ('70000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', 1, 'measure', 1,  2399);

-- Stock (BN_STOCK). Copper elbows and silicone were not bought on a seeded receipt.
insert into stock_items (id, name, qty, unit, original_qty, value_cents, origin, source_line_id) values
  ('40000000-0000-0000-0000-000000000001', 'PVC pipe 32 mm',           2,  'm',   4,    620,  'Wasco',           '30000000-0000-0000-0000-000000000012'),
  ('40000000-0000-0000-0000-000000000002', 'Primer, white',            1,  'L',   2.5,  1180, 'Gamma',           '30000000-0000-0000-0000-000000000005'),
  ('40000000-0000-0000-0000-000000000003', 'Copper elbows 15 mm',      12, 'pcs', null, 1440, 'Technische Unie', null),
  ('40000000-0000-0000-0000-000000000004', 'Sanitary silicone, white', 2,  'pcs', null, 1390, 'Praxis',          null);

-- Material entries on jobs (BN_SEED). Unbilled.
insert into material_entries (id, job_id, origin, receipt_id, label, entry_date, cents, billed) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'receipt', '20000000-0000-0000-0000-000000000002', 'Gamma',           '2026-10-14', 4620,  false),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'receipt', '20000000-0000-0000-0000-000000000003', 'Technische Unie', '2026-10-15', 16840, false),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'receipt', '20000000-0000-0000-0000-000000000004', 'Wasco',           '2026-10-16', 38950, false),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'receipt', '20000000-0000-0000-0000-000000000005', 'Praxis',          '2026-10-16', 2399,  false);

insert into material_entry_lines (id, entry_id, position, name, detail, cents, vat_rate) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'Washbasin tap',                '',           2995,  21),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 2, 'Chrome siphon',                '',           1249,  21),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 3, 'Coupling 15 mm',               '',           376,   21),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', 1, 'Installation cable 3×2.5 mm²', '50 m',       4950,  21),
  ('60000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002', 2, 'Consumer unit, 6 groups',      '',           10495, 21),
  ('60000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000002', 3, 'Surface socket, double',       '',           1395,  21),
  ('60000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000003', 1, 'Flue gas set',                 '',           31200, 21),
  ('60000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000003', 2, 'Expansion vessel 18 L',        '',           5890,  21),
  ('60000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000003', 3, 'Ball valve 22 mm',             '',           1860,  21),
  ('60000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000004', 1, 'Sealant',                      '1 of 2 pcs', 2399,  21);
