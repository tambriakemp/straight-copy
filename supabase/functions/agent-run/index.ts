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
import { runToolLoop } from "../_shared/agents/loop.ts";
import { resolveTurnOutcome } from "../_shared/agents/turn-outcome.ts";
import { executeReadTool, readToolDefinitions } from "../_shared/agents/read-tools.ts";
import { actionToolDefinition, executeActionTool, type ActionToolContext } from "../_shared/agents/action-tool.ts";
import { stepLabel } from "../_shared/agents/tool-labels.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { loadRules, renderRules, type RulesClient } from "../_shared/agents/rules.ts";
import { clientDirectory, renderClientIndex } from "../_shared/agents/clients.ts";
import { executeAndRecord, type ActionRow } from "../_shared/agents/actions.ts";
import { deliverRun } from "../_shared/agents/delivery.ts";
import { alwaysApproves, isDestructive } from "../_shared/agents/action-kinds.ts";
import { canAutoExecute, resolveAutonomy, type AgentRow } from "../_shared/agents/types.ts";

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

/** Appended when a scheduled run has tools. Tighter than the chat version. */
const RUN_TOOL_DOCTRINE = `
---

You can look things up. \`search\` finds a client, project, proposal, invoice or
task by name. \`query\` lists or counts records matching conditions.
\`get_record\` reads one thing in full. Use them when the summary you were given
is not enough to say something specific — a vague brief is worse than a short one.

You can also act, with \`propose_action\`. Safe work runs at once and returns its
result; anything reaching a client or destroying a record is queued for approval
and you are told so. Never report work as done unless a call confirmed it.

Nobody is watching this run, so be economical: a handful of lookups to make the
brief concrete, not an investigation. Finish by writing the brief as plain
prose, opening with the single most important sentence.`;

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
    const [context, rules, directory, projectAutonomy] = await Promise.all([
      def.gather(sb, agent.config ?? {}),
      loadRules(sb as unknown as RulesClient, agent.id),
      clientDirectory(sb as unknown as RulesClient),
      // Empty for every agent that does not declare it, which leaves the gate
      // exactly where it was for the other five.
      def.projectAutonomy?.(sb) ?? Promise.resolve<Record<string, string>>({}),
    ]);
    // A scheduled run gets the same tools as a chat turn, so a brief is
    // researched rather than assembled from whatever the gatherer guessed at.
    // Capped harder: nobody is watching, so it should not wander.
    if ((agent.config as Record<string, unknown> | null)?.tool_loop === true) {
      const spent = { bytes: 0 };
      const actionCtx: ActionToolContext = {
        sb,
        agentId: agent.id,
        agentName: agent.name,
        autonomy: agent.autonomy,
        allowedActions: def.allowedActions,
        runId: run.id,
        conversationId: null,
        actionIds: [],
        taken: new Map(),
        count: { n: 0 },
        projectAutonomy,
      };
      const webSearch = (agent.config as Record<string, unknown> | null)?.web_search !== false;

      const loop = await runToolLoop({
        client: new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! }),
        model: agent.model,
        effort: agent.effort,
        maxTokens: 16_000,
        budgetMs: 180_000,
        maxIterations: 8,
        system: [{
          type: "text",
          text: systemPromptFor(agent as AgentRow, def) + RUN_TOOL_DOCTRINE,
          cache_control: { type: "ephemeral" },
        }],
        tools: [
          ...readToolDefinitions(),
          actionToolDefinition(def.allowedActions),
          ...(webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }] : []),
        ] as never,
        messages: [{
          role: "user",
          content: [
            ...(renderRules(rules) || renderClientIndex(directory)
              ? [{
                type: "text" as const,
                text: [renderRules(rules), renderClientIndex(directory)].filter(Boolean).join("\n\n"),
                cache_control: { type: "ephemeral" as const },
              }]
              : []),
            {
              type: "text" as const,
              text: `Here is the current state of the business. Today is ${
                new Date().toISOString().slice(0, 10)
              }.\n\n${JSON.stringify(context)}\n\nDo your run, then write the brief.`,
            },
          ],
        }],
        labelFor: stepLabel,
        dispatch: async (name, input) => {
          if (name === "propose_action") {
            return await executeActionTool(actionCtx, input, async (row) => {
              const outcome = await executeAndRecord(sb, row as ActionRow, agent.name);
              return { ok: outcome.ok, result: outcome.result, error: outcome.error };
            });
          }
          const outcome = await executeReadTool({ sb: sb as never, spent }, name, input);
          return { ok: outcome.ok, content: outcome.content };
        },
      });

      const { data: settled } = await sb.from("agent_actions")
        .select("status").in("id", actionCtx.actionIds.length ? actionCtx.actionIds : ["none"]);
      const waiting = (settled ?? []).filter((a) => a.status === "proposed").length;

      // The same resolver agent-chat uses, for the same reason. On 21 Aug a
      // Bria run spent 6,682 output tokens across 12 tool calls and 8
      // iterations, ended cleanly on end_turn, wrote no closing prose — and was
      // recorded as "Run produced nothing", status failed. The work had
      // happened; only the summary was missing, and marking that a failure
      // hides real work behind a red dot.
      const outcome = resolveTurnOutcome({
        text: loop.text,
        actionCount: actionCtx.actionIds.length,
        stoppedBy: loop.stoppedBy,
        error: loop.error ?? null,
        toolLabels: loop.calls.map((c) => stepLabel(c.name, c.input)),
      });

      await sb.from("agent_runs").update({
        status: outcome.status === "complete" ? "succeeded" : "failed",
        finished_at: new Date().toISOString(),
        headline: outcome.content.split("\n")[0].slice(0, 120) || "Run produced nothing",
        summary: outcome.content,
        detail: {
          tool_calls: loop.calls.length,
          iterations: loop.iterations,
          stopped_by: outcome.stoppedBy,
        },
        error: outcome.error,
        input_tokens: loop.usage.input,
        output_tokens: loop.usage.output,
        cache_read_tokens: loop.usage.cacheRead,
      }).eq("id", run.id);

      await deliverRun(sb, agent as AgentRow, run.id, {
        headline: outcome.content.split("\n")[0].slice(0, 120),
        summary: outcome.content,
        detail: {},
        actions: [],
      }, waiting);

      return json({
        run_id: run.id,
        headline: loop.text.split("\n")[0].slice(0, 120),
        pending_approvals: waiting,
        tool_calls: loop.calls.length,
      });
    }

    const { finding, usage } = await runAgentModel({
      systemPrompt: systemPromptFor(agent as AgentRow, def),
      contextJson: context,
      rulesBlock: renderRules(rules),
      directoryBlock: renderClientIndex(directory),
      model: agent.model,
      effort: agent.effort,
      allowedActions: def.allowedActions,
    });

    // Persist every proposed action before executing any of them.
    let pendingApprovals = 0;
    const executed: Array<{ id: string; ok: boolean; error?: string }> = [];

    if (finding.actions.length) {
      const auto = finding.actions.map((a) =>
        canAutoExecute(
          resolveAutonomy(
            agent.autonomy,
            projectAutonomy[String(a.payload?.client_project_id ?? "")],
          ),
          a.outward,
          isDestructive(a.kind),
          alwaysApproves(a.kind),
        ),
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
