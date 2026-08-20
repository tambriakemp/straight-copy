// Subscribing to an agent's progress steps.
//
// Its own file so AgentSteps.tsx exports a component and nothing else — a
// module that mixes the two breaks fast refresh for the whole file.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentStep } from "./AgentSteps";

export function useAgentSteps(messageIds: string[]) {
  const [steps, setSteps] = useState<Record<string, AgentStep[]>>({});
  const key = messageIds.join(",");

  useEffect(() => {
    if (!messageIds.length) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("agent_message_steps")
        .select("id, message_id, seq, kind, tool_name, label, status")
        .in("message_id", messageIds)
        .order("seq");
      if (cancelled) return;
      const grouped: Record<string, AgentStep[]> = {};
      for (const row of (data ?? []) as AgentStep[]) {
        (grouped[row.message_id] ??= []).push(row);
      }
      setSteps(grouped);
    };
    void load();

    // Steps are INSERTed then UPDATEd once, so both events matter. Reloading
    // the whole short list is simpler than merging deltas and costs nothing at
    // this size.
    const channel = supabase
      .channel(`agent-steps-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_message_steps" },
        (payload) => {
          const row = payload.new as Partial<AgentStep> | null;
          if (row?.message_id && messageIds.includes(row.message_id)) void load();
        },
      )
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return steps;
}
