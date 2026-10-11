import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// `decide_snoozes` isn't in the generated Database type yet — same cast as
// the other CRE-235/CRE-332/CRE-391 tables (see CLAUDE.md).
const db = supabase as unknown as { from: (table: string) => any };

export type SnoozeUntil = "tomorrow" | "monday";

function snoozeTimestamp(until: SnoozeUntil): string {
  const now = new Date();
  if (until === "tomorrow") {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  }
  // "monday": next Monday 8am, same "Monday" Bree already uses elsewhere
  // for outreach scheduling — if today IS Monday, that means next week's,
  // not later today.
  const day = now.getDay(); // 0 = Sunday
  const daysUntilMonday = ((1 - day + 7) % 7) || 7;
  now.setDate(now.getDate() + daysUntilMonday);
  now.setHours(8, 0, 0, 0);
  return now.toISOString();
}

/**
 * Decide-card actions (CRE-393 §B): snooze is a direct browser write (no
 * side effect beyond hiding the row, same as app_secrets); pick/ask relay
 * through the decide-action edge function, which in turn relays to Ara —
 * see that function's own header comment for why.
 */
export function useDecideActions() {
  const [snoozed, setSnoozed] = useState<Record<string, string> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    db.from("decide_snoozes").select("id, snoozed_until")
      .then(({ data, error }: { data: { id: string; snoozed_until: string }[] | null; error: { message: string } | null }) => {
        if (error) { toast.error(error.message); return; }
        const now = Date.now();
        setSnoozed(Object.fromEntries((data ?? [])
          .filter((r) => new Date(r.snoozed_until).getTime() > now)
          .map((r) => [r.id, r.snoozed_until])));
      });
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const isSnoozed = (id: string) => Boolean(snoozed?.[id]);

  const snooze = async (id: string, until: SnoozeUntil) => {
    const { error } = await db.from("decide_snoozes").upsert({ id, snoozed_until: snoozeTimestamp(until) });
    if (error) { toast.error(error.message); return false; }
    toast.success(until === "monday" ? "Snoozed until Monday" : "Snoozed until tomorrow");
    reload();
    return true;
  };

  const unsnooze = async (id: string) => {
    const { error } = await db.from("decide_snoozes").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    reload();
    return true;
  };

  interface PickArgs {
    row_id: string; title: string; task_ids: string[]; option: string;
    action_type?: string | null;
    repo?: string | null; pr_number?: number | null; branch?: string | null; base_branch?: string | null;
    confirmed?: boolean;
  }

  const pick = async (args: PickArgs) => {
    const { data, error } = await supabase.functions.invoke("decide-action", {
      body: { action: "pick", ...args },
    });
    if (error) {
      toast.error(error.message ?? "Could not record that choice");
      return { ok: false as const };
    }
    if (data?.needsConfirm) return { ok: false as const, needsConfirm: true, summary: data.summary };
    if (data?.error) {
      toast.error(data.error);
      return { ok: false as const };
    }
    if (Array.isArray(data?.warnings) && data.warnings.length) {
      console.warn("decide-action warnings:", data.warnings);
      toast.warning("Recorded, but a follow-up step didn't go through — see console for details.");
    }
    return { ok: true as const, result: data?.result };
  };

  const ask = async (args: { row_id: string; title: string; task_ids: string[]; question: string }) => {
    const { data, error } = await supabase.functions.invoke("decide-action", {
      body: { action: "ask", ...args },
    });
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Could not send that question");
      return false;
    }
    toast.success("Question sent");
    return true;
  };

  return { isSnoozed, snooze, unsnooze, pick, ask, reload };
}
