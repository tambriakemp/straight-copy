import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// `briefs` isn't in the generated Database type yet — see the same note on
// `db` in Briefs.tsx / CLAUDE.md ("New columns are not in types.ts until it
// is regenerated").
const db = supabase as unknown as { from: (table: string) => any };

// `id` and `issue` are optional (CRE-335): a stable cross-brief item id and,
// when the line names one, the bare Paperclip identifier ("CRE-335") it's
// about. Older rows and anything the ingest routine hasn't updated yet will
// simply have neither — callers fall back to a brief-scoped key, see
// Today.tsx / Briefs.tsx's `briefItemId` helper.
export interface BriefItem { id?: string; issue?: string | null; text: string; link: string | null }
export interface BriefSection { heading: string; items: BriefItem[] }

// CRE-358: the weekly calendar card. Optional and separate from `sections`
// — a brief that doesn't send this field falls back to the old markdown
// "Calendar" section (see Today.tsx's `BriefSections`). Dates/times are
// America/Chicago, matching the rest of the brief.
export type CalendarEventType = "rental" | "business" | "live" | "home";
export type CalendarEventStatus = "confirmed" | "canceled" | "tentative";
export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // inclusive; omitted/equal to start_date = single day
  start_time?: string | null; // "HH:MM", 24h
  end_time?: string | null; // "HH:MM", 24h
  time_label?: string | null; // free-text override, e.g. "Usual time"
  status: CalendarEventStatus;
  note?: string | null;
}

// CRE-366: Money / Pipeline / Done / Approvals redesign. Four more optional
// siblings to `sections`, same contract as `calendar_events` above — absent
// or empty falls back to the old markdown section (see Today.tsx's
// `hiddenHeadingSets`), present renders the matching card instead. Pipeline
// stage pills are never part of this payload; they're read live from
// pipeline-board (CRE-332) by PipelineBriefCard itself. `pipeline` here only
// carries the outreach-round banner and hot-leads list.
export type MoneyTrend = "up" | "down" | "flat" | "new";
export interface MoneyStatCard {
  id: string;
  label: string;
  value_cents?: number | null;
  display: string;
  trend?: MoneyTrend;
  trend_label?: string;
  lines?: string[];
}
export interface MoneyStats {
  range_label?: string;
  source_label?: string;
  cards: MoneyStatCard[];
  note?: string | null;
}

export interface OutreachRound {
  date?: string;
  pending: number;
  cutoff?: string | null;
  link?: string | null;
  note?: string | null;
}
export interface HotLead {
  id: string;
  name: string;
  status: string;
  stage?: string | null;
  at?: string | null;
  task_id?: string | null;
}
export interface BriefPipeline {
  outreach_round?: OutreachRound | null;
  hot_leads?: HotLead[];
}

export interface DoneItem {
  id: string;
  title: string;
  project: string;
  note?: string;
  task_ids?: string[];
  done_at?: string;
}
export interface DoneRange {
  since?: string;
  until?: string;
}

export interface ApprovalCard {
  id: string;
  title: string;
  context?: string;
  project: string;
  task_ids?: string[];
  waiting_since?: string;
  deadline?: string | null;
  options?: string[];
  link?: string | null;
}

// CRE-388: the brief's own markdown "Needs You" section is retired — these
// rows merge into the Today page's live "Needs you now" panel instead (see
// src/lib/needsYouRows.ts), sitting alongside the plain Paperclip pending
// cards that panel already showed. `priority` drives the row's status dot
// (orange for "high", yellow for "normal") the same way `status` drives
// InFlightItem's icon below.
export type NeedsYouPriority = "high" | "normal";
export interface NeedsYouNarrativeItem {
  id: string;
  title: string;
  body?: string | null;
  next_step?: string | null;
  priority?: NeedsYouPriority;
  category: string;
  task_ids?: string[];
}

// CRE-388: "In flight / stuck" — a new card, same optional/fallback
// contract as the CRE-366 fields (present and non-empty renders the card
// and hides the matching markdown section; absent falls back to markdown).
export type InFlightStatus = "stuck" | "blocked" | "in_progress";
export interface InFlightItem {
  id: string;
  title: string;
  body?: string | null;
  status: InFlightStatus;
  category: string;
  task_ids?: string[];
}

export interface Brief {
  id: string; period: string; title: string; sections: BriefSection[];
  calendar_events?: CalendarEvent[] | null;
  money_stats?: MoneyStats | null;
  pipeline?: BriefPipeline | null;
  done_items?: DoneItem[] | null;
  done_range?: DoneRange | null;
  approvals?: ApprovalCard[] | null;
  needs_you?: NeedsYouNarrativeItem[] | null;
  in_flight?: InFlightItem[] | null;
  created_at: string; delivered_to_chat: boolean;
}

/**
 * Shared brief history + selection, used by both the legacy Briefs page and
 * the new Today page (CRE-332 Phase 2) so they read the same data instead of
 * two copies drifting apart.
 */
export function useBriefs() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    db.from("briefs").select("*").order("created_at", { ascending: false }).limit(30)
      .then(({ data, error }: { data: Brief[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        const rows = data ?? [];
        setBriefs(rows);
        if (rows.length && !selected) setSelected(rows[0].id);
      });
  }, [reloadKey]);

  const current = useMemo(() => briefs?.find((b) => b.id === selected) ?? briefs?.[0] ?? null, [briefs, selected]);
  const latestMorning = useMemo(() => briefs?.find((b) => b.period === "morning") ?? null, [briefs]);

  return { briefs, selected, setSelected, current, latestMorning, reload: () => setReloadKey((k) => k + 1) };
}
