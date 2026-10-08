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

export interface Brief {
  id: string; period: string; title: string; sections: BriefSection[];
  calendar_events?: CalendarEvent[] | null;
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
