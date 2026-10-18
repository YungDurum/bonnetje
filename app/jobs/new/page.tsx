import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/jobs";
import { formatEuroInput } from "@/lib/format";
import { BackLink } from "../../_components/BackLink";
import { NewJobForm } from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const s = await getSettings(await getDb());
  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Cancel" />
        <div className="page-head-text">
          <h1 className="page-title">New job</h1>
          <p className="page-sub">Who is it for and what are you doing?</p>
        </div>
      </header>
      <NewJobForm
        defaultRates={{ hour: formatEuroInput(s.defaultHourRateCents), day: formatEuroInput(s.defaultDayRateCents) }}
      />
    </main>
  );
}
