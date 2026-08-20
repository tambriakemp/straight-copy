// Context gatherers — the read half of each agent.
//
// Each returns a compact JSON snapshot that goes into the prompt. Deliberately
// small: an agent that reads 400 rows costs more and reasons worse than one
// reading the 20 that matter. Money always comes from revenue_ledger_v so an
// agent and the dashboard can never disagree about a number.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

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
    sb.from("client_proposals").select("id, title, client_id, created_at").eq("status", "sent")
      .lt("created_at", iso(proposalStaleDays * DAY)).limit(25),
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
    stale_proposals: (proposals.data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      client: cName[p.client_id] ?? null,
      client_id: p.client_id,
      days_waiting: daysPast(p.created_at),
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
      description: (t.description ?? "").slice(0, 1500),
      description_length: (t.description ?? "").length,
      acceptance_criteria: t.acceptance_criteria ?? [],
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
      description: (t.description ?? "").slice(0, 800),
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
