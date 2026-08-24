// Context gatherers — the read half of each agent.
//
// Each returns a compact JSON snapshot that goes into the prompt. Deliberately
// small: an agent that reads 400 rows costs more and reasons worse than one
// reading the 20 that matter. Money always comes from revenue_ledger_v so an
// agent and the dashboard can never disagree about a number.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  buildFollowupAgenda, needingHuman, needingNudge, summariseAgenda,
  type ProposalSignal,
} from "./followups.ts";
import { cadenceFor, isAuthFailure, runway } from "../social/schedule-policy.ts";

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function revenueContext(sb: SupabaseClient, lookbackDays = 30) {
  const since = iso(lookbackDays * DAY);
  const priorSince = iso(lookbackDays * 2 * DAY);

  const [ledger, ventures, levels, launches, unpaid, proposals] = await Promise.all([
    sb.from("revenue_ledger_v").select("stream, venture_id, launch_id, occurred_at, amount_cents")
      .gte("occurred_at", priorSince),
    sb.from("ventures").select("id, slug, name, kind, goal_mrr_cents, goal_members").neq("status", "archived"),
    sb.from("latest_metric_snapshots_v").select("venture_id, metric_key, value, captured_on"),
    sb.from("venture_launches").select("id, venture_id, name, status, starts_at, cart_close_at, goal_revenue_cents, goal_signups")
      .in("status", ["planned", "open", "running"]),
    sb.from("project_invoices").select("id, label, amount_cents, due_date, client_id, status")
      .in("status", ["sent", "scheduled"]),
    sb.from("client_proposals").select("id, title, client_id, created_at").eq("status", "sent"),
  ]);

  const rows = ledger.data ?? [];
  const sinceMs = Date.now() - lookbackDays * DAY;
  const priorMs = Date.now() - lookbackDays * 2 * DAY;
  const inCurrent = (r: { occurred_at: string }) => new Date(r.occurred_at).getTime() >= sinceMs;
  const inPrior = (r: { occurred_at: string }) => {
    const t = new Date(r.occurred_at).getTime();
    return t >= priorMs && t < sinceMs;
  };
  const sum = (rs: Array<{ amount_cents: number | null }>) =>
    rs.reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  const cur = rows.filter(inCurrent);
  const prev = rows.filter(inPrior);

  const nameOf: Record<string, string> = {};
  for (const v of ventures.data ?? []) nameOf[v.id] = v.name;

  const perVenture: Record<string, { cash: number; prior: number }> = {};
  for (const r of rows) {
    if (r.stream !== "venture" || !r.venture_id) continue;
    const b = (perVenture[r.venture_id] ??= { cash: 0, prior: 0 });
    if (inCurrent(r)) b.cash += r.amount_cents ?? 0;
    else if (inPrior(r)) b.prior += r.amount_cents ?? 0;
  }

  const mrrByVenture: Record<string, number> = {};
  const membersByVenture: Record<string, number> = {};
  for (const s of levels.data ?? []) {
    if (s.metric_key === "mrr_cents") mrrByVenture[s.venture_id] = Number(s.value);
    if (s.metric_key === "paid_members") membersByVenture[s.venture_id] = Number(s.value);
  }

  return {
    window_days: lookbackDays,
    // Cash and run-rate stay separate here for the same reason they do in the
    // dashboard: adding them double-counts every community dollar.
    cash: {
      total: money(sum(cur)),
      prior_period: money(sum(prev)),
      agency: money(sum(cur.filter((r) => r.stream === "agency"))),
      ventures: money(sum(cur.filter((r) => r.stream === "venture"))),
    },
    recurring_run_rate: money(Object.values(mrrByVenture).reduce((a, b) => a + b, 0)),
    ventures: (ventures.data ?? []).map((v) => ({
      name: v.name,
      kind: v.kind,
      cash_this_period: money(perVenture[v.id]?.cash ?? 0),
      cash_prior_period: money(perVenture[v.id]?.prior ?? 0),
      run_rate: mrrByVenture[v.id] ? money(mrrByVenture[v.id]) : null,
      members: membersByVenture[v.id] ?? null,
      goal_run_rate: v.goal_mrr_cents ? money(v.goal_mrr_cents) : null,
      goal_members: v.goal_members,
    })),
    open_launches: (launches.data ?? []).map((l) => ({
      id: l.id,
      venture: nameOf[l.venture_id] ?? null,
      name: l.name,
      status: l.status,
      cart_close_at: l.cart_close_at,
      goal_revenue: l.goal_revenue_cents ? money(l.goal_revenue_cents) : null,
      actual_revenue: money(sum(rows.filter((r) => r.launch_id === l.id))),
      goal_signups: l.goal_signups,
    })),
    outstanding_invoices: {
      count: unpaid.data?.length ?? 0,
      total: money(sum(unpaid.data ?? [])),
    },
    unsigned_proposals: proposals.data?.length ?? 0,
  };
}

export async function launchContext(sb: SupabaseClient, cfg: Record<string, unknown>) {
  const { data: launches } = await sb.from("venture_launches")
    .select("*").in("status", ["planned", "open", "running"])
    .order("cart_close_at", { ascending: true, nullsFirst: false });
  if (!launches?.length) return { open_launches: [] };

  const ids = launches.map((l) => l.id);
  const [{ data: ledger }, { data: events }, { data: items }, { data: ventures }] = await Promise.all([
    sb.from("revenue_ledger_v").select("launch_id, amount_cents").in("launch_id", ids),
    sb.from("funnel_events").select("launch_id, stage, anon_id").in("launch_id", ids),
    sb.from("launch_checklist_items").select("id, launch_id, key, label, status, due_date")
      .in("launch_id", ids).order("order_index"),
    sb.from("ventures").select("id, name, funnel_stages"),
  ]);

  const vById: Record<string, { name: string; stages: Array<{ key: string; label: string }> }> = {};
  for (const v of ventures ?? []) {
    vById[v.id] = { name: v.name, stages: Array.isArray(v.funnel_stages) ? v.funnel_stages : [] };
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  return {
    warn_if_behind_pct: cfg.warn_if_behind_pct ?? 70,
    remind_days_before_close: cfg.remind_days_before_close ?? 3,
    open_launches: launches.map((l) => {
      const cash = (ledger ?? []).filter((r) => r.launch_id === l.id);
      const actual = cash.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
      const sales = cash.filter((r) => (r.amount_cents ?? 0) > 0).length;

      const stages = vById[l.venture_id]?.stages ?? [];
      const evs = (events ?? []).filter((e) => e.launch_id === l.id);
      const funnel = stages.map((s) => ({
        stage: s.label,
        key: s.key,
        count: evs.filter((e) => e.stage === s.key).length,
      }));

      const checklist = (items ?? []).filter((c) => c.launch_id === l.id);
      const overdue = checklist.filter(
        (c) => c.status !== "complete" && c.due_date && new Date(c.due_date) < today,
      );

      const daysToClose = l.cart_close_at
        ? Math.round((new Date(l.cart_close_at).getTime() - Date.now()) / DAY)
        : null;

      return {
        id: l.id,
        venture: vById[l.venture_id]?.name ?? null,
        name: l.name,
        status: l.status,
        days_to_cart_close: daysToClose,
        starts_at: l.starts_at,
        goal_revenue: l.goal_revenue_cents ? money(l.goal_revenue_cents) : null,
        actual_revenue: money(actual),
        pct_of_revenue_goal: l.goal_revenue_cents
          ? Math.round((actual / l.goal_revenue_cents) * 100) : null,
        goal_signups: l.goal_signups,
        actual_signups: sales,
        funnel,
        checklist_done: checklist.filter((c) => c.status === "complete").length,
        checklist_total: checklist.length,
        overdue_checklist_items: overdue.map((c) => ({ id: c.id, label: c.label, due_date: c.due_date })),
      };
    }),
  };
}

export async function clientOpsContext(sb: SupabaseClient, cfg: Record<string, unknown>) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const invoiceOverdueDays = Number(cfg.invoice_overdue_days ?? 7);
  const proposalStaleDays = Number(cfg.proposal_stale_days ?? 5);

  const [overdueTasks, invoices, proposals, previews, clients] = await Promise.all([
    sb.from("project_tasks")
      .select("id, name, due_date, status, priority, client_project_id, assignee_kind")
      .neq("status", "complete").lt("due_date", todayIso)
      .in("assignee_kind", ["agency", "admin", "auto"])
      .order("due_date", { ascending: true }).limit(40),
    sb.from("project_invoices").select("id, label, amount_cents, due_date, client_id, sent_at, status")
      .in("status", ["sent", "scheduled"]).order("due_date", { ascending: true }).limit(40),
    sb.from("client_proposals")
      .select("id, title, client_id, client_project_id, created_at, sent_at, sent_to, status")
      .in("status", ["sent", "draft"]).limit(40),
    sb.from("preview_projects").select("id, name, client_id, updated_at").limit(40),
    sb.from("clients").select("id, business_name, contact_name, contact_email, pipeline_stage")
      .eq("archived", false),
  ]);

  const cName: Record<string, string> = {};
  const cEmail: Record<string, string | null> = {};
  for (const c of clients.data ?? []) {
    cName[c.id] = c.business_name || c.contact_name || "Untitled";
    cEmail[c.id] = c.contact_email;
  }

  const projIds = [...new Set((overdueTasks.data ?? []).map((t) => t.client_project_id).filter(Boolean))];
  const projMap: Record<string, { client_id: string; name: string | null }> = {};
  if (projIds.length) {
    const { data: projs } = await sb.from("client_projects").select("id, client_id, name").in("id", projIds);
    for (const p of projs ?? []) projMap[p.id] = { client_id: p.client_id, name: p.name };
  }

  const daysPast = (d: string | null) =>
    d ? Math.round((Date.now() - new Date(d).getTime()) / DAY) : null;

  return {
    overdue_tasks: (overdueTasks.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      days_overdue: daysPast(t.due_date),
      priority: t.priority,
      project: projMap[t.client_project_id!]?.name ?? null,
      client: cName[projMap[t.client_project_id!]?.client_id ?? ""] ?? null,
      client_project_id: t.client_project_id,
    })),
    unpaid_invoices: (invoices.data ?? [])
      .map((i) => ({
        id: i.id,
        label: i.label,
        amount: money(i.amount_cents),
        client: cName[i.client_id] ?? null,
        client_email: cEmail[i.client_id] ?? null,
        client_id: i.client_id,
        days_overdue: i.due_date && new Date(i.due_date) < new Date() ? daysPast(i.due_date) : null,
        sent: !!i.sent_at,
      }))
      .filter((i) => i.days_overdue === null || i.days_overdue >= invoiceOverdueDays || !i.sent),
    stale_proposals: (proposals.data ?? [])
      .filter((p) => p.status === "sent" && !!p.sent_at &&
        (daysPast(p.sent_at) ?? 0) >= proposalStaleDays)
      .map((p) => ({
        id: p.id,
        title: p.title,
        client: cName[p.client_id] ?? null,
        client_id: p.client_id,
        days_waiting: daysPast(p.sent_at),
      })),

    // Written, sitting in the portal, and the client has never been told.
    //
    // Reported at ANY age, unlike stale_proposals — this is not a client who is
    // slow, it is work of ours that never left the building, and a day of that
    // is already worth saying. It exists because uploading a proposal sets the
    // status to 'sent' without emailing anyone or writing a send date, so these
    // rows look handled from every other angle.
    proposals_never_actually_sent: (proposals.data ?? [])
      .filter((p) => !p.sent_at)
      .map((p) => ({
        id: p.id,
        title: p.title,
        client: cName[p.client_id] ?? null,
        client_id: p.client_id,
        client_email: cEmail[p.client_id] ?? null,
        client_project_id: p.client_project_id,
        status: p.status,
        days_since_written: daysPast(p.created_at),
        fix: p.status === "draft"
          ? "Still a draft — it has to be finished before it can go out."
          : "Marked sent but never emailed. Use the Send to client button on the proposal, which mails the client a portal link and starts the follow-up clock.",
      })),
    active_previews: previews.data?.length ?? 0,
    thresholds: { invoice_overdue_days: invoiceOverdueDays, proposal_stale_days: proposalStaleDays },
  };
}

/**
 * The engineering queue: what is waiting to be handed to Claude, what came back
 * for review, and what is quietly rotting.
 *
 * Full task descriptions and acceptance criteria are included for queued items
 * only — judging whether a task is specified well enough is the whole job, and
 * that cannot be done from a title.
 */
export async function developerContext(sb: SupabaseClient, cfg: Record<string, unknown>) {
  const queueStatus = String(cfg.queue_status ?? "ready_for_claude");
  const reviewStatus = String(cfg.review_status ?? "needs_review");
  const staleDays = Number(cfg.stale_after_days ?? 21);
  const maxDepth = Number(cfg.max_queue_depth ?? 15);

  const [queued, inReview, inProgress, blocked, projects] = await Promise.all([
    sb.from("project_tasks")
      .select("id, name, description, acceptance_criteria, client_project_id, priority, size, due_date, blocked_by, tags, url, design_url, created_at, updated_at, epic_id")
      .eq("status", queueStatus).order("order_index").limit(40),
    sb.from("project_tasks")
      .select("id, name, description, client_project_id, priority, updated_at, completed_at")
      .eq("status", reviewStatus).order("updated_at", { ascending: true }).limit(25),
    sb.from("project_tasks")
      .select("id, name, client_project_id, updated_at")
      .eq("status", "in_progress").limit(25),
    sb.from("project_tasks")
      .select("id, name, client_project_id, blocked_by, manual_prereqs")
      .eq("status", "blocked").limit(25),
    sb.from("client_projects").select("id, client_id, name, status"),
  ]);

  const projMap: Record<string, { name: string | null; client_id: string }> = {};
  for (const p of projects.data ?? []) projMap[p.id] = { name: p.name, client_id: p.client_id };

  const clientIds = [...new Set(Object.values(projMap).map((p) => p.client_id))];
  const clientName: Record<string, string> = {};
  if (clientIds.length) {
    const { data: cls } = await sb.from("clients")
      .select("id, business_name, contact_name").in("id", clientIds);
    for (const c of cls ?? []) clientName[c.id] = c.business_name || c.contact_name || "Untitled";
  }

  const label = (projectId: string | null) => {
    if (!projectId) return null;
    const p = projMap[projectId];
    if (!p) return null;
    return { project: p.name, client: clientName[p.client_id] ?? null };
  };

  const ageDays = (iso: string | null) =>
    iso ? Math.round((Date.now() - new Date(iso).getTime()) / DAY) : null;

  // A task's own id set, so a blocked_by pointing at something already done can
  // be spotted rather than taken at face value.
  const openIds = new Set([
    ...(queued.data ?? []).map((t) => t.id),
    ...(inProgress.data ?? []).map((t) => t.id),
    ...(blocked.data ?? []).map((t) => t.id),
  ]);

  return {
    thresholds: { stale_after_days: staleDays, healthy_queue_depth: maxDepth },
    queue_depth: queued.data?.length ?? 0,
    queue: (queued.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      // Truncated: enough to judge specification quality without blowing context.
      // The description itself is not here. Forty tasks at 1500 characters is
      // up to 60KB of prose on every run, and judging whether a task is
      // specified well enough is a job you do one task at a time — so the
      // shape is summarised here and the text is fetched when it is read.
      description_chars: (t.description ?? "").length,
      description_preview: (t.description ?? "").slice(0, 200),
      description_length: (t.description ?? "").length,
      acceptance_criteria_count: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria.length : 0,
      has_design: !!t.design_url,
      has_url: !!t.url,
      priority: t.priority,
      size: t.size,
      tags: t.tags ?? [],
      due_date: t.due_date,
      age_days: ageDays(t.created_at),
      days_since_touched: ageDays(t.updated_at),
      blocked_by: t.blocked_by ?? [],
      blocked_by_still_open: (t.blocked_by ?? []).filter((id: string) => openIds.has(id)),
      ...label(t.client_project_id),
    })),
    awaiting_review: (inReview.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description_chars: (t.description ?? "").length,
      description_preview: (t.description ?? "").slice(0, 200),
      days_waiting: ageDays(t.updated_at),
      priority: t.priority,
      ...label(t.client_project_id),
    })),
    in_progress: (inProgress.data ?? []).map((t) => ({
      id: t.id, name: t.name, days_running: ageDays(t.updated_at), ...label(t.client_project_id),
    })),
    blocked: (blocked.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      blocked_by: t.blocked_by ?? [],
      // A blocker that is no longer open means this task is probably unblocked.
      blockers_still_open: (t.blocked_by ?? []).filter((id: string) => openIds.has(id)).length,
      manual_prereqs: t.manual_prereqs,
      ...label(t.client_project_id),
    })),
  };
}

/**
 * The engagement picture: who is missing from SureContact, what proposals are
 * in flight, and what each client has actually done with the one they were sent.
 *
 * The engagement timeline is the point of this gatherer. "Proposal sent 6 days
 * ago" and "proposal sent 6 days ago, opened twice, clicked once, never signed"
 * call for completely different follow-ups, and only the second is a decision
 * you can make from data.
 */
export async function engagementContext(sb: SupabaseClient, cfg: Record<string, unknown>) {
  // Two days, not four. Bree asked for a 48-hour window; `agents.config`
  // overrides it per agent, and the migration sets it explicitly there too so
  // the live value does not depend on this fallback.
  const followupAfter = Number(cfg.followup_after_days ?? 2);
  const maxFollowups = Number(cfg.max_followups ?? 3);
  const staleAfter = Number(cfg.stale_after_days ?? 21);

  const [clients, proposals, projects, withContent, events] = await Promise.all([
    sb.from("clients")
      .select("id, business_name, contact_name, contact_email, pipeline_stage, surecontact_contact_uuid, created_at")
      .eq("archived", false).order("created_at", { ascending: false }).limit(120),
    sb.from("client_proposals")
      .select(
        // Deliberately NOT selecting `content`: the whole proposal body was
        // being pulled over the wire for 40 proposals only to compute a
        // boolean. `has_content` is derived from a separate id-only query.
        "id, title, client_id, client_project_id, status, created_at, sent_at, sent_to, " +
          "first_opened_at, first_viewed_at, last_activity_at, next_followup_at, followup_count, " +
          "client_signed_at, declined_at, decline_reason, source_pdf_path",
      )
      .neq("status", "voided").order("created_at", { ascending: false }).limit(40),
    sb.from("client_projects").select("id, client_id, name, type, status").limit(200),
    sb.from("client_proposals").select("id").not("content", "is", null),
    sb.from("proposal_events")
      .select("proposal_id, event_type, actor, occurred_at, detail")
      .gte("occurred_at", iso(90 * DAY))
      .order("occurred_at", { ascending: false }).limit(300),
  ]);

  const cName: Record<string, string> = {};
  const cEmail: Record<string, string | null> = {};
  for (const c of clients.data ?? []) {
    cName[c.id] = c.business_name || c.contact_name || "Untitled";
    cEmail[c.id] = c.contact_email;
  }

  const projById: Record<string, { name: string | null; type: string | null }> = {};
  for (const p of projects.data ?? []) {
    projById[p.id] = { name: p.name, type: p.type };
  }

  const evByProposal: Record<string, Array<{ event_type: string; occurred_at: string; detail: unknown }>> = {};
  for (const e of events.data ?? []) {
    (evByProposal[e.proposal_id] ??= []).push({
      event_type: e.event_type,
      occurred_at: e.occurred_at,
      detail: e.detail,
    });
  }

  const hasContent = new Set(
    ((withContent.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );

  const daysSince = (d: string | null) =>
    d ? Math.round((Date.now() - new Date(d).getTime()) / DAY) : null;

  // A client is only "missing" once we have an email to sync — a client with no
  // contact_email cannot be a SureContact contact, so listing them as work to do
  // would be noise the agent can never clear.
  const unsynced = (clients.data ?? [])
    .filter((c) => !c.surecontact_contact_uuid && c.contact_email)
    .map((c) => ({
      client_id: c.id,
      client: cName[c.id],
      email: c.contact_email,
      pipeline_stage: c.pipeline_stage,
      days_since_created: daysSince(c.created_at),
    }));

  const inFlight = (proposals.data ?? []).map((p) => {
    const evs = evByProposal[p.id] ?? [];
    const counts: Record<string, number> = {};
    for (const e of evs) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;

    // What the client themselves did, as distinct from what we did to them.
    const engaged = (counts.email_opened ?? 0) + (counts.link_clicked ?? 0) +
      (counts.viewed_in_portal ?? 0);

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      client: cName[p.client_id] ?? null,
      client_id: p.client_id,
      client_email: p.sent_to ?? cEmail[p.client_id] ?? null,
      project: p.client_project_id ? projById[p.client_project_id]?.name ?? null : null,
      project_type: p.client_project_id ? projById[p.client_project_id]?.type ?? null : null,
      client_project_id: p.client_project_id,
      has_content: hasContent.has(p.id),
      has_pdf: !!p.source_pdf_path,
      days_since_created: daysSince(p.created_at),
      days_since_sent: daysSince(p.sent_at),
      days_since_activity: daysSince(p.last_activity_at ?? p.sent_at),
      opened: !!p.first_opened_at,
      viewed_in_portal: !!p.first_viewed_at,
      signed_at: p.client_signed_at,
      declined_at: p.declined_at,
      decline_reason: p.decline_reason,
      followups_sent: p.followup_count ?? 0,
      followup_due: !!p.next_followup_at && new Date(p.next_followup_at) <= new Date(),
      next_followup_at: p.next_followup_at,
      client_engagement_events: engaged,
      event_counts: counts,
      recent_events: evs.slice(0, 4),
    };
  });

  const sent = inFlight.filter((p) => p.status === "sent");
  const ids = (list: typeof inFlight) => list.map((p) => p.id);

  // The agenda is the answer to "what is outstanding", and it is computed
  // rather than left to the model: one bucket per proposal, decided in a fixed
  // order, each carrying the sentence that goes in the report and the brief for
  // the email. The buckets below are kept for anything that wants to slice the
  // list a different way, but they overlap and the agenda does not.
  const signals: ProposalSignal[] = (proposals.data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    client: cName[p.client_id] ?? null,
    client_id: p.client_id,
    client_email: p.sent_to ?? cEmail[p.client_id] ?? null,
    project: p.client_project_id ? projById[p.client_project_id]?.name ?? null : null,
    sent_at: p.sent_at,
    last_activity_at: p.last_activity_at,
    first_opened_at: p.first_opened_at,
    first_viewed_at: p.first_viewed_at,
    client_signed_at: p.client_signed_at,
    declined_at: p.declined_at ?? null,
    followups_sent: p.followup_count ?? 0,
  }));
  const agenda = buildFollowupAgenda(signals, {
    followupAfterDays: followupAfter,
    maxFollowups: maxFollowups,
    staleAfterDays: staleAfter,
    meetingLink: (cfg.proposal_meeting_link as string) || null,
  });

  return {
    follow_up_agenda: {
      summary: summariseAgenda(agenda),
      // Draft one email per entry here, and no more. Each carries the brief for
      // its own message — they differ by bucket and that difference is the point.
      draft_a_nudge_for: needingNudge(agenda),
      // These need Bree, not another email to the client.
      needs_your_decision: needingHuman(agenda),
      // Everything, including what is finished and what is still inside the
      // window, so a run can say "Menovia signed on Tuesday" rather than
      // silently omitting it.
      all: agenda,
    },
    clients_missing_from_surecontact: unsynced,
    proposals: inFlight,
    // Buckets are ID LISTS, not copies.
    //
    // These used to hold whole proposal objects, and JSON.stringify has no
    // reference sharing — so one sent-and-opened-but-unsigned proposal was
    // serialized four times over. Ids point back into `proposals` above and
    // cost a few bytes each.
    buckets: {
      needs_followup: ids(sent.filter(
        (p) =>
          p.followups_sent < maxFollowups &&
          (p.followup_due || (p.days_since_sent ?? 0) >= followupAfter) &&
          (p.days_since_activity ?? 0) >= followupAfter,
      )),
      sent_never_opened: ids(sent.filter((p) => !p.opened && (p.days_since_sent ?? 0) >= followupAfter)),
      read_but_unsigned: ids(sent.filter((p) => (p.opened || p.viewed_in_portal) && !p.signed_at)),
      exhausted_followups: ids(sent.filter((p) => p.followups_sent >= maxFollowups)),
      // A declined proposal is finished, so it is excluded here the same way a
      // signed one is. Every other bucket is built from `sent`, and a decline
      // moves the row off 'sent', so they drop out on their own.
      stale: ids(inFlight.filter(
        (p) => (p.days_since_activity ?? 0) >= staleAfter && !p.signed_at && !p.declined_at,
      )),
      drafts_not_sent: ids(inFlight.filter((p) => p.status === "draft")),
      declined: ids(inFlight.filter((p) => !!p.declined_at || p.status === "declined")),
    },
    project_types: ["automation_build", "site_preview", "app_development", "web_development", "marketing"],
    thresholds: {
      followup_after_days: followupAfter,
      max_followups: maxFollowups,
      stale_after_days: staleAfter,
      proposal_meeting_link: (cfg.proposal_meeting_link as string) || null,
    },
  };
}

/**
 * The read half of the social media manager.
 *
 * Scoped to marketing projects, because that is the only project type with
 * anywhere to post to. Everything is precomputed here rather than left for the
 * model to work out: which client is autonomous, how many days of photos are
 * left, what is already booked. A model asked to divide photos by a posting
 * rate will sometimes get it wrong, and a wrong runway figure in an email to a
 * client is worse than none.
 */
export async function socialContext(sb: SupabaseClient, cfg: Record<string, unknown>) {
  const postsPerWeek = Number(cfg.posts_per_week ?? 5);
  const preferredHours = (cfg.preferred_hours_utc ?? [14, 17, 21]) as number[];
  const minGapHours = Number(cfg.min_gap_hours ?? 6);
  const horizonDays = Number(cfg.horizon_days ?? 14);
  const lookbackDays = Number(cfg.lookback_days ?? 14);

  const { data: projects } = await sb.from("client_projects")
    .select("id, client_id, name, business_name, agent_autonomy, status")
    .eq("type", "marketing").eq("status", "active");

  const projectIds = (projects ?? []).map((p) => p.id);
  if (!projectIds.length) {
    return {
      cadence: cadenceFor(new Date()),
      projects: [],
      note: "No active marketing projects. Nothing to post.",
      thresholds: { postsPerWeek, preferredHours, minGapHours, horizonDays },
    };
  }

  const since = iso(lookbackDays * DAY);
  const [clientsRes, secretsRes, imagesRes, postsRes, scheduledRes, followersRes, nudgeRes] =
    await Promise.all([
    sb.from("clients")
      .select("id, contact_name, contact_email, business_name, brand_voice_quick_ref, brand_voice_doc, brand_voice_content, brand_voice_approved")
      .in("id", (projects ?? []).map((p) => p.client_id)),
    // Key only. The value is a credential and never leaves the function that
    // decrypts it — knowing whether one exists is all the agent needs.
    sb.from("project_secrets")
      .select("client_project_id, key").in("client_project_id", projectIds),
    sb.from("social_images")
      .select("id, client_project_id, caption, hashtags, caption_status, copost_status, created_at")
      .in("client_project_id", projectIds).order("created_at").limit(200),
    sb.from("social_posts")
      .select("id, client_project_id, format, status, caption, hashtags, published_at, error")
      .in("client_project_id", projectIds).order("created_at", { ascending: false }).limit(120),
    sb.from("social_schedule")
      .select("id, client_project_id, social_post_id, social_image_id, scheduled_at, status, attempts, last_error, sent_at")
      .in("client_project_id", projectIds)
      .or(`status.in.(pending,sending,failed),sent_at.gte.${since}`)
      .order("scheduled_at").limit(200),
    sb.from("social_follower_snapshots")
      .select("client_project_id, platform, follower_count, captured_at")
      .in("client_project_id", projectIds)
      .order("captured_at", { ascending: false }).limit(300),
    // How many times each client has already been chased. Counted from the
    // actions themselves rather than a column, so there is one record of it
    // and nothing to keep in step.
    sb.from("agent_actions")
      .select("kind, payload, created_at")
      .eq("kind", "request_client_setup")
      .order("created_at", { ascending: false }).limit(200),
  ]);

  // Promise.all resolves each query to its full PostgrestResponse — { data,
  // error, count } — not to the rows. Unwrapped once here rather than reaching
  // for .data at each of the eight use sites, because missing it at one of
  // them is exactly how this shipped broken the first time: `.map is not a
  // function`, at runtime, in front of someone asking a question.
  const clients = clientsRes.data ?? [];
  const secrets = secretsRes.data ?? [];
  const images = imagesRes.data ?? [];
  const posts = postsRes.data ?? [];
  const scheduled = scheduledRes.data ?? [];
  const followers = followersRes.data ?? [];
  const nudges = nudgeRes.data ?? [];

  // How many times each client has been chased, and how long ago the last one
  // was. Both matter: the count is the ceiling, and the gap is what stops
  // three reminders going out on three consecutive weekdays. She runs every
  // weekday, so without the gap "three attempts" means "three days".
  const nudgeCount: Record<string, number> = {};
  const lastNudge: Record<string, string> = {};
  for (const n of nudges) {
    const pid = String((n.payload as Record<string, unknown> | null)?.client_project_id ?? "");
    if (!pid) continue;
    nudgeCount[pid] = (nudgeCount[pid] ?? 0) + 1;
    // Ordered newest first by the query, so the first one seen wins.
    if (!lastNudge[pid]) lastNudge[pid] = String(n.created_at);
  }

  const MIN_DAYS_BETWEEN_NUDGES = Number(cfg.days_between_nudges ?? 3);
  const MAX_NUDGES = Number(cfg.max_nudges ?? 3);
  const daysSince = (iso?: string) =>
    iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity;

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const configured = new Set(
    secrets.filter((s) => s.key === "copost_endpoint_url")
      .map((s) => s.client_project_id),
  );

  const autonomyByProject: Record<string, string> = {};
  for (const p of projects ?? []) {
    if (p.agent_autonomy) autonomyByProject[p.id] = p.agent_autonomy;
  }

  const liveSchedule = scheduled.filter((s) =>
    s.status === "pending" || s.status === "sending"
  );
  const bookedIds = new Set(
    liveSchedule.flatMap((s) => [s.social_image_id, s.social_post_id].filter(Boolean)),
  );

  const perProject = (projects ?? []).map((p) => {
    const client = clientById.get(p.client_id);
    const myImages = images.filter((i) => i.client_project_id === p.id);
    const myPosts = posts.filter((x) => x.client_project_id === p.id);

    // Unposted means: never sent, and not already booked. A photo waiting in
    // the calendar is not runway you can spend twice.
    const unposted = myImages.filter((i) =>
      i.copost_status !== "sent" && !bookedIds.has(i.id)
    );
    const needCaption = [
      ...myImages.filter((i) => !i.caption?.trim() && i.copost_status !== "sent")
        .map((i) => ({ target: "image", id: i.id })),
      ...myPosts.filter((x) => !x.caption?.trim() && x.status === "draft")
        .map((x) => ({ target: "post", id: x.id })),
    ];
    const readyToSchedule = [
      ...unposted.filter((i) => i.caption?.trim())
        .map((i) => ({ target: "image", id: i.id, caption: (i.caption ?? "").slice(0, 90) })),
      ...myPosts.filter((x) => x.caption?.trim() && x.status === "draft" && !bookedIds.has(x.id))
        .map((x) => ({ target: "post", id: x.id, caption: (x.caption ?? "").slice(0, 90) })),
    ];

    const r = runway(unposted.length, postsPerWeek);
    const mySnapshots = followers.filter((f) => f.client_project_id === p.id);

    return {
      client_project_id: p.id,
      client_id: p.client_id,
      client: client?.business_name ?? client?.contact_name ?? p.name,
      contact_email: client?.contact_email ?? null,
      copost_configured: configured.has(p.id),
      // Where this client is in setting up. `blocked` means nothing can post
      // no matter how many photos arrive, because there is nowhere to send to.
      onboarding: {
        copost_ready: configured.has(p.id),
        has_photos: myImages.length > 0,
        blocked: !configured.has(p.id),
        times_chased: nudgeCount[p.id] ?? 0,
        last_chased_days_ago: Math.floor(daysSince(lastNudge[p.id])),
        // Three is the ceiling, and three days is the gap. Past the ceiling an
        // email is not working and the problem needs a person, not another
        // reminder; inside the gap she has already asked this week.
        may_chase: (nudgeCount[p.id] ?? 0) < MAX_NUDGES &&
          daysSince(lastNudge[p.id]) >= MIN_DAYS_BETWEEN_NUDGES,
        chase_exhausted: (nudgeCount[p.id] ?? 0) >= MAX_NUDGES,
      },
      autonomy: p.agent_autonomy ?? "inherit",
      posts_unattended: p.agent_autonomy === "autonomous",
      // Three columns, because they disagree. generate-brand-voice writes
      // brand_voice_doc and brand_voice_quick_ref; brand_voice_content exists
      // but only crm-api ever sets it. Reading only the last one meant Iris
      // saw no voice for any client and wrote generically without anything
      // saying so. Quick ref first: it is the condensed card, which is what a
      // caption needs, and the full doc is mostly rationale.
      brand_voice: client?.brand_voice_approved
        ? (client.brand_voice_quick_ref ?? client.brand_voice_doc ?? client.brand_voice_content ?? null)
        : null,
      photos_unposted: unposted.length,
      runway_days: r.days === Infinity ? null : r.days,
      runway: r.severity,
      needs_a_caption: needCaption.slice(0, 20),
      ready_to_schedule: readyToSchedule.slice(0, 20),
      booked: liveSchedule.filter((s) => s.client_project_id === p.id)
        .map((s) => ({
          schedule_id: s.id,
          target: s.social_image_id ? "image" : "post",
          scheduled_at: s.scheduled_at,
        })),
      followers: summariseFollowers(mySnapshots),
    };
  });

  const stillFailing = scheduled
    .filter((s) => s.status === "failed")
    .map((s) => {
      const p = perProject.find((x) => x.client_project_id === s.client_project_id);
      return {
        schedule_id: s.id,
        client: p?.client ?? s.client_project_id,
        target: s.social_image_id ? "image" : "post",
        attempts: s.attempts,
        last_error: s.last_error,
        // Whose problem it is. An expired token is the client's to fix and no
        // amount of retrying or task-opening moves it.
        client_must_reconnect: isAuthFailure(String(s.last_error ?? "")),
      };
    });

  return {
    cadence: cadenceFor(new Date()),
    projects: perProject,
    autonomy_by_project: autonomyByProject,
    still_failing: stillFailing,
    published_recently: scheduled.filter((s) => s.status === "sent").length,
    thresholds: { postsPerWeek, preferredHours, minGapHours, horizonDays, lookbackDays },
  };
}

/** Latest count per platform, with the change since the first reading. */
function summariseFollowers(
  rows: { platform: string; follower_count: number; captured_at: string }[],
) {
  const byPlatform = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byPlatform.get(r.platform) ?? [];
    list.push(r);
    byPlatform.set(r.platform, list);
  }
  return [...byPlatform.entries()].map(([platform, list]) => {
    // Ordered newest first by the query.
    const latest = list[0];
    const baseline = list[list.length - 1];
    return {
      platform,
      followers: latest.follower_count,
      change_since: baseline.captured_at,
      change: latest.follower_count - baseline.follower_count,
    };
  });
}

/**
 * Per-project autonomy overrides, keyed by client_project_id.
 *
 * Only projects that actually set one, so the map stays a handful of rows and
 * a missing key means "inherit" rather than "look it up again". Fed into the
 * action tool's context, where it decides whether one client's post goes out
 * unattended.
 */
export async function projectAutonomyMap(
  sb: SupabaseClient,
): Promise<Record<string, string>> {
  const { data } = await sb.from("client_projects")
    .select("id, agent_autonomy").not("agent_autonomy", "is", null);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.agent_autonomy) map[row.id] = row.agent_autonomy;
  }
  return map;
}
