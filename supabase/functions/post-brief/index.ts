// Ingest endpoint for Ara's twice-daily brief routine (CRE-235). Auth is a
// shared secret, same shape as dispatch-social-schedule's x-agent-secret, but
// the expected value lives in app_secrets.briefs_ingest_secret — a row the
// Briefs tab's Settings card lets Bree generate/show/rotate herself, rather
// than a Supabase Function env var nobody but Lovable can set.
//
// external_id dedupes retried POSTs: an existing id returns the existing row
// (200) instead of inserting a duplicate.
//
// CRE-335: each item in a section's `items` array may also carry a stable
// `id` and, when the line refers to a Paperclip issue, an `issue` field
// (the bare "CRE-###" identifier). Neither is required or validated below —
// `sections` is stored as-is — but the brief routine should start sending
// both:
//   - `id`: the bare Paperclip identifier ("CRE-335") when the item is
//     about one; otherwise a stable key already in the routine's own
//     source data (e.g. "invoice:INV-1234", "prospect-batch:2026-10-12");
//     otherwise a content hash of only the parts of the line that don't
//     change run to run (not the full rendered sentence — a live count or
//     date in the text would change the hash every time and the item would
//     never be recognized as "already checked off").
//   - `issue`: the bare identifier, separately from `id`, whenever the line
//     names a Paperclip issue — this is what lets a checked item also post
//     a "marked done from the brief" comment back on that issue.
// See the `action: "completed"` branch below for how the routine should
// use these ids to skip already-checked-off items on the next brief.
//
// CRE-358: an optional `calendar_events` array, sibling to `sections`,
// drives the Today page's weekly calendar card instead of a markdown
// "Calendar" section. Omit the field (or send it as `null`/absent) to keep
// the old checkbox-list rendering — the frontend falls back automatically.
// Every date/time is America/Chicago, same as the rest of the brief.
//
// CRE-366: four more optional siblings — `money_stats`, `pipeline`,
// `done_items`/`done_range`, `approvals` — each drives one redesigned brief
// card the same way: present and non-empty renders the card and hides the
// matching markdown section, absent falls back to markdown exactly as
// before. `pipeline` only carries the outreach-round banner and hot-leads
// list; stage pills are read live from pipeline-board on the frontend, so
// there is nothing stage-shaped to validate here. Validation below is
// loose on purpose (checks shape, not business meaning) — same spirit as
// `validateCalendarEvents`.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface BriefSection {
  heading: string;
  items: { id?: string; issue?: string | null; text: string; link: string | null }[];
}

const CALENDAR_EVENT_TYPES = ["rental", "business", "live", "home"];
const CALENDAR_EVENT_STATUSES = ["confirmed", "canceled", "tentative"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  time_label?: string | null;
  status: string;
  note?: string | null;
}

function validateCalendarEvents(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return "calendar_events must be an array or null";
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return "each calendar_events entry must be an object";
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id.trim()) return "every calendar_events entry needs a non-empty id";
    if (typeof e.title !== "string" || !e.title.trim()) return "every calendar_events entry needs a non-empty title";
    if (typeof e.type !== "string" || !CALENDAR_EVENT_TYPES.includes(e.type)) {
      return `calendar_events entry.type must be one of ${CALENDAR_EVENT_TYPES.join(", ")}`;
    }
    if (typeof e.status !== "string" || !CALENDAR_EVENT_STATUSES.includes(e.status)) {
      return `calendar_events entry.status must be one of ${CALENDAR_EVENT_STATUSES.join(", ")}`;
    }
    if (typeof e.start_date !== "string" || !DATE_RE.test(e.start_date)) {
      return "calendar_events entry.start_date must be a YYYY-MM-DD string";
    }
    if (e.end_date !== undefined && e.end_date !== null && (typeof e.end_date !== "string" || !DATE_RE.test(e.end_date))) {
      return "calendar_events entry.end_date must be a YYYY-MM-DD string or null";
    }
    if (e.start_time !== undefined && e.start_time !== null && (typeof e.start_time !== "string" || !TIME_RE.test(e.start_time))) {
      return "calendar_events entry.start_time must be an HH:MM string or null";
    }
    if (e.end_time !== undefined && e.end_time !== null && (typeof e.end_time !== "string" || !TIME_RE.test(e.end_time))) {
      return "calendar_events entry.end_time must be an HH:MM string or null";
    }
    if (e.time_label !== undefined && e.time_label !== null && typeof e.time_label !== "string") {
      return "calendar_events entry.time_label must be a string or null";
    }
    if (e.note !== undefined && e.note !== null && typeof e.note !== "string") {
      return "calendar_events entry.note must be a string or null";
    }
  }
  return null;
}

const MONEY_TRENDS = ["up", "down", "flat", "new"];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isStringOrNull(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
}

function validateMoneyStats(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") return "money_stats must be an object or null";
  const m = value as Record<string, unknown>;
  if (!Array.isArray(m.cards)) return "money_stats.cards must be an array";
  for (const c of m.cards) {
    if (!c || typeof c !== "object") return "each money_stats.cards entry must be an object";
    const card = c as Record<string, unknown>;
    if (!isNonEmptyString(card.id)) return "every money_stats.cards entry needs a non-empty id";
    if (!isNonEmptyString(card.label)) return "every money_stats.cards entry needs a non-empty label";
    if (!isNonEmptyString(card.display)) return "every money_stats.cards entry needs a non-empty display";
    if (card.trend !== undefined && !MONEY_TRENDS.includes(card.trend as string)) {
      return `money_stats.cards entry.trend must be one of ${MONEY_TRENDS.join(", ")}`;
    }
    if (card.lines !== undefined && !isStringArray(card.lines)) return "money_stats.cards entry.lines must be an array of strings";
  }
  return null;
}

function validatePipeline(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") return "pipeline must be an object or null";
  const p = value as Record<string, unknown>;
  if (p.outreach_round !== undefined && p.outreach_round !== null) {
    if (typeof p.outreach_round !== "object") return "pipeline.outreach_round must be an object or null";
    const r = p.outreach_round as Record<string, unknown>;
    if (typeof r.pending !== "number") return "pipeline.outreach_round.pending must be a number";
  }
  if (p.hot_leads !== undefined) {
    if (!Array.isArray(p.hot_leads)) return "pipeline.hot_leads must be an array";
    for (const l of p.hot_leads) {
      if (!l || typeof l !== "object") return "each pipeline.hot_leads entry must be an object";
      const lead = l as Record<string, unknown>;
      if (!isNonEmptyString(lead.id)) return "every pipeline.hot_leads entry needs a non-empty id";
      if (!isNonEmptyString(lead.name)) return "every pipeline.hot_leads entry needs a non-empty name";
      if (!isNonEmptyString(lead.status)) return "every pipeline.hot_leads entry needs a non-empty status";
    }
  }
  return null;
}

function validateDoneItems(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return "done_items must be an array or null";
  for (const i of value) {
    if (!i || typeof i !== "object") return "each done_items entry must be an object";
    const item = i as Record<string, unknown>;
    if (!isNonEmptyString(item.id)) return "every done_items entry needs a non-empty id";
    if (!isNonEmptyString(item.title)) return "every done_items entry needs a non-empty title";
    if (!isNonEmptyString(item.project)) return "every done_items entry needs a non-empty project";
    if (item.task_ids !== undefined && !isStringArray(item.task_ids)) return "done_items entry.task_ids must be an array of strings";
  }
  return null;
}

function validateApprovals(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return "approvals must be an array or null";
  for (const a of value) {
    if (!a || typeof a !== "object") return "each approvals entry must be an object";
    const appr = a as Record<string, unknown>;
    if (!isNonEmptyString(appr.id)) return "every approvals entry needs a non-empty id";
    if (!isNonEmptyString(appr.title)) return "every approvals entry needs a non-empty title";
    if (!isNonEmptyString(appr.project)) return "every approvals entry needs a non-empty project";
    if (appr.task_ids !== undefined && !isStringArray(appr.task_ids)) return "approvals entry.task_ids must be an array of strings";
    if (appr.options !== undefined && !isStringArray(appr.options)) return "approvals entry.options must be an array of strings";
    if (!isStringOrNull(appr.deadline)) return "approvals entry.deadline must be a string or null";
  }
  return null;
}

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (b.period !== "morning" && b.period !== "evening") {
    return "period must be 'morning' or 'evening'";
  }
  if (typeof b.title !== "string" || !b.title.trim()) {
    return "title must be a non-empty string";
  }
  if (!Array.isArray(b.sections) || !b.sections.length) {
    return "sections must be a non-empty array";
  }
  for (const section of b.sections as unknown[]) {
    if (!section || typeof section !== "object") return "each section must be an object";
    const s = section as Record<string, unknown>;
    if (typeof s.heading !== "string" || !s.heading.trim()) {
      return "every section needs a non-empty heading";
    }
    if (!Array.isArray(s.items)) return "every section needs an items array";
    for (const item of s.items as unknown[]) {
      if (!item || typeof item !== "object") return "each item must be an object";
      const i = item as Record<string, unknown>;
      if (typeof i.text !== "string" || !i.text.trim()) {
        return "every item needs a non-empty text";
      }
      if (i.link !== null && i.link !== undefined && typeof i.link !== "string") {
        return "item.link must be a string or null";
      }
      if (i.id !== undefined && i.id !== null && typeof i.id !== "string") {
        return "item.id must be a string or null";
      }
      if (i.issue !== undefined && i.issue !== null && typeof i.issue !== "string") {
        return "item.issue must be a string or null";
      }
    }
  }
  if (b.external_id !== undefined && b.external_id !== null && typeof b.external_id !== "string") {
    return "external_id must be a string";
  }
  const calendarProblem = validateCalendarEvents(b.calendar_events);
  if (calendarProblem) return calendarProblem;
  const moneyProblem = validateMoneyStats(b.money_stats);
  if (moneyProblem) return moneyProblem;
  const pipelineProblem = validatePipeline(b.pipeline);
  if (pipelineProblem) return pipelineProblem;
  const doneProblem = validateDoneItems(b.done_items);
  if (doneProblem) return doneProblem;
  const approvalsProblem = validateApprovals(b.approvals);
  if (approvalsProblem) return approvalsProblem;
  if (b.done_range !== undefined && b.done_range !== null && typeof b.done_range !== "object") {
    return "done_range must be an object or null";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = serviceClient();

  const { data: secretRow } = await sb
    .from("app_secrets")
    .select("value")
    .eq("key", "briefs_ingest_secret")
    .maybeSingle();
  const supplied = req.headers.get("x-agent-secret");
  if (!secretRow?.value || supplied !== secretRow.value) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }

  // CRE-335 §3: lets the brief routine fetch which stable item ids Bree has
  // already checked off, so the next brief can leave them out instead of
  // repeating something she already handled. Same secret, same caller as
  // the ingest path below — one credential, not two.
  const action = (body as Record<string, unknown> | null)?.action;
  if (action === "completed") {
    const { data, error } = await sb.from("brief_item_completions").select("item_id");
    if (error) return json({ error: error.message }, 500);
    return json({ item_ids: (data ?? []).map((r) => r.item_id as string) });
  }

  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  const b = body as {
    external_id?: string | null;
    period: "morning" | "evening";
    title: string;
    sections: BriefSection[];
    calendar_events?: CalendarEvent[] | null;
    money_stats?: unknown;
    pipeline?: unknown;
    done_items?: unknown;
    done_range?: unknown;
    approvals?: unknown;
  };

  // CRE-366: every new field is optional and nullable, same pattern as
  // calendar_events — a brief that never sends them stores null and the
  // frontend falls back to markdown exactly as it did before this landed.
  const newFields = {
    money_stats: b.money_stats ?? null,
    pipeline: b.pipeline ?? null,
    done_items: b.done_items ?? null,
    done_range: b.done_range ?? null,
    approvals: b.approvals ?? null,
  };

  if (b.external_id) {
    const { data: existing } = await sb
      .from("briefs")
      .select("id, created_at")
      .eq("external_id", b.external_id)
      .maybeSingle();
    if (existing) {
      // CRE-358: a same-day repost (e.g. to add calendar_events after the
      // first post) must land on the existing row, not silently no-op —
      // otherwise a retry can never update what it was retried to fix.
      // CRE-366: the new fields follow the same rule — a repost updates
      // them too, rather than only ever being set on the original insert.
      const { data: updated, error: updateError } = await sb
        .from("briefs")
        .update({
          title: b.title,
          sections: b.sections,
          calendar_events: b.calendar_events ?? null,
          ...newFields,
        })
        .eq("id", existing.id)
        .select("id, created_at")
        .single();
      if (updateError) return json({ error: updateError.message }, 500);
      return json({ id: updated.id, created_at: updated.created_at }, 200);
    }
  }

  const { data: inserted, error } = await sb
    .from("briefs")
    .insert({
      external_id: b.external_id ?? null,
      period: b.period,
      title: b.title,
      sections: b.sections,
      calendar_events: b.calendar_events ?? null,
      ...newFields,
    })
    .select("id, created_at")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ id: inserted.id, created_at: inserted.created_at }, 201);
});
