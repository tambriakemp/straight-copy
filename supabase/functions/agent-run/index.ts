// Executes one agent run.
//
// Shape of a run:
//   1. Load the agent + its registry definition.
//   2. Gather a compact snapshot of the data it is responsible for.
//   3. Ask Claude for findings + proposed actions (forced tool call).
//   4. Write every proposed action to agent_actions.
//   5. Auto-execute only the ones this agent's autonomy allows.
//   6. Deliver to the configured channels.
//
// Nothing happens to the world before step 4, so a crashed run leaves an
// auditable record rather than half-applied side effects.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { definitionFor, systemPromptFor } from "../_shared/agents/registry.ts";
import { runAgentModel } from "../_shared/agents/claude.ts";
import { loadRules, renderRules, type RulesClient } from "../_shared/agents/rules.ts";
import { clientDirectory, renderDirectory } from "../_shared/agents/clients.ts";
import { executeAndRecord, type ActionRow } from "../_shared/agents/actions.ts";
import { deliverRun } from "../_shared/agents/delivery.ts";
import { isDestructive } from "../_shared/agents/action-kinds.ts";
import { canAutoExecute, type AgentRow } from "../_shared/agents/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/**
 * Callable by the cron dispatcher (shared secret) or by an admin session.
 * Reuses CLAUDE_WEBHOOK_SECRET, which already exists for the admin-dashboard
 * claude-run hook, rather than introducing another secret to manage.
 */
async function authorize(req: Request, sb: ReturnType<typeof serviceClient>): Promise<true | Response> {
  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-agent-secret");
  if (secret && supplied && supplied === secret) return true;

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getUser(auth.slice(7));
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = serviceClient();
  const guard = await authorize(req, sb);
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => ({}));
  const agentId: string | undefined = body.agent_id;
  const agentKey: string | undefined = body.agent_key;
  const trigger: string = body.trigger === "manual" ? "manual" : "schedule";
  if (!agentId && !agentKey) return json({ error: "agent_id or agent_key required" }, 400);

  const q = sb.from("agents").select("*");
  const { data: agent } = await (agentId ? q.eq("id", agentId) : q.eq("key", agentKey!)).maybeSingle();
  if (!agent) return json({ error: "Agent not found" }, 404);
  if (!agent.enabled && trigger === "schedule") {
    return json({ ok: true, skipped: "agent disabled" });
  }

  const def = definitionFor(agent as AgentRow);
  if (!def) return json({ error: `No registry definition for "${agent.key}"` }, 500);

  // Open the run immediately so a crash mid-flight is still visible.
  const { data: run, error: runErr } = await sb.from("agent_runs").insert({
    agent_id: agent.id, status: "running", trigger,
  }).select("id").single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Could not open run" }, 500);

  try {
    const [context, rules, directory] = await Promise.all([
      def.gather(sb, agent.config ?? {}),
      loadRules(sb as unknown as RulesClient, agent.id),
      clientDirectory(sb as unknown as RulesClient),
    ]);
    const { finding, usage } = await runAgentModel({
      systemPrompt: systemPromptFor(agent as AgentRow, def),
      contextJson: context,
      rulesBlock: renderRules(rules),
      directoryBlock: renderDirectory(directory),
      model: agent.model,
      effort: agent.effort,
      allowedActions: def.allowedActions,
    });

    // Persist every proposed action before executing any of them.
    let pendingApprovals = 0;
    const executed: Array<{ id: string; ok: boolean; error?: string }> = [];

    if (finding.actions.length) {
      const auto = finding.actions.map((a) =>
        canAutoExecute(agent.autonomy, a.outward, isDestructive(a.kind)),
      );
      const { data: rows, error: actErr } = await sb.from("agent_actions").insert(
        finding.actions.map((a, i) => ({
          run_id: run.id,
          agent_id: agent.id,
          kind: a.kind,
          outward: a.outward,
          title: a.title,
          description: a.description ?? null,
          payload: a.payload,
          // 'approved' marks it as cleared to run; executeAndRecord moves it on.
          status: auto[i] ? "approved" : "proposed",
        })),
      ).select("*");
      if (actErr) throw new Error(`Could not record actions: ${actErr.message}`);

      for (const row of rows ?? []) {
        if (row.status !== "approved") { pendingApprovals++; continue; }
        const outcome = await executeAndRecord(sb, row as ActionRow, agent.name);
        executed.push({ id: row.id, ok: outcome.ok, error: outcome.error });
      }
    }

    await sb.from("agent_runs").update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      headline: finding.headline,
      summary: finding.summary,
      detail: finding.detail,
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_read_tokens: usage.cacheRead,
    }).eq("id", run.id);

    const delivery = await deliverRun(sb, agent as AgentRow, run.id, finding, pendingApprovals);

    await sb.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);

    return json({
      ok: true,
      run_id: run.id,
      headline: finding.headline,
      actions: { total: finding.actions.length, executed: executed.length, pending: pendingApprovals },
      delivery,
      usage,
    });
  } catch (e) {
    const message = String((e as Error).message || e);
    console.error("agent-run failed", agent.key, message);
    await sb.from("agent_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: message,
    }).eq("id", run.id);
    return json({ error: message, run_id: run.id }, 500);
  }
});
