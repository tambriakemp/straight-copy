import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Invoice = {
  id: string;
  sequence: number;
  label: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: "scheduled" | "sent" | "paid" | "failed" | "void";
  checkout_url: string | null;
  sent_at: string | null;
  paid_at: string | null;
};
type ProjectGroup = { projectId: string; projectName: string; invoices: Invoice[] };

const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length <= 10 ? iso + "T12:00:00" : iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

const STATUS_LABEL: Record<Invoice["status"], string> = {
  scheduled: "Upcoming",
  sent: "Awaiting payment",
  paid: "Paid",
  failed: "Awaiting payment",
  void: "Voided",
};

export default function InvoiceSection({ clientId }: { clientId: string }) {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ action: "portal-schedule", clientId }),
        });
        const data = await r.json();
        if (!cancelled && r.ok) setGroups((data.projects ?? []) as ProjectGroup[]);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading || groups.length === 0) return null;

  return (
    <>
      {groups.map((g) => {
        const totalCents = g.invoices.reduce((sum, i) => sum + (i.status === "void" ? 0 : i.amount_cents), 0);
        const paidCents = g.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount_cents, 0);
        const currency = g.invoices[0]?.currency || "usd";
        return (
          <section key={g.projectId} className="portal-access is-open" style={{ scrollMarginTop: 24 }}>
            <div className="portal-access__toggle" style={{ cursor: "default" }}>
              <div className="portal-access__toggle-left">
                <div className="portal-access__eyebrow">Payment Schedule</div>
                <h2 className="portal-access__title">{g.projectName}</h2>
              </div>
              <div className="portal-access__toggle-right">
                <span className="portal-access__status">
                  {fmtMoney(paidCents, currency)} of {fmtMoney(totalCents, currency)} paid
                </span>
              </div>
            </div>
            <div className="portal-access__body">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                {g.invoices.map((inv) => {
                  const isPayable = inv.status === "sent" || inv.status === "failed";
                  const isPaid = inv.status === "paid";
                  const isVoid = inv.status === "void";
                  return (
                    <div
                      key={inv.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto auto",
                        alignItems: "center",
                        gap: 16,
                        padding: "14px 16px",
                        border: "1px solid hsl(30 8% 22%)",
                        borderRadius: 6,
                        background: isPaid ? "hsl(30 6% 12%)" : "transparent",
                        opacity: isVoid ? 0.5 : 1,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(30 8% 62%)" }}>
                          Invoice {String(inv.sequence).padStart(2, "0")}
                        </div>
                        <div style={{ fontSize: 15, color: "hsl(40 20% 97%)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.label}
                        </div>
                        <div style={{ fontSize: 12, color: "hsl(30 8% 62%)", marginTop: 4 }}>
                          {isPaid
                            ? <>Paid {fmtDate(inv.paid_at)}</>
                            : <>Due {fmtDate(inv.due_date)}</>}
                          {" · "}{STATUS_LABEL[inv.status]}
                        </div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "hsl(40 20% 97%)", whiteSpace: "nowrap" }}>
                        {fmtMoney(inv.amount_cents, inv.currency)}
                      </div>
                      <div style={{ minWidth: 100, textAlign: "right" }}>
                        {isPayable && inv.checkout_url ? (
                          <a
                            href={inv.checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="crm-btn crm-btn--bronze crm-btn--sm"
                          >
                            Pay →
                          </a>
                        ) : isPaid ? (
                          <span style={{ fontSize: 12, color: "hsl(140 30% 60%)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            ✓ Paid
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "hsl(30 8% 50%)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {isVoid ? "Voided" : "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
