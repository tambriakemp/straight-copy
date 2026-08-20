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
import { isDestructive, isOutward, kindDocFor, kindEnumFor } from "../_shared/agents/action-kinds.ts";
import { loadRules, renderRules, type RulesClient } from "../_shared/agents/rules.ts";
import { clientDirectory, renderDirectory } from "../_shared/agents/clients.ts";
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
        questions: {
          type: "array",
          description:
            "Anything you need answered before you can act, as choices rather than open prompts. Leave this out whenever you can proceed on a stated assumption instead — a proposal with two assumptions beats an interview. Never more than three.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Short stable key, e.g. 'project_type'." },
              question: { type: "string", description: "One sentence, ending in a question mark." },
              multi: { type: "boolean", description: "True when more than one option can be picked." },
              options: {
                type: "array",
                description: "Two to four options, your recommended answer first. Never include an 'other' option — one is added for you.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "One to five words." },
                    description: { type: "string", description: "What choosing this means, in a short phrase." },
                  },
                  required: ["label"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "question", "options"],
            additionalProperties: false,
          },
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

  // The assistant row is created empty and pending BEFORE the model is called.
  // That row is the progress indicator: it is in the conversation, so it
  // survives a refresh, and a turn that dies leaves something to mark failed
  // rather than nothing at all.
  const { data: pending, error: pendingErr } = await sb.from("agent_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: "",
    status: "pending",
  }).select("id").single();
  if (pendingErr || !pending) {
    return json({ error: pendingErr?.message ?? "Could not start the reply" }, 500);
  }
  const pendingId = pending.id as string;

  const work = runTurn({
    sb, agent: agent as AgentRow, def, apiKey,
    conversationId, pendingId,
  });

  // Hand the work to the runtime and answer now. The client watches the
  // pending row; it does not wait on this request.
  if (typeof EdgeRuntime !== "undefined" && "waitUntil" in EdgeRuntime) {
    (EdgeRuntime as { waitUntil(p: Promise<unknown>): void }).waitUntil(work);
  } else {
    // No background runtime (local `deno run`): fall back to awaiting, which is
    // the old behaviour rather than a dropped turn.
    await work;
  }

  return json({
    conversation_id: conversationId,
    pending_message_id: pendingId,
    status: "pending",
  }, 202);
});

declare const EdgeRuntime: unknown;

/**
 * One chat turn: gather, call the model, execute what it proposed, and write
 * the result onto the pending row.
 *
 * Never throws. Anything that goes wrong is recorded on the message, because a
 * failure the person can see beats a failure that leaves a bubble spinning.
 */
async function runTurn(args: {
  sb: ReturnType<typeof serviceClient>;
  agent: AgentRow;
  def: ReturnType<typeof definitionFor> & object;
  apiKey: string;
  conversationId: string;
  pendingId: string;
}): Promise<void> {
  const { sb, agent, def, apiKey, conversationId, pendingId } = args;

  const fail = async (message: string) => {
    await sb.from("agent_messages").update({
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    }).eq("id", pendingId);
  };

  try {
    // --- history + live context ---
    const { data: history } = await sb.from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS);
    // Empty turns would be rejected by the API, and a failed turn is not
    // something the agent should try to reason about.
    const turns = (history ?? []).reverse().filter((m) => (m.content ?? "").trim());

    const [context, rules, directory] = await Promise.all([
      def.gather(sb, agent.config ?? {}),
      loadRules(sb as unknown as RulesClient, agent.id),
      clientDirectory(sb as unknown as RulesClient),
    ]);
    const rulesBlock = renderRules(rules);
    const directoryBlock = renderDirectory(directory);

    const client = new Anthropic({ apiKey });
    // Streamed, because a drafted proposal is long: 8000 tokens truncated the
    // tool call mid-JSON, which arrived as a reply with no message at all —
    // the empty bubble. Streaming also keeps a multi-minute turn from hitting
    // the SDK's HTTP timeout.
    const stream = client.messages.stream({
      model: agent.model,
      max_tokens: 64000,
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
          content: [
            rulesBlock,
            directoryBlock,
            `Current state of what you are responsible for, as of ${
              new Date().toISOString().slice(0, 10)
            }:\n\n${JSON.stringify(context, null, 2)}`,
          ].filter(Boolean).join("\n\n"),
        },
        { role: "assistant", content: "Understood — I have the current picture." },
        ...turns.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      await sb.from("agent_messages").update({
        content: "I can't help with that one.",
        status: "complete",
        error: "refusal",
        completed_at: new Date().toISOString(),
      }).eq("id", pendingId);
      return;
    }

    // Truncation used to arrive as a reply with no message, which was written
    // as an empty bubble and read as "the agent is stuck". Say what happened.
    if (response.stop_reason === "max_tokens") {
      await fail(
        "That answer ran past the length limit before it finished. Ask for it in " +
          "smaller pieces — one section at a time — or narrow the request.",
      );
      return;
    }

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "reply",
    );
    if (!block) {
      await fail("The model returned nothing usable. Send the message again.");
      return;
    }

    const raw = block.input as {
      message?: string;
      questions?: Array<{
        id: string; question: string; multi?: boolean;
        options: Array<{ label: string; description?: string }>;
      }>;
      actions?: Array<{ kind: string; title: string; description?: string; payload?: Record<string, unknown> }>;
    };
    // Cap at three and four: past that a choice list is a form, and a form is
    // exactly the thing these replace.
    const questions = (raw.questions ?? [])
      .filter((q) => q?.id && q?.question && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 3)
      .map((q) => ({ ...q, options: q.options.slice(0, 4) }));
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
            status: canAutoExecute(agent.autonomy, outward, isDestructive(a.kind))
              ? "approved"
              : "proposed",
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

    // A reply with no text and nothing proposed is a failed turn wearing a
    // success costume — the exact thing that produced the blank bubble.
    if (!reply.trim() && !questions.length && !actionIds.length) {
      await fail("The reply came back empty. Send the message again.");
      return;
    }

    await sb.from("agent_messages").update({
      content: reply,
      status: "complete",
      run_id: runId,
      action_ids: actionIds,
      questions: questions.length ? questions : null,
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      completed_at: new Date().toISOString(),
    }).eq("id", pendingId);

    // Keep the conversation at the top of the list.
    await sb.from("agent_conversations")
      .update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } catch (e) {
    console.error("agent-chat turn failed", e);
    await fail(String((e as Error).message || e));
  }
}
