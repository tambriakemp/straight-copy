// Today — the new landing page for the .cv-admin shell (CRE-332 Phase 2).
// Merges the old Briefs page and the /admin ops strip into one KPI row +
// "Needs you now" + morning brief + "Coming up" view. Read-only, no schema
// change — every query here already exists elsewhere (Briefs.tsx,
// AdminDashboard.tsx); this page only reshapes how they're presented.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Sparkles } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";
import KpiCard from "@/components/admin/cv/KpiCard";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, loadAdminOperations, type AdminOperations } from "@/lib/adminOperations";
import { useNeedsYouNow, type NeedsYouBucket } from "@/lib/needsYouNow";
import { useBriefs } from "@/lib/briefs";

const FILTERS: Array<{ key: "all" | NeedsYouBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "agents", label: "Agents" },
  { key: "clients", label: "Clients" },
  { key: "money", label: "Money" },
];

export default function Today() {
  const navigate = useNavigate();
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | NeedsYouBucket>("all");
  const [briefTab, setBriefTab] = useState<"morning" | "past">("morning");
  const { items: needsYouNow, reload: reloadNeedsYouNow } = useNeedsYouNow();
  const { briefs, selected, setSelected, current, latestMorning, reload: reloadBriefs } = useBriefs();

  const loadOps = () => {
    loadAdminOperations().then(setOps).catch((error) => toast.error(error.message || "Failed to load client status"));
  };
  const loadAgentStatus = () => {
    supabase.from("agents").select("enabled").then(({ data, error }) => {
      if (error) { toast.error(error.message); return; }
      setAgentsEnabled((data ?? []).filter((a) => a.enabled).length);
    });
  };
  useEffect(() => { loadOps(); loadAgentStatus(); }, []);

  const syncNow = () => { loadOps(); loadAgentStatus(); reloadNeedsYouNow(); reloadBriefs(); toast.success("Syncing…"); };

  const proposalsPending = (ops?.proposals ?? []).filter((p) => p.status === "sent" && !p.client_signed_at);
  const invoicesSent = (ops?.invoices ?? []).filter((i) => i.status === "sent");
  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = invoicesSent.filter((i) => i.due_date && i.due_date < today);
  const upcoming = invoicesSent.filter((i) => i.due_date && i.due_date >= today).slice(0, 6);

  const prospectsToReview = useMemo(
    () => (needsYouNow ?? []).filter((item) => item.kind === "prospect approvals").length,
    [needsYouNow],
  );

  const visibleItems = useMemo(
    () => (needsYouNow ?? []).filter((item) => filter === "all" || item.bucket === filter),
    [needsYouNow, filter],
  );
  const bucketCounts = useMemo(() => {
    const counts: Record<"all" | NeedsYouBucket, number> = { all: needsYouNow?.length ?? 0, agents: 0, clients: 0, money: 0 };
    for (const item of needsYouNow ?? []) counts[item.bucket] += 1;
    return counts;
  }, [needsYouNow]);

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Daily / Today"
          title="Today"
          subtitle="Everything that needs you right now, the morning brief, and what's coming up."
          right={
            <div className="cv-sync-row">
              {agentsEnabled !== null && (
                <span className="cv-chip cv-chip--green"><Sparkles size={12} /> {agentsEnabled} agent{agentsEnabled === 1 ? "" : "s"} enabled</span>
              )}
              <button type="button" className="cv-sync-btn" onClick={syncNow}><RefreshCw size={13} /> Sync now</button>
            </div>
          }
        />

        <div className="cv-kpi-row">
          <KpiCard
            label="Needs you"
            value={needsYouNow ? needsYouNow.length : "—"}
            hint={needsYouNow ? `${bucketCounts.agents} agents · ${bucketCounts.clients} clients · ${bucketCounts.money} money` : undefined}
            onClick={() => setFilter("all")}
          />
          <KpiCard
            label="Awaiting signature"
            value={ops ? formatMoney(proposalsPending.reduce((sum, p) => sum + (p.total_cents ?? 0), 0)) : "—"}
            hint={ops ? `${proposalsPending.length} proposal${proposalsPending.length === 1 ? "" : "s"} out` : undefined}
            onClick={() => navigate("/admin/proposals")}
          />
          <KpiCard
            label="Outstanding"
            value={ops ? formatMoney(invoicesSent.reduce((sum, i) => sum + i.amount_cents, 0)) : "—"}
            hint={ops ? `${overdueInvoices.length} overdue` : undefined}
            onClick={() => navigate("/admin/payments")}
          />
          <KpiCard
            label="Prospects to review"
            value={needsYouNow ? prospectsToReview : "—"}
            hint="Sends via the Prospects queue"
            onClick={() => navigate("/admin/approvals")}
          />
        </div>

        <div className="cv-today-body">
          <Card className="cv-card-pad">
            <div className="cv-card-head">
              <span className="cv-card-title">Needs you now</span>
              <div className="cv-filter-tabs">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`cv-filter-tab ${filter === f.key ? "cv-filter-tab--active" : ""}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} {bucketCounts[f.key]}
                  </button>
                ))}
              </div>
            </div>
            {!needsYouNow ? (
              <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
            ) : !visibleItems.length ? (
              <EmptyState title="Nothing waiting" subtitle="Nothing in this filter needs you right now." />
            ) : (
              <div className="cv-needs-list">
                {visibleItems.map((item) => (
                  <a key={item.id} className="cv-needs-item" href={item.issue_url ?? "#"} target="_blank" rel="noreferrer">
                    <span className="cv-needs-item__title">{item.title}</span>
                    <span className="cv-needs-item__kind">{item.kind}{item.issue_identifier ? ` · ${item.issue_identifier}` : ""}</span>
                  </a>
                ))}
              </div>
            )}
          </Card>

          <div style={{ display: "grid", gap: 20 }}>
            <Card className="cv-card-pad">
              <div className="cv-card-head">
                <span className="cv-card-title">Morning brief</span>
                <div className="cv-brief-tabs">
                  <button type="button" className={`cv-brief-tab ${briefTab === "morning" ? "cv-brief-tab--active" : ""}`} onClick={() => setBriefTab("morning")}>Morning</button>
                  <button type="button" className={`cv-brief-tab ${briefTab === "past" ? "cv-brief-tab--active" : ""}`} onClick={() => setBriefTab("past")}>Past</button>
                </div>
              </div>

              {briefTab === "morning" ? (
                !latestMorning ? (
                  <EmptyState title="No brief yet" subtitle="Ara's next scheduled run posts here." />
                ) : (
                  <>
                    <div className="cv-card-sub" style={{ marginLeft: 0, marginBottom: 10 }}>
                      {new Date(latestMorning.created_at).toLocaleString()}
                    </div>
                    {latestMorning.sections.map((s, i) => (
                      <div key={i} className="cv-brief-section">
                        <div className="cv-brief-section__heading">{s.heading}</div>
                        <ul>
                          {s.items.map((item, j) => (
                            <li key={j}>{item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.text}</a> : item.text}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )
              ) : !briefs?.length ? (
                <EmptyState title="No briefs yet" />
              ) : (
                <div style={{ display: "grid", gap: 2 }}>
                  {briefs.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`cv-past-brief-row ${b.id === current?.id ? "cv-past-brief-row--active" : ""}`}
                      onClick={() => setSelected(b.id)}
                    >
                      <div className="cv-past-brief-row__title">{b.title}</div>
                      <div className="cv-past-brief-row__date">{new Date(b.created_at).toLocaleString()}</div>
                    </button>
                  ))}
                  {current && (
                    <div className="cv-brief-section" style={{ marginTop: 10, borderTop: "1px solid var(--cv-border)", paddingTop: 12 }}>
                      {current.sections.map((s, i) => (
                        <div key={i} className="cv-brief-section">
                          <div className="cv-brief-section__heading">{s.heading}</div>
                          <ul>
                            {s.items.map((item, j) => (
                              <li key={j}>{item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.text}</a> : item.text}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card className="cv-card-pad">
              <div className="cv-card-head"><span className="cv-card-title">Coming up</span><span className="cv-card-sub">Next 7 days</span></div>
              {!ops ? (
                <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
              ) : !upcoming.length ? (
                <EmptyState title="Nothing scheduled" subtitle="No invoices due in the next 7 days." />
              ) : (
                <div>
                  {upcoming.map((invoice) => (
                    <button
                      key={invoice.id}
                      type="button"
                      className="cv-coming-item"
                      style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--cv-border)", cursor: "pointer", textAlign: "left", padding: "10px 0" }}
                      onClick={() => navigate("/admin/payments")}
                    >
                      <span className="cv-coming-item__date">
                        {new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <span style={{ flex: 1 }}>
                        <div className="cv-coming-item__title">{ops.clientNames[invoice.client_id]}</div>
                        <div className="cv-coming-item__sub">{invoice.label}</div>
                      </span>
                      <span className="cv-coming-item__amount">{formatMoney(invoice.amount_cents, invoice.currency)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
