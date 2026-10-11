// Today — the landing page for the .cv-admin shell (CRE-332 Phase 2).
// Read-only (besides check-off), no schema change beyond the two new brief
// columns below — every query here already exists elsewhere.
//
// CRE-335: every Needs-you-now item and every brief line gets a checkbox.
// Checking one writes brief_item_completions (via complete-brief-item,
// see src/lib/briefItemCompletions.ts) instead of Bree telling Ara in chat.
// Checked items stay visible, struck through, with an Undo — they are
// never removed from the underlying data here.
//
// CRE-388: re-layout. The brief's own markdown "Needs You" section is
// retired outright — its structured rows (Brief.needs_you) merge into the
// one live "Needs you now" panel instead, so there's a single list. Every
// section (Needs you now, In flight / stuck, Calendar, Pipeline,
// Approvals, Done timeline in the center; Top line, Money, Connections in
// the right sidebar) is its own bordered card with an icon + count badge
// in the header, instead of all living inside one shared "Morning brief"
// card where titles got lost. The Morning/Past brief picker shrinks to a
// small control card; whichever brief it points at drives every section
// below it.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Newspaper, RefreshCw, Sparkles } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";
import KpiCard from "@/components/admin/cv/KpiCard";
import EmptyState from "@/components/admin/cv/EmptyState";
import SectionCard from "@/components/admin/cv/SectionCard";
import BriefCheckItem from "@/components/admin/cv/BriefCheckItem";
import NeedsYouRow from "@/components/admin/cv/NeedsYouRow";
import WeeklyCalendarCard from "@/components/admin/cv/WeeklyCalendarCard";
import MoneyCard from "@/components/admin/cv/MoneyCard";
import PipelineBriefCard from "@/components/admin/cv/PipelineBriefCard";
import { LinkifiedText } from "@/components/admin/cv/IssueLinks";
import { containsKnownIssueId } from "@/lib/issueLinks";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, loadAdminOperations, type AdminOperations } from "@/lib/adminOperations";
import { useNeedsYouNow } from "@/lib/needsYouNow";
import { useBriefs, type Brief, type BriefItem, type BriefSection } from "@/lib/briefs";
import { useBriefItemCompletions } from "@/lib/briefItemCompletions";
import { buildNeedsYouRows, splitTodayRows, type NeedsYouFilterTag } from "@/lib/needsYouRows";
import { briefHeadline, formatMoment } from "@/lib/briefFormat";
import DecideCard from "@/components/admin/cv/DecideCard";

// CRE-391: Approvals and In flight joined Agents/Clients/Money as their own
// filter tags once their cards merged into this one list — see the table
// on CRE-391 for what each tag actually matches. A tag with zero open rows
// is hidden rather than shown as a dead "0" filter (All always stays).
//
// The Admin Journeys canvas splits that one list in two — Decide and Do —
// so "approvals" leaves this set: an approval is no longer a filter on
// this list, it IS the other list. The rest stay, still hidden at zero.
const FILTERS: Array<{ key: "all" | NeedsYouFilterTag; label: string }> = [
  { key: "all", label: "All" },
  { key: "agents", label: "Agents" },
  { key: "clients", label: "Clients" },
  { key: "money", label: "Money" },
  { key: "in_flight", label: "In flight" },
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

// CRE-358/CRE-366: a brief whose structured field is present and non-empty
// gets the redesigned card; the matching markdown heading is then
// superseded (hidden) so Ara's old free-text version never doubles up.
function hasCalendarCard(brief: Brief): boolean {
  return Array.isArray(brief.calendar_events) && brief.calendar_events.length > 0;
}
function hasMoneyStats(brief: Brief): boolean {
  return Boolean(brief.money_stats?.cards?.length);
}
function hasApprovals(brief: Brief): boolean {
  return Boolean(brief.approvals?.length);
}
function hasInFlightItems(brief: Brief): boolean {
  return Boolean(brief.in_flight?.length);
}

const CALENDAR_HEADINGS = new Set(["calendar"]);
const MONEY_HEADINGS = new Set(["money"]);
const DONE_HEADINGS = new Set(["done", "done since last digest", "since last digest"]);
const APPROVAL_HEADINGS = new Set(["approvals", "awaiting your approval", "awaiting approval", "decisions"]);
const IN_FLIGHT_HEADINGS = new Set(["in flight", "in flight / stuck", "in flight/stuck", "stuck"]);
// CRE-388: scratched outright, not conditional on a structured field being
// present like the sets above — the markdown "Needs You" section never
// renders again, full stop. Its rows live in the merged live panel.
const NEEDS_YOU_HEADINGS = new Set(["needs you", "needs you now"]);
const TOP_LINE_HEADINGS = new Set(["top line"]);
const CONNECTIONS_HEADINGS = new Set(["connections"]);
const SIDEBAR_HEADINGS = new Set([...TOP_LINE_HEADINGS, ...CONNECTIONS_HEADINGS, ...MONEY_HEADINGS]);

function supersededHeadingsFor(brief: Brief): Set<string> {
  // CRE-391: Done is retired outright, not conditional on a structured
  // field like the sets below — its markdown heading never renders again
  // either, same treatment as NEEDS_YOU_HEADINGS in splitBriefSections.
  const hide = new Set<string>(DONE_HEADINGS);
  if (hasCalendarCard(brief)) for (const h of CALENDAR_HEADINGS) hide.add(h);
  if (hasMoneyStats(brief)) for (const h of MONEY_HEADINGS) hide.add(h);
  if (hasApprovals(brief)) for (const h of APPROVAL_HEADINGS) hide.add(h);
  if (hasInFlightItems(brief)) for (const h of IN_FLIGHT_HEADINGS) hide.add(h);
  return hide;
}

/** Splits a brief's free-text sections into "center" (the leftover
 *  markdown sections with no redesigned card yet) and "sidebar" (Top
 *  line / Connections, plus Money's own markdown fallback when it hasn't
 *  sent money_stats). Empty sections, the scratched Needs You section, and
 *  anything superseded by a structured card are dropped entirely. */
function splitBriefSections(brief: Brief): { center: BriefSection[]; sidebar: BriefSection[] } {
  const superseded = supersededHeadingsFor(brief);
  const center: BriefSection[] = [];
  const sidebar: BriefSection[] = [];
  for (const s of brief.sections) {
    if (!s.items.length) continue;
    const heading = s.heading.trim().toLowerCase();
    if (NEEDS_YOU_HEADINGS.has(heading)) continue;
    if (superseded.has(heading)) continue;
    if (SIDEBAR_HEADINGS.has(heading)) sidebar.push(s);
    else center.push(s);
  }
  return { center, sidebar };
}

function MarkdownSectionCard({
  brief, section, sectionIdx, isDone, complete, undo,
}: {
  brief: Brief;
  section: BriefSection;
  sectionIdx: number;
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
}) {
  return (
    <SectionCard title={section.heading} count={section.items.length}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {section.items.map((item, j) => {
          const id = briefItemId(brief.id, sectionIdx, j, item);
          const issue = briefItemIssue(item);
          // An embedded CRE-### gets its own link, which supersedes
          // wrapping the whole line in `item.link` (can't nest an <a>
          // inside an <a>) — item.link usually points at the very same
          // Paperclip card anyway (see briefItemIssue).
          const hasId = containsKnownIssueId(item.text);
          return (
            <li key={j}>
              <BriefCheckItem
                done={isDone(id)}
                onComplete={() => complete({
                  item_id: id, item_text: item.text, issue_identifier: issue,
                  brief_date: brief.created_at.slice(0, 10),
                })}
                onUndo={() => undo(id)}
              >
                {item.link && !hasId ? (
                  <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.text}</a>
                ) : (
                  <LinkifiedText text={item.text} />
                )}
              </BriefCheckItem>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

export default function Today() {
  const navigate = useNavigate();
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | NeedsYouFilterTag>("all");
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

  // Whichever brief the Morning/Past control points at drives every
  // section below it — Calendar, Pipeline, Approvals, In flight and the
  // merged Needs-you-now narrative rows all read from this one brief. Done
  // is retired (CRE-391) — it's never read here, regardless of brief.
  const activeBrief = briefTab === "morning" ? latestMorning : current;
  const narrativeNeedsYou = useMemo(() => activeBrief?.needs_you ?? [], [activeBrief]);

  const openLiveNeedsYouNow = useMemo(
    () => (needsYouNow ?? []).filter((item) => !isDone(item.id)),
    [needsYouNow, isDone],
  );
  const prospectsToReview = useMemo(
    () => openLiveNeedsYouNow.filter((item) => item.kind === "prospect approvals").length,
    [openLiveNeedsYouNow],
  );

  // CRE-391: live items, the brief's approvals / in-flight cards and its
  // narrative needs-you lines all merge into one row list, each row
  // carrying its own filter tag — see needsYouRows.ts. `allRows` is the
  // full merge; checking an item off is acknowledgement, not resolution
  // (CRE-335 §4), so it still shows here, struck through, just excluded
  // from the counts/badges below (`openRows`).
  const allRows = useMemo(
    () => buildNeedsYouRows({
      live: needsYouNow, narrative: narrativeNeedsYou,
      approvals: activeBrief?.approvals, inFlight: activeBrief?.in_flight,
    }),
    [needsYouNow, narrativeNeedsYou, activeBrief],
  );
  // Decide is what an agent is stopped on; Do is your own work. Split by
  // source, in needsYouRows.ts, so the rule is testable.
  const { decide: decideRows, todo: doRows } = useMemo(() => splitTodayRows(allRows), [allRows]);
  const openDecide = useMemo(() => decideRows.filter((r) => !isDone(r.id)), [decideRows, isDone]);
  const openRows = useMemo(() => doRows.filter((row) => !isDone(row.id)), [doRows, isDone]);
  const totalOpenNeedsYou = openRows.length;

  const bucketCounts = useMemo(() => {
    const counts: Record<"all" | NeedsYouFilterTag, number> = {
      all: totalOpenNeedsYou, agents: 0, clients: 0, money: 0, approvals: 0, in_flight: 0,
    };
    // `approvals` stays in the record so the type still covers every tag,
    // but no Do row carries it — they all went to Decide.
    for (const row of openRows) counts[row.tag] += 1;
    return counts;
  }, [openRows, totalOpenNeedsYou]);

  // A tag with nothing open hides itself rather than sitting there as a
  // dead "0" filter — except All (always shown) and whichever tag is
  // currently selected (so picking one doesn't make its own tab vanish
  // the moment its last row gets checked off).
  const visibleFilters = useMemo(
    () => FILTERS.filter((f) => f.key === "all" || f.key === filter || bucketCounts[f.key] > 0),
    [bucketCounts, filter],
  );
  const needsYouHint = useMemo(() => {
    const parts = FILTERS
      .filter((f) => f.key !== "all" && bucketCounts[f.key] > 0)
      .map((f) => `${bucketCounts[f.key]} ${f.label.toLowerCase()}`);
    return parts.length ? parts.join(" · ") : "Nothing waiting";
  }, [bucketCounts]);

  const needsYouRows = useMemo(
    () => (filter === "all" ? doRows : doRows.filter((row) => row.tag === filter)),
    [doRows, filter],
  );

  const sectionsSplit = activeBrief ? splitBriefSections(activeBrief) : null;
  const sidebarTopLine = sectionsSplit?.sidebar.find((s) => TOP_LINE_HEADINGS.has(s.heading.trim().toLowerCase()));
  const sidebarConnections = sectionsSplit?.sidebar.find((s) => CONNECTIONS_HEADINGS.has(s.heading.trim().toLowerCase()));
  const sidebarMoneyMarkdown = sectionsSplit?.sidebar.find((s) => MONEY_HEADINGS.has(s.heading.trim().toLowerCase()));

  // Brief label, the way the canvas writes it: the brief's own title, its
  // date, and when it landed. Not a fixed page subtitle — which brief you
  // are reading is the single most useful thing in this header, and a
  // catch-up brief posted Saturday evening reads very differently from
  // Monday's 8am one.
  const briefLabel = activeBrief
    ? briefHeadline(activeBrief.title, activeBrief.created_at)
    : "No brief yet";

  // The cutoff pill on the top line. Derived, not a field: the soonest
  // deadline among the things waiting on a decision IS the cutoff, and
  // inventing a column for it would just be somewhere else to forget to
  // write.
  const soonestDeadline = formatMoment(decideRows.map((r) => r.deadline).filter(Boolean)[0]);

  const topLineItems = sidebarTopLine?.items ?? [];

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-today" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <header className="cv-today-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="cv-today-head__title">Today</h1>
            <p className="cv-today-head__sub">{briefLabel}</p>
          </div>
          <div className="cv-today-head__right">
            <span className="cv-seg" role="group" aria-label="Which brief">
              <button
                type="button"
                className={`cv-seg__btn ${briefTab === "morning" ? "cv-seg__btn--on" : ""}`}
                aria-pressed={briefTab === "morning"}
                onClick={() => setBriefTab("morning")}
              >
                Latest brief
              </button>
              <button
                type="button"
                className={`cv-seg__btn ${briefTab === "past" ? "cv-seg__btn--on" : ""}`}
                aria-pressed={briefTab === "past"}
                onClick={() => setBriefTab("past")}
              >
                Past briefs
              </button>
            </span>
            <button type="button" className="cv-act" onClick={syncNow}>
              <RefreshCw size={14} /> Sync now
            </button>
          </div>
        </header>

        {/* The picker only exists while you are picking. It used to be a
            permanent card at the top of the left column, which spent a
            whole card on a control you touch once a week. */}
        {briefTab === "past" && (
          <Card className="cv-card-pad">
            {!briefs?.length ? (
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
              </div>
            )}
          </Card>
        )}

        {/* Top line — full width and dark, above everything. It was in the
            right sidebar, which put the one paragraph that frames the whole
            day beside the day rather than before it. */}
        {activeBrief && topLineItems.length > 0 && (
          <section className="cv-topline">
            <div className="cv-topline__head">
              <span className="cv-topline__label">Top line</span>
              {soonestDeadline && <span className="cv-topline__pill">Cutoff {soonestDeadline}</span>}
            </div>
            <p className="cv-topline__lede"><LinkifiedText text={topLineItems[0].text} /></p>
            {topLineItems.slice(1).map((item, i) => (
              <p key={i} className="cv-topline__note"><LinkifiedText text={item.text} /></p>
            ))}
          </section>
        )}

        <div className="cv-kpi-row">
          <KpiCard
            label="Decisions waiting"
            value={activeBrief ? openDecide.length : "—"}
            hint={soonestDeadline ? `1 due ${soonestDeadline}` : undefined}
          />
          <KpiCard
            label="To do"
            value={needsYouNow ? totalOpenNeedsYou : "—"}
            hint={needsYouNow ? needsYouHint : undefined}
            onClick={() => setFilter("all")}
          />
          <KpiCard
            label="Prospects to review"
            value={needsYouNow ? prospectsToReview : "—"}
            hint="Sends via the Prospects queue"
            onClick={() => navigate("/admin/prospects")}
          />
        </div>

        <div className="cv-today-body">
          <div className="cv-center-stack">

            {/* Decide — an agent is holding a set of answers open. The
                buttons come from the brief's own `options` and are inert:
                nothing records which one was picked, and a button that
                silently does nothing is worse than one that says so. */}
            {decideRows.length > 0 && (
              <SectionCard
                title="Decide"
                count={openDecide.length}
                countTone="blue"
                sub="Your agents are waiting on a yes or no"
              >
                <div>
                  {decideRows.map((row) => (
                    <DecideCard key={row.id} row={row} />
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard
              title="Do"
              count={totalOpenNeedsYou}
              countTone="amber"
              right={
                <div className="cv-filter-tabs">
                  {visibleFilters.map((f) => (
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
              }
            >
              {!needsYouNow ? (
                <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
              ) : !needsYouRows.length ? (
                <EmptyState title="Nothing waiting" subtitle="Nothing in this filter needs you right now." />
              ) : (
                <div className="cv-nylist">
                  {needsYouRows.map((row) => (
                    <NeedsYouRow
                      key={row.id}
                      marker={row.marker}
                      title={row.title}
                      description={row.description}
                      nextStep={row.nextStep}
                      category={row.category}
                      taskIds={row.taskIds}
                      href={row.href}
                      done={isDone(row.id)}
                      onComplete={() => complete({
                        item_id: row.id, item_text: row.title, issue_identifier: row.taskIds[0] ?? null,
                        brief_date: activeBrief?.created_at.slice(0, 10) ?? null,
                      })}
                      onUndo={() => undo(row.id)}
                    />
                  ))}
                </div>
              )}
              <p className="cv-today-foot">
                Checking an item tells your agents you've handled it. It stays here,
                crossed out, until the next brief.
              </p>
            </SectionCard>

            {activeBrief && sectionsSplit?.center.map((section, i) => (
              <MarkdownSectionCard
                key={section.heading + i}
                brief={activeBrief}
                section={section}
                sectionIdx={activeBrief.sections.indexOf(section)}
                isDone={isDone} complete={complete} undo={undo}
              />
            ))}

            {/* Connections reads here, not in the right column: the canvas's
                sidebar is exactly This week / Money / Pipeline, and a fourth
                card below Pipeline is the first thing that stopped the two
                columns lining up. It is still the brief's own section. */}
            {sidebarConnections && activeBrief && (
              <MarkdownSectionCard
                brief={activeBrief}
                section={sidebarConnections}
                sectionIdx={activeBrief.sections.indexOf(sidebarConnections)}
                isDone={isDone} complete={complete} undo={undo}
              />
            )}
          </div>

          <aside className="cv-sidebar-stack">
            {activeBrief?.calendar_events?.length ? (
              <WeeklyCalendarCard events={activeBrief.calendar_events} />
            ) : null}

            {activeBrief && hasMoneyStats(activeBrief) ? (
              <Card className="cv-card-pad">
                <MoneyCard stats={activeBrief.money_stats!} />
              </Card>
            ) : sidebarMoneyMarkdown && activeBrief ? (
              <MarkdownSectionCard
                brief={activeBrief}
                section={sidebarMoneyMarkdown}
                sectionIdx={activeBrief.sections.indexOf(sidebarMoneyMarkdown)}
                isDone={isDone} complete={complete} undo={undo}
              />
            ) : null}

            <PipelineBriefCard
              pipeline={activeBrief?.pipeline}
              isDone={isDone} complete={complete} undo={undo}
              briefDate={activeBrief?.created_at.slice(0, 10) ?? today}
            />

          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
