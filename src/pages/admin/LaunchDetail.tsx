// Launch detail — one cohort. Goal vs actual, checklist, funnel, revenue.
// Modelled on src/pages/admin/ProjectDetail.tsx.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, GoalBar, Section, dueLabel, money } from "@/components/admin/DashboardPrimitives";
import { venturesApi, errMsg, type ChecklistItem, type Launch, type RevenueEntry } from "@/lib/venturesApi";

type LaunchPayload = {
  launch: Launch;
  checklist: ChecklistItem[];
  revenue: RevenueEntry[];
  actual_revenue_cents: number;
  actual_signups: number;
  funnel: Record<string, number>;
};

const NEXT_STATUS: Record<ChecklistItem["status"], ChecklistItem["status"]> = {
  pending: "in_progress",
  in_progress: "complete",
  complete: "pending",
  skipped: "pending",
};

const STATUS_GLYPH: Record<ChecklistItem["status"], string> = {
  pending: "○",
  in_progress: "◐",
  complete: "●",
  skipped: "—",
};

export default function LaunchDetail() {
  const { id, launchId } = useParams<{ id: string; launchId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LaunchPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!launchId) return;
    setLoading(true);
    try {
      setData(await venturesApi<LaunchPayload>(`/launches/${launchId}`));
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load launch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [launchId]);

  const cycleStatus = async (item: ChecklistItem) => {
    const next = NEXT_STATUS[item.status];
    // Optimistic — the list is long and a round trip per tap feels broken.
    setData((d) => d && {
      ...d,
      checklist: d.checklist.map((c) => (c.id === item.id ? { ...c, status: next } : c)),
    });
    try {
      await venturesApi(`/checklist-items/${item.id}`, { method: "PATCH", body: { status: next } });
    } catch (e) {
      toast.error(errMsg(e) || "Could not update");
      load();
    }
  };

  if (loading) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p></div></AdminLayout>;
  }
  if (!data) {
    return <AdminLayout><div className="roster"><Empty>Launch not found.</Empty></div></AdminLayout>;
  }

  const { launch, checklist, revenue, actual_revenue_cents, actual_signups, funnel } = data;
  const done = checklist.filter((c) => c.status === "complete").length;

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">LNCH</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <button onClick={() => navigate(`/admin/ventures/${id}`)} className="crm-btn crm-btn--ghost"
              style={{ fontSize: 13, marginBottom: 10 }}>← Back to venture</button>
            <div className="roster__eyebrow">{launch.status}</div>
            <h1 className="roster__title">{launch.name}</h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              {launch.starts_at ? `Session ${new Date(launch.starts_at).toLocaleDateString()}` : "No session date set"}
              {launch.cart_close_at ? ` · cart closes ${new Date(launch.cart_close_at).toLocaleDateString()}` : ""}
              {launch.ticket_price_cents ? ` · ${money(launch.ticket_price_cents)} a seat` : ""}
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
          <div style={{ padding: "20px 22px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>Revenue</div>
            <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
              {money(actual_revenue_cents)}
            </div>
            <GoalBar actual={actual_revenue_cents} goal={launch.goal_revenue_cents} />
          </div>
          <div style={{ padding: "20px 22px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>Signups</div>
            <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
              {actual_signups}
            </div>
            <GoalBar actual={actual_signups} goal={launch.goal_signups} tone="#dbb172" />
          </div>
          <div style={{ padding: "20px 22px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>Checklist</div>
            <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 42, lineHeight: 1.1, marginTop: 6 }}>
              {done}<span style={{ fontSize: 24, color: "var(--crm-taupe)" }}>/{checklist.length}</span>
            </div>
            <GoalBar actual={done} goal={checklist.length || null} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 1fr)", gap: 24, alignItems: "start" }}>
          <Section title="Launch checklist">
            {!checklist.length ? <Empty>No checklist items.</Empty> : (
              <div>
                {checklist.map((c) => {
                  const d = dueLabel(c.due_date);
                  const isDone = c.status === "complete";
                  return (
                    <button key={c.id} onClick={() => cycleStatus(c)}
                      style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, width: "100%",
                        padding: "12px 14px", textAlign: "left", background: "var(--crm-charcoal)",
                        borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", cursor: "pointer" }}>
                      <span style={{ color: isDone ? "#9db8a6" : "var(--crm-taupe)", alignSelf: "center" }}>
                        {STATUS_GLYPH[c.status]}
                      </span>
                      <span style={{ fontSize: 16, opacity: isDone ? 0.55 : 1,
                        textDecoration: isDone ? "line-through" : "none" }}>
                        {c.label}
                      </span>
                      <span style={{ fontSize: 13, alignSelf: "center", textTransform: "uppercase", letterSpacing: "0.15em",
                        color: isDone ? "var(--crm-taupe)" : d.overdue ? "#e07a5f" : d.soon ? "#dbb172" : "var(--crm-taupe)" }}>
                        {isDone ? "done" : d.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          <div style={{ display: "grid", gap: 24 }}>
            <Section title="Funnel">
              {!Object.keys(funnel).length ? <Empty>No funnel events for this launch.</Empty> : (
                <div style={{ padding: 14 }}>
                  {Object.entries(funnel).map(([stage, count]) => (
                    <div key={stage} style={{ display: "flex", justifyContent: "space-between",
                      fontSize: 15, padding: "4px 0", color: "var(--crm-warm-white)" }}>
                      <span style={{ color: "var(--crm-taupe)" }}>{stage}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Payments">
              {!revenue.length ? <Empty>No payments yet.</Empty> : (
                <div>
                  {revenue.slice(0, 20).map((r) => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                      padding: "10px 14px", background: "var(--crm-charcoal)",
                      borderBottom: "1px solid var(--crm-border-dark)", fontSize: 14 }}>
                      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.customer_email || r.description || r.kind}
                        <div style={{ fontSize: 13, color: "var(--crm-taupe)" }}>
                          {new Date(r.occurred_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ alignSelf: "center" }}>{money(r.amount_cents)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
