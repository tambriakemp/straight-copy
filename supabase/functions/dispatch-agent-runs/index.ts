// Cron target: find agents whose schedule is due and fire each one.
//
// Called by pg_cron every 15 minutes via pg_net (same pattern as the email
// dispatcher). Cron matching is done here in TS rather than SQL so the schedule
// stays a plain 5-field string on the agents row that the UI can edit.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { isDue, nextRunAfter } from "../_shared/agents/schedule.ts";
import {
  dispatchAccepted,
  dispatchRequest,
  externalDispatchConfig,
  runsExternally,
} from "../_shared/agents/dispatch-target.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-agent-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: agents, error } = await sb.from("agents")
    .select("id, key, schedule_cron, last_run_at, run_via")
    .eq("enabled", true).not("schedule_cron", "is", null);
  if (error) return json({ error: error.message }, 500);

  const now = new Date();
  const due = (agents ?? []).filter((a) => isDue(a.schedule_cron!, a.last_run_at, now));
  if (!due.length) return json({ ok: true, checked: agents?.length ?? 0, fired: 0 });

  const base = Deno.env.get("SUPABASE_URL")!;
  // Absent secrets mean no agent can run externally; every one falls back to the
  // edge path it used before run_via existed.
  const external = externalDispatchConfig(Deno.env);

  const fired = await Promise.all(due.map(async (a) => {
    const schedule = { next_run_at: nextRunAfter(a.schedule_cron!, now)?.toISOString() ?? null };

    if (external && runsExternally(a)) {
      try {
        const req = dispatchRequest({
          config: external,
          agent: a,
          reason: `Scheduled run for ${a.key} (${a.schedule_cron}).`,
        });
        const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });

        // last_run_at is written HERE, not by the worker. agent-run stamps it on
        // the edge path, but a dispatched run stamps nothing until Claude Code
        // gets there — and isDue() reads last_run_at, so leaving it alone would
        // refire this agent on every 15-minute tick until the worker finished.
        // Same class of bug as the tool-loop refire, in a new place.
        await sb.from("agents")
          .update({ ...schedule, last_run_at: now.toISOString() })
          .eq("id", a.id);

        // 204 only means GitHub accepted the event. It says nothing about a
        // workflow existing to receive it, so this reports the status rather
        // than claiming the agent ran.
        return {
          key: a.key,
          via: "github_actions",
          ok: dispatchAccepted(res.status),
          status: res.status,
        };
      } catch (e) {
        return {
          key: a.key,
          via: "github_actions",
          ok: false,
          error: String((e as Error).message || e),
        };
      }
    }

    try {
      const res = await fetch(`${base}/functions/v1/agent-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-secret": secret },
        body: JSON.stringify({ agent_id: a.id, trigger: "schedule" }),
      });
      await sb.from("agents").update(schedule).eq("id", a.id);
      return { key: a.key, via: "edge", ok: res.ok, status: res.status };
    } catch (e) {
      return { key: a.key, via: "edge", ok: false, error: String((e as Error).message || e) };
    }
  }));

  return json({ ok: true, checked: agents?.length ?? 0, fired: fired.length, results: fired });
});
