import { BackLink } from "../_components/BackLink";

export default function Page() {
  return (
    <main className="screen">
      <header className="page-head">
        <BackLink href="/" label="Back to home" />
        <h1 className="page-title">Expenses &amp; VAT</h1>
      </header>
      <div className="screen-body">
        <p className="empty-state">Coming in a later step.</p>
      </div>
    </main>
  );
}
