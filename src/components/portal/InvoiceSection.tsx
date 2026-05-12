import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type ActiveInvoice = {
  id: string;
  sequence: number;
  label: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: "sent";
  checkout_url: string | null;
  sent_at: string | null;
};

const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);

export default function InvoiceSection({ clientId }: { clientId: string }) {
  const [invoice, setInvoice] = useState<ActiveInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ action: "portal-active", clientId }),
        });
        const data = await r.json();
        if (!cancelled && r.ok) setInvoice((data.invoice ?? null) as ActiveInvoice | null);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading || !invoice) return null;

  const dueLabel = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <section className="portal-access is-open">
      <div className="portal-access__toggle" style={{ cursor: "default" }}>
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Invoice {invoice.sequence}</div>
          <h2 className="portal-access__title">{invoice.label}</h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className="portal-access__status">Awaiting payment</span>
        </div>
      </div>
      <div className="portal-access__body">
        <p className="portal-access__intro">
          Amount due <strong>{fmtMoney(invoice.amount_cents, invoice.currency)}</strong>
          {dueLabel && <> · Due {dueLabel}</>}
        </p>
        {invoice.checkout_url ? (
          <a
            href={invoice.checkout_url}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-btn crm-btn--primary"
          >
            Pay now →
          </a>
        ) : (
          <p style={{ color: "var(--crm-taupe)", fontSize: 14 }}>
            Payment link is being prepared. Check your email for the SureCart invoice.
          </p>
        )}
      </div>
    </section>
  );
}
