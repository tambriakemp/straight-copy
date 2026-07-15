import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

type ActivityEvent = {
  id: string;
  occurred_at: string;
  kind: string;
  title: string;
  description: string | null;
  client_id: string | null;
  client_project_id: string | null;
  actor: string | null;
  metadata: any;
};

type UpcomingTask = {
  id: string;
  name: string;
  due_date: string | null;
  status: string;
  priority: string | null;
  client_project_id: string | null;
  project_name: string | null;
  client_id: string | null;
  client_name: string | null;
  assignee_kind: string;
};

type Summary = {
  kpis: {
    active_clients: number;
    active_subscriptions: number;
    active_projects: number;
    open_tasks: number;
    overdue_tasks: number;
    pending_proposals: number;
    unpaid_invoices: number;
  };
  revenue: { paid_30d_cents: number; outstanding_cents: number };
  activity: ActivityEvent[];
  upcoming: UpcomingTask[];
  recent_clients: Array<{ id: string; business_name: string | null; contact_name: string | null; updated_at: string }>;
  pending_proposals: Array<{ id: string; title: string; client_id: string; client_name: string | null; created_at: string }>;
  pending_invoices: Array<{ id: string; label: string; amount_cents: number; client_id: string; client_name: string | null; due_date: string | null }>;
};

const ACTIVITY_ICON: Record<string, string> = {
  contract_signed: "✎",
  proposal_signed: "✎",
  preview_approved: "✓",
  invoice_paid: "$",
  client_created: "+",
  claude_run_completed: "★",
};

const ACTIVITY_LABEL: Record<string, string> = {
  contract_signed: "Contract",
  proposal_signed: "Proposal",
  preview_approved: "Approval",
  invoice_paid: "Payment",
  client_created: "Client",
  claude_run_completed: "Claude",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dueLabel(iso: string | null) {
  if (!iso) return { text: "no date", overdue: false, soon: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true, soon: false };
  if (diff === 0) return { text: "today", overdue: false, soon: true };
  if (diff === 1) return { text: "tomorrow", overdue: false, soon: true };
  return { text: `in ${diff}d`, overdue: false, soon: diff <= 3 };
}

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard/summary`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      toast.error(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Realtime activity updates
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, (payload) => {
        setData((d) => d ? { ...d, activity: [payload.new as ActivityEvent, ...d.activity].slice(0, 40) } : d);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const k = data?.kpis;

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">DASH</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Command Center</div>
            <h1 className="roster__title">Agency <em>dashboard</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">At-a-glance view of revenue, work in flight, client activity, and what needs attention next.</p>
          </div>
        </div>

        {/* KPI tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          <KpiTile label="Active clients" value={k?.active_clients} sub={`${k?.active_subscriptions ?? 0} subscribed`} loading={loading} />
          <KpiTile label="Active projects" value={k?.active_projects} loading={loading} />
          <KpiTile label="Open tasks" value={k?.open_tasks} loading={loading} onClick={() => navigate("/admin/tasks")} />
          <KpiTile label="Overdue" value={k?.overdue_tasks} tone={k && k.overdue_tasks > 0 ? "danger" : undefined} loading={loading} onClick={() => navigate("/admin/tasks")} />
          <KpiTile label="Pending proposals" value={k?.pending_proposals} loading={loading} />
          <KpiTile label="Unpaid invoices" value={k?.unpaid_invoices} loading={loading} />
        </div>

        {/* Revenue */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <RevenueCard label="Paid (last 30d)" amount={data?.revenue.paid_30d_cents ?? 0} loading={loading} />
          <RevenueCard label="Outstanding" amount={data?.revenue.outstanding_cents ?? 0} tone="warn" loading={loading} />
        </div>

        {/* Main two-column: left = upcoming + queues + recent. right = activity */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            <Section title="Upcoming & overdue tasks" actionLabel="View all" onAction={() => navigate("/admin/tasks")}>
              {loading ? <Empty>Loading…</Empty> : !data?.upcoming.length ? <Empty>Nothing due in the next two weeks.</Empty> : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {data.upcoming.map((t) => {
                    const d = dueLabel(t.due_date);
                    return (
                      <button key={t.id} onClick={() => t.client_id && t.client_project_id && navigate(`/admin/clients/${t.client_id}/projects/${t.client_project_id}`)}
                        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 14px", textAlign: "left",
                          background: "var(--crm-charcoal)", borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", cursor: "pointer" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                          <div style={{ fontSize: 12, color: "var(--crm-taupe)", marginTop: 2 }}>
                            {t.client_name || "—"}{t.project_name ? ` · ${t.project_name}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: d.overdue ? "#e07a5f" : d.soon ? "#dbb172" : "var(--crm-taupe)", textTransform: "uppercase", letterSpacing: "0.15em", alignSelf: "center" }}>
                          {d.text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Section title="Pending proposals">
                {loading ? <Empty>Loading…</Empty> : !data?.pending_proposals.length ? <Empty>None awaiting signature.</Empty> : (
                  <div>
                    {data.pending_proposals.map((p) => (
                      <Link key={p.id} to={`/admin/clients/${p.client_id}`}
                        style={{ display: "block", padding: "10px 14px", background: "var(--crm-charcoal)", borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", fontSize: 13 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: "var(--crm-taupe)" }}>{p.client_name}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Unpaid invoices">
                {loading ? <Empty>Loading…</Empty> : !data?.pending_invoices.length ? <Empty>All clear.</Empty> : (
                  <div>
                    {data.pending_invoices.map((i) => (
                      <Link key={i.id} to={`/admin/clients/${i.client_id}`}
                        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "10px 14px", background: "var(--crm-charcoal)", borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", fontSize: 13 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</div>
                          <div style={{ fontSize: 11, color: "var(--crm-taupe)" }}>{i.client_name}{i.due_date ? ` · due ${new Date(i.due_date).toLocaleDateString()}` : ""}</div>
                        </div>
                        <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 16 }}>{money(i.amount_cents)}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            <Section title="Recent clients">
              {loading ? <Empty>Loading…</Empty> : !data?.recent_clients.length ? <Empty>No clients yet.</Empty> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                  {data.recent_clients.map((c) => (
                    <Link key={c.id} to={`/admin/clients/${c.id}`}
                      style={{ padding: "12px 14px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", textDecoration: "none" }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.business_name || c.contact_name || "Untitled"}</div>
                      <div style={{ fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>updated {relTime(c.updated_at)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Activity feed */}
          <div style={{ position: "sticky", top: 16, alignSelf: "start", minWidth: 0 }}>
            <Section title="Activity">
              <div style={{ maxHeight: "calc(100vh - 180px)", overflowY: "auto" }}>
                {loading ? <Empty>Loading…</Empty> : !data?.activity.length ? <Empty>No activity yet.</Empty> : (
                  data.activity.map((e) => (
                    <div key={e.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, padding: "12px 14px",
                      background: "var(--crm-charcoal)", borderBottom: "1px solid var(--crm-border-dark)" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "hsl(36 5% 22%)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--crm-warm-white)" }}>
                        {ACTIVITY_ICON[e.kind] || "•"}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                          {ACTIVITY_LABEL[e.kind] || e.kind} · {relTime(e.occurred_at)}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--crm-warm-white)", marginTop: 2 }}>
                          {e.client_id ? (
                            <Link to={`/admin/clients/${e.client_id}`} style={{ color: "inherit" }}>{e.title}</Link>
                          ) : e.title}
                        </div>
                        {e.description && (
                          <div style={{ fontSize: 12, color: "var(--crm-taupe)", marginTop: 2 }}>{e.description}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiTile({ label, value, sub, tone, loading, onClick }: {
  label: string; value?: number; sub?: string; tone?: "danger"; loading?: boolean; onClick?: () => void;
}) {
  const color = tone === "danger" ? "#e07a5f" : "var(--crm-warm-white)";
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{ padding: "16px 18px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)",
        textAlign: "left", cursor: onClick ? "pointer" : "default", color: "var(--crm-warm-white)" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{label}</div>
      <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 36, lineHeight: 1.1, marginTop: 6, color }}>
        {loading ? "—" : (value ?? 0)}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>{sub}</div>}
    </button>
  );
}

function RevenueCard({ label, amount, tone, loading }: { label: string; amount: number; tone?: "warn"; loading?: boolean }) {
  return (
    <div style={{ padding: "20px 22px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{label}</div>
      <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 44, lineHeight: 1.1, marginTop: 6,
        color: tone === "warn" ? "#dbb172" : "var(--crm-warm-white)" }}>
        {loading ? "—" : money(amount)}
      </div>
    </div>
  );
}

function Section({ title, children, actionLabel, onAction }: {
  title: string; children: React.ReactNode; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{title}</div>
        {actionLabel && <button onClick={onAction} className="crm-btn crm-btn--ghost" style={{ fontSize: 11 }}>{actionLabel}</button>}
      </div>
      <div style={{ border: "1px solid var(--crm-border-dark)" }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 14px", color: "var(--crm-taupe)", fontSize: 13, textAlign: "center" }}>{children}</div>;
}
