import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// `brief_item_completions` isn't in the generated Database type yet — same
// cast as the other CRE-235/CRE-332 tables (see CLAUDE.md, "New columns are
// not in types.ts until it is regenerated").
const db = supabase as unknown as { from: (table: string) => any };

export interface BriefItemCompletion {
  item_id: string;
  item_text: string;
  issue_identifier: string | null;
  brief_date: string | null;
  completed_at: string;
  note: string | null;
}

interface CompleteArgs {
  item_id: string;
  item_text: string;
  issue_identifier?: string | null;
  brief_date?: string | null;
  note?: string | null;
}

/**
 * One shared "is this item checked off" map for the Today page and
 * /admin/briefs (CRE-335) — Needs-you-now items and morning-brief items both
 * check off through the same complete-brief-item edge function, which
 * writes brief_item_completions on the service role, fires the Ara webhook,
 * and — when issue_identifier is set — comments on that Paperclip issue.
 * This hook only reads the resulting table and calls that function; it
 * never touches the source data (paperclip_pending_items, invoices, briefs)
 * directly, so checking an item here can't fake-resolve it.
 */
export function useBriefItemCompletions() {
  const [completions, setCompletions] = useState<Record<string, BriefItemCompletion> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    db.from("brief_item_completions").select("*")
      .then(({ data, error }: { data: BriefItemCompletion[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        setCompletions(Object.fromEntries((data ?? []).map((c) => [c.item_id, c])));
      });
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const complete = async (args: CompleteArgs) => {
    const { data, error } = await supabase.functions.invoke("complete-brief-item", {
      body: { action: "complete", ...args },
    });
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Could not check off that item");
      return false;
    }
    if (Array.isArray(data?.warnings) && data.warnings.length) {
      toast.warning(`Checked off, but: ${data.warnings.join("; ")}`);
    } else {
      toast.success("Checked off");
    }
    reload();
    return true;
  };

  const undo = async (item_id: string) => {
    const { data, error } = await supabase.functions.invoke("complete-brief-item", {
      body: { action: "undo", item_id },
    });
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Could not undo");
      return false;
    }
    reload();
    return true;
  };

  return {
    completions,
    isDone: (id: string) => Boolean(completions?.[id]),
    getCompletion: (id: string) => completions?.[id] ?? null,
    complete,
    undo,
    reload,
  };
}
