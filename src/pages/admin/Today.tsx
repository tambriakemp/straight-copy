// Today — the real landing page for the new admin shell (CRE-332 Phase 2).
// Merges Briefs.tsx's "Needs you now" + morning brief with AdminDashboard's
// ops numbers into one page. Read-only: every query here already exists
// elsewhere in the app (Briefs.tsx, adminOperations.ts); no schema change.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Inbox, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";
import StatusChip, { type StatusTone } from "@/components/admin/cv/StatusChip";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";
import "@/styles/cv-today.css";

// briefs and paperclip_pending_items aren't in the generated Database type —
// same cast Briefs.tsx uses, for the same reason (see that file's comment).
const db = supabase as unknown as { from: (table: string) => any };

interface BriefItem { text: string; link: string | null }
interface BriefSection { heading: string; items: BriefItem[] }
interface Brief {
  id: string; period: string; title: string; sections: BriefSection[]; created_at: string;
}
interface PendingItem {
  id: string; kind: string; title: string; issue_identifier: string | null; issue_url: string | null; synced_at: string;
}
interface ProspectBatchPending { batch: string; count: number }

type NeedsYouFilter = "all" | "agents" | "clients" | "money";

interface NeedsYouRow {
  id: string;
  filterGroup: Exclude<NeedsYouFilter, "all">;
  badge: string;
  tone: StatusTone;
  title: string;
  clientName?: string | null;
  ageIso?: string | null;
  href: string;
}

function formatAge(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (href.startsWith("http")) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  }
  return <Link to={href} className={className}>{children}</Link>;
}

const FILTERS: { key: NeedsYouFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agents", label: "Agents" },
  { key: "clients", label: "Clients" },
  { key: "money", label: "Money" },
];

export default function Today() {
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [prospectBatches, setProspectBatches] = useState<ProspectBatchPending[] | null>(null);
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [filter, setFilter] = useState<NeedsYouFilter>("all");
  const [briefTab, setBriefTab] = useState<"morning" | "past">("morning");
  const [selectedPastBriefId, setSelectedPastBriefId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSyncing(true);

    const loadPending = db.from("paperclip_pending_items").select("*").order("synced_at", { ascending: false });
    const loadProspects = db.from("prospect_approvals").select("batch").eq("status", "pending");
    const loadBriefs = db.from("briefs").select("id, period, title, sections, created_at")
      .order("created_at", { ascending: false }).limit(30);

    Promise.all([loadAdminOperations(), loadPending, loadProspects, loadBriefs])
      .then(([opsData, pendingRes, prospectsRes, briefsRes]) => {
        if (cancelled) return;
        if (pendingRes.error) throw pendingRes.error;
        if (prospectsRes.error) throw prospectsRes.error;
        if (briefsRes.error) throw briefsRes.error;

        setOps(opsData);
        setPending((pendingRes.data ?? []) as PendingItem[]);

        const counts = new Map<string, number>();
        for (const row of (prospectsRes.data ?? []) as { batch: string }[]) {
          counts.set(row.batch, (counts.get(row.batch) ?? 0) + 1);
        }
        setProspectBatches(
          Array.from(counts, ([batch, count]) => ({ batch, count })).sort((a, b) => b.batch.localeCompare(a.batch)),
        );
        setBriefs((briefsRes.data ?? []) as Brief[]);
        setLastSyncedAt(new Date());
      })
      .catch((error) => toast.error(error.message || "Failed to load Today"))
      .finally(() => { if (!cancelled) setSyncing(false); });

    return () => { cancelled = true; };
  }, [reloadKey]);

  const projects = useMemo(() => projectMap(ops?.projects ?? []), [ops]);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in7DaysStr = useMemo(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), []);

  const draftProposals = useMemo(() => (ops?.proposals ?? []).filter((p) => p.status === "draft"), [ops]);
  const awaitingSignature = useMemo(
    () => (ops?.proposals ?? []).filter((p) => p.status === "sent" && !p.client_signed_at),
    [ops],
  );
  const sentInvoices = useMemo(() => (ops?.invoices ?? []).filter((i) => i.status === "sent"), [ops]);
  const overdueInvoices = useMemo(
    () => sentInvoices.filter((i) => i.due_date && i.due_date < todayStr),
    [sentInvoices, todayStr],
  );
  const comingUp = useMemo(
    () => (ops?.invoices ?? [])
      .filter((i) => i.due_date && ["scheduled", "sent"].includes(i.status) && i.due_date >= todayStr && i.due_date <= in7DaysStr)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [ops, todayStr, in7DaysStr],
  );
  const prospectsToReviewCount = useMemo(
    () => (prospectBatches ?? []).reduce((sum, b) => sum + b.count, 0),
    [prospectBatches],
  );

  const needsYouRows = useMemo<NeedsYouRow[] | null>(() => {
    if (pending === null || prospectBatches === null || ops === null) return null;
    const rows: NeedsYouRow[] = [];

    for (const p of pending) {
      rows.push({
        id: `paperclip-${p.id}`,
        filterGroup: "agents",
        badge: p.issue_identifier ? `${p.kind} · ${p.issue_identifier}` : p.kind,
        tone: p.kind === "interaction" ? "violet" : "amber",
        title: p.title,
        ageIso: p.synced_at,
        href: p.issue_url ?? "#",
      });
    }
    for (const b of prospectBatches) {
      rows.push({
        id: `prospect-${b.batch}`,
        filterGroup: "clients",
        badge: "prospect approvals",
        tone: "bronze",
        title: `${b.count} prospect${b.count === 1 ? "" : "s"} pending review — batch ${b.batch}`,
        ageIso: null,
        href: "/admin/approvals",
      });
    }
    for (const p of draftProposals) {
      rows.push({
        id: `draft-${p.id}`,
        filterGroup: "clients",
        badge: "proposal draft",
        tone: "gray",
        title: `"${p.title}" is still a draft — ${ops.clientNames[p.client_id] ?? "Untitled client"}`,
        clientName: ops.clientNames[p.client_id],
        ageIso: p.created_at,
        href: `/admin/clients/${p.client_id}`,
      });
    }
    for (const inv of overdueInvoices) {
      const project = projects[inv.client_project_id];
      rows.push({
        id: `overdue-${inv.id}`,
        filterGroup: "money",
        badge: "overdue",
        tone: "red",
        title: `${inv.label} overdue — ${ops.clientNames[inv.client_id] ?? "Untitled client"} (${formatMoney(inv.amount_cents, inv.currency)})`,
        clientName: ops.clientNames[inv.client_id],
        ageIso: inv.due_date,
        href: project ? `/admin/clients/${inv.client_id}/projects/${project.id}` : "/admin/money",
      });
    }

    return rows.sort((a, b) => {
      const at = a.ageIso ? new Date(a.ageIso).getTime() : Date.now();
      const bt = b.ageIso ? new Date(b.ageIso).getTime() : Date.now();
      return bt - at;
    });
  }, [pending, prospectBatches, draftProposals, overdueInvoices, ops, projects]);

  const visibleRows = useMemo(
    () => (needsYouRows ?? []).filter((r) => filter === "all" || r.filterGroup === filter),
    [needsYouRows, filter],
  );

  const morningBrief = useMemo(() => briefs?.find((b) => b.period === "morning") ?? null, [briefs]);
  const pastBriefs = useMemo(() => (briefs ?? []).filter((b) => b.id !== morningBrief?.id), [briefs, morningBrief]);
  const selectedPastBrief = useMemo(
    () => pastBriefs.find((b) => b.id === selectedPastBriefId) ?? pastBriefs[0] ?? null,
    [pastBriefs, selectedPastBriefId],
  );

  const lastPaperclipSyncAt = useMemo(() => {
    if (!pending?.length) return null;
    return pending.reduce((max, p) => (p.synced_at > max ? p.synced_at : max), pending[0].synced_at);
  }, [pending]);
  const paperclipSyncStale = lastPaperclipSyncAt ? Date.now() - new Date(lastPaperclipSyncAt).getTime() > 20 * 60_000 : null;

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Daily / Today"
          title="Today"
          subtitle="Everything that needs you right now, and what's coming up."
          right={
            <div className="cv-sync">
              {lastPaperclipSyncAt && (
                <StatusChip
                  label={paperclipSyncStale ? "Paperclip sync stale" : "Paperclip synced"}
                  tone={paperclipSyncStale ? "amber" : "green"}
                />
              )}
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={syncing}>
                <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
                {syncing ? "Syncing…" : lastSyncedAt ? `Synced ${formatAge(lastSyncedAt.toISOString())}` : "Sync now"}
              </button>
            </div>
          }
        />

        <div className="cv-kpi-row">
          <Card className="cv-kpi-card">
            <div className="cv-kpi-card__label">Needs you</div>
            <div className="cv-kpi-card__value">{needsYouRows ? needsYouRows.length : "—"}</div>
            <div className="cv-kpi-card__sub">open items across agents, clients and money</div>
          </Card>
          <Card className="cv-kpi-card">
            <div className="cv-kpi-card__label">Awaiting signature</div>
            <div className="cv-kpi-card__value">
              {ops ? formatMoney(awaitingSignature.reduce((s, p) => s + (p.total_cents ?? 0), 0)) : "—"}
            </div>
            <div className="cv-kpi-card__sub">{ops ? `${awaitingSignature.length} proposal${awaitingSignature.length === 1 ? "" : "s"} sent, unsigned` : ""}</div>
          </Card>
          <Card className="cv-kpi-card">
            <div className="cv-kpi-card__label">Outstanding</div>
            <div className="cv-kpi-card__value">
              {ops ? formatMoney(sentInvoices.reduce((s, i) => s + i.amount_cents, 0)) : "—"}
            </div>
            <div className="cv-kpi-card__sub">
              {ops ? `${sentInvoices.length} invoice${sentInvoices.length === 1 ? "" : "s"} due${overdueInvoices.length ? `, ${overdueInvoices.length} overdue` : ""}` : ""}
            </div>
          </Card>
          <Card className="cv-kpi-card">
            <div className="cv-kpi-card__label">Prospects to review</div>
            <div className="cv-kpi-card__value">{prospectBatches ? prospectsToReviewCount : "—"}</div>
            <div className="cv-kpi-card__sub">{prospectBatches ? `${prospectBatches.length} batch${prospectBatches.length === 1 ? "" : "es"} pending` : ""}</div>
          </Card>
        </div>

        <div className="cv-section">
          <div className="cv-section__head">
            <h2 className="cv-section__title">Needs you now</h2>
            <div className="cv-filter-pills">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`cv-pill ${filter === f.key ? "cv-pill--active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <Card>
            {needsYouRows === null ? (
              <EmptyState title="Loading…" />
            ) : !visibleRows.length ? (
              <EmptyState icon={Inbox} title="Nothing waiting" subtitle="Every agent, client and money item is clear." />
            ) : (
              visibleRows.map((row) => (
                <RowLink key={row.id} href={row.href} className="cv-list-row">
                  <StatusChip label={row.badge} tone={row.tone} />
                  <div className="cv-list-row__main">
                    <div className="cv-list-row__title">{row.title}</div>
                  </div>
                  {row.ageIso && <div className="cv-list-row__age">{formatAge(row.ageIso)}</div>}
                </RowLink>
              ))
            )}
          </Card>
        </div>

        <div className="cv-section">
          <div className="cv-section__head">
            <h2 className="cv-section__title">Morning brief</h2>
            <div className="cv-tabs">
              <button type="button" className={`cv-tab ${briefTab === "morning" ? "cv-tab--active" : ""}`} onClick={() => setBriefTab("morning")}>
                Morning
              </button>
              <button type="button" className={`cv-tab ${briefTab === "past" ? "cv-tab--active" : ""}`} onClick={() => setBriefTab("past")}>
                Past
              </button>
            </div>
          </div>
          <Card style={{ padding: 24 }}>
            {briefs === null ? (
              <EmptyState title="Loading…" />
            ) : briefTab === "morning" ? (
              !morningBrief ? (
                <EmptyState title="No brief yet" subtitle="Ara's next morning run posts here." />
              ) : (
                <BriefBody brief={morningBrief} />
              )
            ) : !pastBriefs.length ? (
              <EmptyState title="No past briefs yet" />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
                <div>
                  {pastBriefs.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedPastBriefId(b.id)}
                      className={`cv-tab ${selectedPastBrief?.id === b.id ? "cv-tab--active" : ""}`}
                      style={{ display: "block", width: "100%", textAlign: "left", borderBottom: "none" }}
                    >
                      {b.title}
                      <div style={{ fontSize: 12, color: "var(--cv-faint)" }}>{new Date(b.created_at).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
                <div>{selectedPastBrief ? <BriefBody brief={selectedPastBrief} /> : <EmptyState title="Select a brief" />}</div>
              </div>
            )}
          </Card>
        </div>

        <div className="cv-section">
          <div className="cv-section__head">
            <h2 className="cv-section__title">Coming up</h2>
          </div>
          <Card>
            {!ops ? (
              <EmptyState title="Loading…" />
            ) : !comingUp.length ? (
              <EmptyState title="Nothing due in the next 7 days" />
            ) : (
              comingUp.map((inv) => {
                const project = projects[inv.client_project_id];
                return (
                  <RowLink
                    key={inv.id}
                    href={project ? `/admin/clients/${inv.client_id}/projects/${project.id}` : "/admin/money"}
                    className="cv-coming-up-row"
                  >
                    <time>{new Date(`${inv.due_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                    <div className="cv-coming-up-row__main">{ops.clientNames[inv.client_id]} · {inv.label}</div>
                    <strong>{formatMoney(inv.amount_cents, inv.currency)}</strong>
                  </RowLink>
                );
              })
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function BriefBody({ brief }: { brief: Brief }) {
  return (
    <>
      <h3 style={{ marginBottom: 2 }}>{brief.title}</h3>
      <p style={{ fontSize: 13, color: "var(--cv-muted)", marginBottom: 18 }}>
        {new Date(brief.created_at).toLocaleString()}
      </p>
      {brief.sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cv-faint)", marginBottom: 6 }}>
            {s.heading}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {s.items.map((item, j) => (
              <li key={j} style={{ fontSize: 15, color: "var(--cv-body)" }}>
                {item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "var(--cv-accent)" }}>{item.text}</a> : item.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
