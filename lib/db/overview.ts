// Small counts and sums for the tiles at the bottom of the home screen.
import type { Cents } from "../money";
import type { Queryable } from "./client";

export type Overview = {
  stock: { count: number; valueCents: Cents };
  /** Receipts dated in the current quarter. */
  expenses: { quarterLabel: string; count: number; totalCents: Cents; notInMoneybird: number };
};

/** `today` (YYYY-MM-DD) is for tests; by default the database's current date. */
export async function getOverview(db: Queryable, today?: string): Promise<Overview> {
  const [stock] = await db.query<{ n: number; v: number }>(
    "select count(*)::int as n, coalesce(sum(value_cents), 0)::int as v from stock_items",
  );
  const [exp] = await db.query<{ y: number; q: number; n: number; t: number; p: number }>(
    `with d as (select coalesce($1::date, current_date) as today)
     select extract(year from d.today)::int as y,
            extract(quarter from d.today)::int as q,
            count(r.id)::int as n,
            coalesce(sum(r.total_cents), 0)::int as t,
            count(r.id) filter (where r.moneybird_status <> 'sent')::int as p
       from d
       left join receipts r
         on r.receipt_date >= date_trunc('quarter', d.today)::date
        and r.receipt_date < (date_trunc('quarter', d.today) + interval '3 months')::date
      group by d.today`,
    [today ?? null],
  );
  return {
    stock: { count: stock.n, valueCents: stock.v },
    expenses: { quarterLabel: `Q${exp.q} ${exp.y}`, count: exp.n, totalCents: exp.t, notInMoneybird: exp.p },
  };
}
