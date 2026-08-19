// Cron target: find agents whose schedule is due and fire each one.
//
// Called by pg_cron every 15 minutes via pg_net (same pattern as the email
// dispatcher). Cron matching is done here in TS rather than SQL so the schedule
// stays a plain 5-field string on the agents row that the UI can edit.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { isDue, nextRunAfter } from "../_shared/agents/schedule.ts";

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
    .select("id, key, schedule_cron, last_run_at")
    .eq("enabled", true).not("schedule_cron", "is", null);
  if (error) return json({ error: error.message }, 500);

  const now = new Date();
  const due = (agents ?? []).filter((a) => isDue(a.schedule_cron!, a.last_run_at, now));
  if (!due.length) return json({ ok: true, checked: agents?.length ?? 0, fired: 0 });

  const base = Deno.env.get("SUPABASE_URL")!;
  const fired = await Promise.all(due.map(async (a) => {
    try {
      const res = await fetch(`${base}/functions/v1/agent-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-secret": secret },
        body: JSON.stringify({ agent_id: a.id, trigger: "schedule" }),
      });
      await sb.from("agents")
        .update({ next_run_at: nextRunAfter(a.schedule_cron!, now)?.toISOString() ?? null })
        .eq("id", a.id);
      return { key: a.key, ok: res.ok, status: res.status };
    } catch (e) {
      return { key: a.key, ok: false, error: String((e as Error).message || e) };
    }
  }));

  return json({ ok: true, checked: agents?.length ?? 0, fired: fired.length, results: fired });
});
