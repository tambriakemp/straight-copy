import { useEffect, useState } from "react";
import { T } from "@/lib/cre8Design";

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

export default function InvoiceSection({ clientId, projectId }: { clientId: string; projectId?: string }) {
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
        if (!cancelled && r.ok) {
          const all = (data.projects ?? []) as ProjectGroup[];
          setGroups(projectId ? all.filter((g) => g.projectId === projectId) : all);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, projectId]);

  if (loading || groups.length === 0) return null;

  return (
    <>
      {groups.map((g) => {
        const totalCents = g.invoices.reduce((sum, i) => sum + (i.status === "void" ? 0 : i.amount_cents), 0);
        const paidCents = g.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount_cents, 0);
        const currency = g.invoices[0]?.currency || "usd";
        return (
          <section key={g.projectId} style={{
            border: T.hairline, borderRadius: T.radius, background: T.panel,
            display: "flex", flexDirection: "column", minWidth: 0, scrollMarginTop: 24,
          }}>
            <header style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
              borderBottom: T.hairline, flexWrap: "wrap",
            }}>
              <h2 style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, color: T.text, margin: 0 }}>
                Payments
              </h2>
              <span style={{ marginLeft: "auto", fontSize: 14, color: T.text2 }}>
                {fmtMoney(paidCents, currency)} of {fmtMoney(totalCents, currency)} paid
              </span>
            </header>

            {g.invoices.map((inv, i) => {
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
                    gap: 14,
                    padding: "12px 18px",
                    borderTop: i === 0 ? "none" : T.hairline,
                    opacity: isVoid ? 0.5 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, color: T.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.label}
                    </div>
                    <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>
                      Invoice {String(inv.sequence).padStart(2, "0")}
                      {" · "}
                      {isPaid ? `Paid ${fmtDate(inv.paid_at)}` : `Due ${fmtDate(inv.due_date)}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, color: T.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(inv.amount_cents, inv.currency)}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {isPayable && inv.checkout_url ? (
                      <a
                        href={inv.checkout_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500,
                          padding: "6px 12px", borderRadius: T.radiusSm, textDecoration: "none",
                          background: T.bronzeBtn, color: T.bronzeBtnText, whiteSpace: "nowrap",
                        }}
                      >
                        Pay →
                      </a>
                    ) : (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500,
                        borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
                        color: isPaid ? T.green : T.text2,
                        background: isPaid ? T.greenBg : T.rowActive,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: isPaid ? T.green : T.text2,
                        }} />
                        {isPaid ? "Paid" : isVoid ? "Voided" : STATUS_LABEL[inv.status]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
