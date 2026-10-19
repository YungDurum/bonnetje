import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/db/jobs";
import { listStock } from "@/lib/db/stock";
import { formatEuro } from "@/lib/format";
import { BackLink } from "../_components/BackLink";
import { Toast } from "../_components/Toast";
import { AddStock } from "./AddStock";
import { StockList } from "./StockList";
import { StockSearch } from "./StockSearch";

export const dynamic = "force-dynamic";

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: Param; saved?: Param }> }) {
  const { q: rawQ, saved } = await searchParams;
  const q = first(rawQ).slice(0, 100);
  const db = await getDb();
  const [items, all, jobs] = await Promise.all([listStock(db, q), listStock(db), listJobs(db)]);
  const total = all.reduce((sum, i) => sum + i.valueCents, 0);

  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Back to home" />
        <div className="page-head-text">
          <h1 className="page-title">Stock</h1>
          <p className="page-sub">
            {all.length} {all.length === 1 ? "item" : "items"} · {formatEuro(total)}
          </p>
        </div>
      </header>

      <div className="screen-body">
        <StockSearch initial={q} />
        <Toast text={saved} />
        <StockList
          items={items.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            unit: i.unit,
            originalQty: i.originalQty,
            valueCents: i.valueCents,
            origin: i.origin,
          }))}
          jobs={jobs.map((j) => ({ id: j.id, client: j.client, shortName: j.shortName }))}
          q={q}
        />
      </div>

      <AddStock />
    </main>
  );
}
