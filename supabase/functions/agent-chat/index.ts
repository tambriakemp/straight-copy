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
import {
  alwaysApproves, isDestructive, isOutward, kindDocFor, kindEnumFor,
} from "../_shared/agents/action-kinds.ts";
import { loadRules, renderRules, type RulesClient } from "../_shared/agents/rules.ts";
import { clientDirectory, renderClientIndex } from "../_shared/agents/clients.ts";
import { describeTurnOutcome, normalizeTurns } from "../_shared/agents/history.ts";
import { runToolLoop } from "../_shared/agents/loop.ts";
import { pairedStepWriter } from "../_shared/agents/steps.ts";
import { executeReadTool, readToolDefinitions } from "../_shared/agents/read-tools.ts";
import { stepLabel } from "../_shared/agents/tool-labels.ts";
import { actionToolDefinition, executeActionTool, type ActionToolContext } from "../_shared/agents/action-tool.ts";
import { resolveTurnOutcome, turnColumns } from "../_shared/agents/turn-outcome.ts";
import { canAutoExecute, resolveAutonomy, type AgentRow } from "../_shared/agents/types.ts";

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
            "LAST RESORT ONLY. Almost always leave this empty and do the work instead, listing what you assumed. " +
            "Legitimate reasons to ask: a price nobody has stated, which of two clients was meant, or a commercial " +
            "commitment the owner has not agreed to. Everything else — phase names, billing dates, titles, entity " +
            "names, scope depth, the strategic argument — you decide and mark as an assumption. " +
            "Asking about something with an obvious professional default is a failure, not caution. Never more than two.",
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

/**
 * Appended when the tool loop is on.
 *
 * The rest of the prompt was written for a model that could not look anything
 * up, and several of its instructions ("if something is not in it, say so")
 * are now exactly wrong. This overrides them.
 */
const TOOL_DOCTRINE = `
---

You can look things up. You have tools over the whole business: \`search\` to
find a client, project, proposal, invoice or task by name; \`query\` to list or
count records matching conditions; \`get_record\` to read one thing in full,
including the long text that lists cut short.

Use them before you ask. Asking the owner for something you could have looked
up in one call is the failure mode here — worse than a wrong guess, because it
costs her time and tells her the software does not know its own data.

So: someone names a client, you search for them. You need their email, the
project you are attaching something to, what the last proposal said, whether an
invoice was paid — you read it. You are unsure whether a task is well specified
— you open it and look rather than judging from a title.

Two things do not change. Never state a business figure you did not read from a
tool or from the data given to you. And when you genuinely cannot find
something, say what you looked for and where, so the gap is a fact rather than
a question.

You can also DO things, with \`propose_action\`. Anything safe runs at once and
returns its real result, so chain them: create the project, read the id back,
then draft the proposal against it. Anything that reaches a client or destroys
a record is queued for the owner instead, and you are told so.

The rule that follows from this: never say you have written, created, sent or
scheduled something unless a call came back saying it was done. Describing a
draft you did not propose is the worst thing you can do here — it looks like
work and it is not.

When you are asked to make a task and no project is named, put it on the
project you have been discussing. If nothing has been discussed, put it on the
agency's own board — the client "Tambria Kemp", project "Cre8 Visions Agency
Project" — which you can find with \`search\`. Either way, say which board you
used, so a task never lands somewhere she has to go looking for it.

Finish by answering in plain prose. There is no wrapper to fill in.`;

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

  // `stoppedBy` is recorded so the next blank turn is diagnosable from the row
  // rather than re-investigated from scratch.
  const fail = async (message: string, stoppedBy: string | null = null) => {
    await sb.from("agent_messages").update({
      status: "failed",
      error: message,
      stopped_by: stoppedBy,
      completed_at: new Date().toISOString(),
    }).eq("id", pendingId);
  };

  try {
    // --- history + live context ---
    const { data: history } = await sb.from("agent_messages")
      .select("role, content, action_ids, questions")
      .eq("conversation_id", conversationId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS);
    // normalizeTurns does the work that filtering alone got wrong: dropping a
    // failed turn left two consecutive user messages, which the API rejects —
    // permanently, for that conversation. It also carries forward what each
    // turn produced, so the agent knows what it already proposed.
    const turns = normalizeTurns(
      (history ?? []).reverse().map((m) => {
        const note = m.role === "assistant" ? describeTurnOutcome(m) : "";
        return { role: m.role, content: note ? `${m.content}\n\n${note}` : m.content };
      }),
    );

    const [context, rules, directory, projectAutonomy] = await Promise.all([
      def.gather(sb, agent.config ?? {}),
      loadRules(sb as unknown as RulesClient, agent.id),
      clientDirectory(sb as unknown as RulesClient),
      // Empty for every agent that does not declare it. Chat and scheduled
      // runs must resolve autonomy the same way, or the same action is gated
      // differently depending on which one produced it.
      def.projectAutonomy?.(sb) ?? Promise.resolve<Record<string, string>>({}),
    ]);
    const rulesBlock = renderRules(rules);
    const directoryBlock = renderClientIndex(directory);

    const seedMessages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          // Rules and the client index barely change, so they carry the
          // breakpoint. Everything volatile sits after it.
          ...(rulesBlock || directoryBlock
            ? [{
              type: "text" as const,
              text: [rulesBlock, directoryBlock].filter(Boolean).join("\n\n"),
              cache_control: { type: "ephemeral" as const },
            }]
            : []),
          {
            type: "text" as const,
            // Compact. Pretty-printing a large blob buys whitespace nobody
            // reads at 15-25% more input tokens.
            text: `Current state of what you are responsible for, as of ${
              new Date().toISOString().slice(0, 10)
            }:\n\n${JSON.stringify(context)}`,
          },
        ],
      },
      // No synthetic "Understood — I have the current picture." turn. It was
      // a pseudo-prefill, and when the history window happened to open on an
      // assistant row it produced assistant-after-assistant — a 400.
      ...turns,
    ];

    const client = new Anthropic({ apiKey });

    // --- the tool loop ---
    //
    // Gated per agent so a misbehaving one can be dropped back to the old
    // single-shot path from settings without a deploy.
    if ((agent.config as Record<string, unknown> | null)?.tool_loop === true) {
      const startedAt = Date.now();
      const spent = { bytes: 0 };
      const onStep = pairedStepWriter(sb, pendingId);

      const actionCtx: ActionToolContext = {
        sb,
        agentId: agent.id,
        agentName: agent.name,
        autonomy: agent.autonomy,
        allowedActions: def.allowedActions,
        runId: null,
        conversationId,
        actionIds: [],
        taken: new Map(),
        count: { n: 0 },
        projectAutonomy,
      };

      const webSearch = (agent.config as Record<string, unknown> | null)?.web_search !== false;
      const tools = [
        ...readToolDefinitions(),
        actionToolDefinition(def.allowedActions),
        // Anthropic's server-side search. The _20260209 variant runs code under
        // the hood, so code_execution must NOT also be declared — two execution
        // environments confuse the model.
        ...(webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : []),
      ];

      const result = await runToolLoop({
        client,
        model: agent.model,
        effort: agent.effort,
        maxTokens: 32_000,
        // Under the 6 minutes after which the chat marks a message stale, so a
        // healthy long turn never renders as one that never came back.
        budgetMs: 240_000,
        maxIterations: 14,
        system: [{
          type: "text",
          text: systemPromptFor(agent as AgentRow, def) + CHAT_ADDENDUM + TOOL_DOCTRINE,
          cache_control: { type: "ephemeral" },
        }],
        tools: tools as never,
        messages: seedMessages,
        onStep,
        labelFor: stepLabel,
        dispatch: async (name, input) => {
          if (name === "propose_action") {
            return await executeActionTool(actionCtx, input, async (row) => {
              const result = await executeAndRecord(sb, row as ActionRow, agent.name);
              return { ok: result.ok, result: result.result, error: result.error };
            });
          }
          const outcome = await executeReadTool({ sb: sb as never, spent }, name, input);
          return { ok: outcome.ok, content: outcome.content };
        },
      });

      if (result.stoppedBy === "refusal") {
        await sb.from("agent_messages").update({
          content: "I can't help with that one.", status: "complete",
          error: "refusal", stopped_by: "refusal",
          completed_at: new Date().toISOString(),
        }).eq("id", pendingId);
        return;
      }

      // One resolver decides status and content together, so a blank reply
      // cannot be written as a completed turn. See turn-outcome.ts.
      const outcome = resolveTurnOutcome({
        text: result.text,
        actionCount: actionCtx.actionIds.length,
        stoppedBy: result.stoppedBy,
        error: result.error ?? null,
        // What it managed to look at, so an exhausted loop says so rather than
        // returning nothing.
        toolLabels: result.calls.map((c) => stepLabel(c.name, c.input)),
      });

      await sb.from("agent_messages").update({
        ...turnColumns(outcome),
        run_id: actionCtx.runId,
        action_ids: actionCtx.actionIds,
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        cache_read_tokens: result.usage.cacheRead,
        tool_calls: result.calls.length,
        iterations: result.iterations,
        duration_ms: Date.now() - startedAt,
      }).eq("id", pendingId);

      if (outcome.status === "failed") return;

      // Close the run off so it stops showing as still going in the activity
      // panel. It was opened lazily by the first action.
      if (actionCtx.runId) {
        await sb.from("agent_runs").update({
          finished_at: new Date().toISOString(),
          headline: outcome.content.split("\n")[0].slice(0, 120),
          summary: outcome.content,
          input_tokens: result.usage.input,
          output_tokens: result.usage.output,
          cache_read_tokens: result.usage.cacheRead,
        }).eq("id", actionCtx.runId);
      }

      await sb.from("agent_conversations")
        .update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      return;
    }

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
      messages: seedMessages,
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      await sb.from("agent_messages").update({
        content: "I can't help with that one.",
        status: "complete",
        error: "refusal",
        stopped_by: "refusal",
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
        "max_tokens",
      );
      return;
    }

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "reply",
    );
    if (!block) {
      await fail("The model returned nothing usable. Send the message again.", "no_reply_block");
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
    // Two, not three. A third question is almost always something with a
    // default the agent should have picked — and past two, a choice list reads
    // as a form, which is the exact thing these were meant to replace.
    const questions = (raw.questions ?? [])
      .filter((q) => q?.id && q?.question && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 2)
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
            status: canAutoExecute(
                resolveAutonomy(
                  agent.autonomy,
                  projectAutonomy[String(
                    (a.payload as Record<string, unknown> | undefined)
                      ?.client_project_id ?? "",
                  )],
                ),
                outward,
                isDestructive(a.kind),
                alwaysApproves(a.kind),
              )
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

    // This guard used to read `!reply.trim() && !questions.length &&
    // !actionIds.length`, which lets a blank reply through as soon as it
    // carries questions or actions — a completed turn with an empty bubble
    // above the choice list. The resolver closes that: status and content are
    // decided together and complete always has something to read.
    const outcome = resolveTurnOutcome({
      text: reply,
      questionCount: questions.length,
      actionCount: actionIds.length,
      stopReason: response.stop_reason,
    });

    await sb.from("agent_messages").update({
      ...turnColumns(outcome),
      run_id: runId,
      action_ids: actionIds,
      questions: questions.length ? questions : null,
      duration_ms: Date.now() - startedAt,
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    }).eq("id", pendingId);

    if (outcome.status === "failed") return;

    // Keep the conversation at the top of the list.
    await sb.from("agent_conversations")
      .update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } catch (e) {
    console.error("agent-chat turn failed", e);
    await fail(String((e as Error).message || e), "exception");
  }
}
