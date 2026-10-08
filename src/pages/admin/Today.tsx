// Today — the new landing page for the .cv-admin shell (CRE-332 Phase 2).
// Merges the old Briefs page and the /admin ops strip into one KPI row +
// "Needs you now" + morning brief + "Coming up" view. Read-only, no schema
// change — every query here already exists elsewhere (Briefs.tsx,
// AdminDashboard.tsx); this page only reshapes how they're presented.
//
// CRE-335: every Needs-you-now item and every brief line gets a checkbox.
// Checking one writes brief_item_completions (via complete-brief-item,
// see src/lib/briefItemCompletions.ts) instead of Bree telling Ara in chat.
// Checked items stay visible, struck through, with an Undo — they are
// never removed from the underlying data here.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Sparkles } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";
import KpiCard from "@/components/admin/cv/KpiCard";
import EmptyState from "@/components/admin/cv/EmptyState";
import BriefCheckItem from "@/components/admin/cv/BriefCheckItem";
import WeeklyCalendarCard from "@/components/admin/cv/WeeklyCalendarCard";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, loadAdminOperations, type AdminOperations } from "@/lib/adminOperations";
import { useNeedsYouNow, type NeedsYouBucket } from "@/lib/needsYouNow";
import { useBriefs, type Brief, type BriefItem } from "@/lib/briefs";
import { useBriefItemCompletions } from "@/lib/briefItemCompletions";

const FILTERS: Array<{ key: "all" | NeedsYouBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "agents", label: "Agents" },
  { key: "clients", label: "Clients" },
  { key: "money", label: "Money" },
];

// Stable id for a brief line: the ingest routine's own `id` once it sends
// one (CRE-335 §3), otherwise a key scoped to this one brief instance so
// the checkbox still works for older/un-migrated briefs — it just won't be
// recognized as "already done" on a future, differently-worded brief.
function briefItemId(briefId: string, sectionIdx: number, itemIdx: number, item: BriefItem): string {
  return item.id ?? `${briefId}:${sectionIdx}:${itemIdx}`;
}

// Best-effort Paperclip issue identifier for a brief line that hasn't been
// updated to carry an explicit `issue` field yet: parse it out of the link
// Ara already includes, same URL shape sync-paperclip-pending builds
// (`${PAPERCLIP_BASE}/CRE/issues/${identifier}`).
function briefItemIssue(item: BriefItem): string | null {
  if (item.issue) return item.issue;
  const m = item.link?.match(/\/issues\/([A-Z]+-\d+)/);
  return m ? m[1] : null;
}

// CRE-358: a brief whose `calendar_events` field has at least one event
// gets the new weekly calendar card instead of its old markdown "Calendar"
// section. A brief that doesn't send the field (or sends an empty array)
// keeps rendering whatever it has in `sections` unchanged.
function hasCalendarCard(brief: Brief): boolean {
  return Array.isArray(brief.calendar_events) && brief.calendar_events.length > 0;
}

function BriefSections({
  brief, isDone, complete, undo, hideCalendarHeading = false,
}: {
  brief: Brief;
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  hideCalendarHeading?: boolean;
}) {
  return (
    <>
      {brief.sections.map((s, i) => {
        // Bree: "for any section that doesn't have an update for that day
        // don't show the section at all" — skip a heading with no items
        // rather than rendering it empty.
        if (!s.items.length) return null;
        if (hideCalendarHeading && s.heading.trim().toLowerCase() === "calendar") return null;
        return (
          <div key={i} className="cv-brief-section">
            <div className="cv-brief-section__heading">{s.heading}</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {s.items.map((item, j) => {
                const id = briefItemId(brief.id, i, j, item);
                const issue = briefItemIssue(item);
                return (
                  <li key={j}>
                    <BriefCheckItem
                      done={isDone(id)}
                      onComplete={() => complete({
                        item_id: id,
                        item_text: item.text,
                        issue_identifier: issue,
                        brief_date: brief.created_at.slice(0, 10),
                      })}
                      onUndo={() => undo(id)}
                    >
                      {item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.text}</a> : item.text}
                    </BriefCheckItem>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export default function Today() {
  const navigate = useNavigate();
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | NeedsYouBucket>("all");
  const [briefTab, setBriefTab] = useState<"morning" | "past">("morning");
  const { items: needsYouNow, reload: reloadNeedsYouNow } = useNeedsYouNow();
  const { briefs, selected, setSelected, current, latestMorning, reload: reloadBriefs } = useBriefs();
  const { isDone, complete, undo, reload: reloadCompletions } = useBriefItemCompletions();

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

  const syncNow = () => {
    loadOps(); loadAgentStatus(); reloadNeedsYouNow(); reloadBriefs(); reloadCompletions();
    toast.success("Syncing…");
  };

  const proposalsPending = (ops?.proposals ?? []).filter((p) => p.status === "sent" && !p.client_signed_at);
  const invoicesSent = (ops?.invoices ?? []).filter((i) => i.status === "sent");
  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = invoicesSent.filter((i) => i.due_date && i.due_date < today);
  const upcoming = invoicesSent.filter((i) => i.due_date && i.due_date >= today).slice(0, 6);

  // Checking off a Needs-you-now item is acknowledgement, not resolution
  // (CRE-335 §4) — it still comes back from the same source query next
  // sync. Open counts/badges exclude it; the row itself stays visible,
  // struck through, below.
  const openNeedsYouNow = useMemo(
    () => (needsYouNow ?? []).filter((item) => !isDone(item.id)),
    [needsYouNow, isDone],
  );

  const prospectsToReview = useMemo(
    () => openNeedsYouNow.filter((item) => item.kind === "prospect approvals").length,
    [openNeedsYouNow],
  );

  const visibleItems = useMemo(
    () => (needsYouNow ?? []).filter((item) => filter === "all" || item.bucket === filter),
    [needsYouNow, filter],
  );
  const bucketCounts = useMemo(() => {
    const counts: Record<"all" | NeedsYouBucket, number> = { all: openNeedsYouNow.length, agents: 0, clients: 0, money: 0 };
    for (const item of openNeedsYouNow) counts[item.bucket] += 1;
    return counts;
  }, [openNeedsYouNow]);

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
            value={needsYouNow ? openNeedsYouNow.length : "—"}
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
                  {hasCalendarCard(latestMorning) && <WeeklyCalendarCard events={latestMorning.calendar_events!} />}
                  <BriefSections brief={latestMorning} isDone={isDone} complete={complete} undo={undo} hideCalendarHeading={hasCalendarCard(latestMorning)} />
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
                    {hasCalendarCard(current) && <WeeklyCalendarCard events={current.calendar_events!} />}
                    <BriefSections brief={current} isDone={isDone} complete={complete} undo={undo} hideCalendarHeading={hasCalendarCard(current)} />
                  </div>
                )}
              </div>
            )}
          </Card>

          <div style={{ display: "grid", gap: 20 }}>
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
                    <div key={item.id} className="cv-needs-item">
                      <BriefCheckItem
                        done={isDone(item.id)}
                        onComplete={() => complete({
                          item_id: item.id,
                          item_text: item.title,
                          issue_identifier: item.issue_identifier,
                        })}
                        onUndo={() => undo(item.id)}
                      >
                        <a
                          href={item.issue_url ?? "#"} target="_blank" rel="noreferrer"
                          style={{ display: "flex", flexDirection: "column", gap: 2, color: "inherit", textDecoration: "none" }}
                        >
                          <span className="cv-needs-item__title">{item.title}</span>
                          <span className="cv-needs-item__kind">{item.kind}{item.issue_identifier ? ` · ${item.issue_identifier}` : ""}</span>
                        </a>
                      </BriefCheckItem>
                    </div>
                  ))}
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
