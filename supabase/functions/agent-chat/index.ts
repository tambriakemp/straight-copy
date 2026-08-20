// Chatting with an agent.
//
// Same persona and the same read surface its scheduled runs use, so asking Rune
// about a launch gets the answer its brief would have given. And the same
// consequence model: if the conversation calls for something to happen, it is
// written as an agent_action and gated by the agent's autonomy exactly as a
// scheduled run would be. One approval surface, one audit trail.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { definitionFor, systemPromptFor } from "../_shared/agents/registry.ts";
import { executeAndRecord, type ActionRow } from "../_shared/agents/actions.ts";
import { isOutward, kindDocFor, kindEnumFor } from "../_shared/agents/action-kinds.ts";
import { canAutoExecute, type AgentRow } from "../_shared/agents/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Turns of history sent back. Enough to hold a thread, not the whole day. */
const HISTORY_TURNS = 24;
const MAX_MESSAGE_CHARS = 8000;

async function authorize(
  req: Request, sb: ReturnType<typeof serviceClient>,
): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getUser(auth.slice(7).trim());
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const { data: admin } = await sb.from("admin_users")
    .select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return { userId: data.user.id };
}

/**
 * The one tool a chat turn can call.
 *
 * Reply is required so there is always something to show; actions are optional
 * because most messages are questions, not instructions.
 */
function replyTool(allowedActions: string[]): Anthropic.Tool {
  return {
    name: "reply",
    description: "Reply to the message. Call this exactly once, as your final step.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Your reply, in markdown. Answer what was asked. If you are proposing actions, say briefly what and why rather than restating them.",
        },
        actions: {
          type: "array",
          description:
            "Things that should happen as a result. Empty is the normal case — most messages want an answer, not work.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                // Generated from this agent's allowlist, so it is never offered
                // an action that would be silently dropped afterwards.
                enum: kindEnumFor(allowedActions),
                description: kindDocFor(allowedActions),
              },
              title: { type: "string" },
              description: { type: "string" },
              payload: { type: "object", additionalProperties: true },
            },
            required: ["kind", "title", "payload"],
            additionalProperties: false,
          },
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  };
}

const CHAT_ADDENDUM = `
---

You are in a direct conversation with the owner rather than producing a scheduled
brief. So:

  * Answer the question actually asked. Short. No preamble, no recap of what you
    were asked, no offering three options when one is right.
  * You have the same data you use for your scheduled runs, included below. If
    something is not in it, say so plainly instead of guessing.
  * Only propose actions when the conversation genuinely calls for work to
    happen. A question deserves an answer, not a task.
  * If asked to do something outside what you are for, say so and name who
    should handle it.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = serviceClient();
  const guard = await authorize(req, sb);
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => ({})) as {
    agent_id?: string; conversation_id?: string; message?: string;
  };
  const text = (body.message ?? "").trim();
  if (!body.agent_id) return json({ error: "agent_id required" }, 400);
  if (!text) return json({ error: "Message is empty" }, 400);
  if (text.length > MAX_MESSAGE_CHARS) return json({ error: "Message is too long" }, 400);

  const { data: agent } = await sb.from("agents").select("*").eq("id", body.agent_id).maybeSingle();
  if (!agent) return json({ error: "Agent not found" }, 404);

  const def = definitionFor(agent as AgentRow);
  if (!def) return json({ error: `No definition for "${agent.key}"` }, 500);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

  try {
    // --- conversation ---
    let conversationId = body.conversation_id ?? null;
    if (!conversationId) {
      const { data: conv, error } = await sb.from("agent_conversations").insert({
        agent_id: agent.id,
        created_by: guard.userId,
        title: text.slice(0, 80),
      }).select("id").single();
      if (error || !conv) return json({ error: error?.message ?? "Could not start conversation" }, 500);
      conversationId = conv.id;
    }

    await sb.from("agent_messages").insert({
      conversation_id: conversationId, role: "user", content: text,
    });

    // --- history + live context ---
    const { data: history } = await sb.from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS);
    const turns = (history ?? []).reverse();

    const context = await def.gather(sb, agent.config ?? {});

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: agent.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: agent.effort as "low" | "medium" | "high" | "xhigh" | "max" },
      system: [
        {
          // Persona is identical across every turn and every conversation, so it
          // caches; the volatile data goes in the user turn, after the breakpoint.
          type: "text",
          text: systemPromptFor(agent as AgentRow, def) + CHAT_ADDENDUM,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [replyTool(def.allowedActions)],
      tool_choice: { type: "tool", name: "reply" },
      messages: [
        {
          role: "user",
          content: `Current state of what you are responsible for, as of ${
            new Date().toISOString().slice(0, 10)
          }:\n\n${JSON.stringify(context, null, 2)}`,
        },
        { role: "assistant", content: "Understood — I have the current picture." },
        ...turns.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    if (response.stop_reason === "refusal") {
      const msg = "I can't help with that one.";
      await sb.from("agent_messages").insert({
        conversation_id: conversationId, role: "assistant", content: msg,
        error: "refusal",
      });
      return json({ conversation_id: conversationId, message: msg, actions: [] });
    }

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "reply",
    );
    if (!block) throw new Error("No reply returned");

    const raw = block.input as {
      message?: string;
      actions?: Array<{ kind: string; title: string; description?: string; payload?: Record<string, unknown> }>;
    };
    const reply = raw.message ?? "";

    // --- actions, gated exactly as a scheduled run's would be ---
    const allowed = new Set(def.allowedActions);
    const proposals = (raw.actions ?? []).filter((a) => allowed.has(a.kind));

    const actionIds: string[] = [];
    let runId: string | null = null;

    if (proposals.length) {
      // A chat turn that produces work is a run, so it lands in the activity
      // panel and cost accounting with everything else.
      const { data: run } = await sb.from("agent_runs").insert({
        agent_id: agent.id,
        status: "succeeded",
        trigger: "chat",
        conversation_id: conversationId,
        finished_at: new Date().toISOString(),
        headline: reply.split("\n")[0].slice(0, 120),
        summary: reply,
        input_tokens: response.usage.input_tokens ?? 0,
        output_tokens: response.usage.output_tokens ?? 0,
        cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      }).select("id").single();
      runId = run?.id ?? null;

      if (runId) {
        const rows = proposals.map((a) => {
          const outward = isOutward(a.kind);
          return {
            run_id: runId,
            agent_id: agent.id,
            kind: a.kind,
            outward,
            title: a.title,
            description: a.description ?? null,
            payload: a.payload ?? {},
            status: canAutoExecute(agent.autonomy, outward) ? "approved" : "proposed",
          };
        });
        const { data: inserted } = await sb.from("agent_actions").insert(rows).select("*");
        for (const row of inserted ?? []) {
          actionIds.push(row.id);
          if (row.status === "approved") {
            await executeAndRecord(sb, row as ActionRow, agent.name);
          }
        }
      }
    }

    await sb.from("agent_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
      run_id: runId,
      action_ids: actionIds,
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    });

    // Keep the conversation at the top of the list.
    await sb.from("agent_conversations")
      .update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    const { data: actions } = actionIds.length
      ? await sb.from("agent_actions").select("*").in("id", actionIds)
      : { data: [] };

    return json({
      conversation_id: conversationId,
      message: reply,
      actions: actions ?? [],
      run_id: runId,
      usage: {
        input: response.usage.input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error("agent-chat failed", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
