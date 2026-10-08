import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// `briefs` isn't in the generated Database type yet — see the same note on
// `db` in Briefs.tsx / CLAUDE.md ("New columns are not in types.ts until it
// is regenerated").
const db = supabase as unknown as { from: (table: string) => any };

export interface BriefItem { text: string; link: string | null }
export interface BriefSection { heading: string; items: BriefItem[] }
export interface Brief {
  id: string; period: string; title: string; sections: BriefSection[];
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
