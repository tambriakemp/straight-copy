// The Claude call behind every agent run.
//
// Uses the official Anthropic SDK. A few Opus 5 specifics that are easy to get
// wrong and fail with a 400:
//   * `temperature` / `top_p` / `top_k` are REMOVED — never send them.
//   * `budget_tokens` is REMOVED; depth is controlled by output_config.effort.
//   * Thinking is on by default; `{type:"adaptive"}` is the explicit form.
//   * Assistant prefill is rejected.
//
// Output shape is pinned with a forced tool call rather than free text, so the
// runtime always gets a validated object instead of parsing prose.
//
// Caching: the system prompt is marked ephemeral. It is identical on every run
// of a given agent, so after the first run each subsequent one reads the prefix
// from cache at ~10% cost. That only holds because nothing volatile (no
// timestamp, no run id) is in the system prompt — the changing data goes in the
// user message, after the breakpoint.
import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { isOutward, kindDocFor, kindEnumFor } from "./action-kinds.ts";
import type { AgentFinding, ProposedAction } from "./types.ts";

/**
 * The report tool, built per agent.
 *
 * The `kind` enum is generated from the agent's allowlist rather than hardcoded,
 * so an agent is never shown an action it isn't permitted to take. Offering one
 * and then silently dropping it wasted a whole run's reasoning.
 */
function reportTool(allowedActions: string[]): Anthropic.Tool {
  const kinds = kindEnumFor(allowedActions);
  return {
    name: "report",
    description:
      "Report your findings for this run. Call this exactly once, as your final step.",
    input_schema: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description:
            "One sentence, under 120 characters, stating the single most important thing. Shown alone in list views.",
        },
        summary: {
          type: "string",
          description:
            "The brief itself, in markdown. Short paragraphs or bullets. No title heading — the headline covers that.",
        },
        detail: {
          type: "object",
          description:
            "Structured facts behind the brief (figures cited, entities involved). Free-form; used for rendering and later comparison.",
          additionalProperties: true,
        },
        actions: {
          type: "array",
          description:
            "Things that should happen as a result. Empty array is a valid and often correct answer.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: kinds,
                description: kindDocFor(allowedActions),
              },
              title: { type: "string", description: "Short imperative label, e.g. 'Chase Acme invoice #3'." },
              description: { type: "string", description: "Why this, in one or two sentences." },
              payload: {
                type: "object",
                description: "Fields for this kind, as described in the kind enum.",
                additionalProperties: true,
              },
            },
            required: ["kind", "title", "payload"],
            additionalProperties: false,
          },
        },
      },
      required: ["headline", "summary", "detail", "actions"],
      additionalProperties: false,
    },
  };
}


export interface RunResult {
  finding: AgentFinding;
  usage: { input: number; output: number; cacheRead: number };
}

export async function runAgentModel(args: {
  systemPrompt: string;
  contextJson: unknown;
  /** Standing rules, rendered. Goes after the cached prefix so edits land at once. */
  rulesBlock?: string;
  /** The client roster, rendered. Every agent gets it; see clients.ts. */
  directoryBlock?: string;
  model: string;
  effort: string;
  allowedActions: string[];
}): Promise<RunResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: args.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort as "low" | "medium" | "high" | "xhigh" | "max" },
    system: [
      {
        type: "text",
        text: args.systemPrompt,
        // Stable across every run of this agent, so it caches.
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [reportTool(args.allowedActions)],
    tool_choice: { type: "tool", name: "report" },
    messages: [
      {
        role: "user",
        content: [
          args.rulesBlock,
          args.directoryBlock,
          `Here is the current state of the business. Today is ${
            new Date().toISOString().slice(0, 10)
          }.\n\n${JSON.stringify(args.contextJson, null, 2)}`,
          "Do your run and call the report tool.",
        ].filter(Boolean).join("\n\n"),
      },
    ],
  });

  // A forced tool_choice means a refusal is the only way we get no tool block.
  if (response.stop_reason === "refusal") {
    throw new Error(
      `Model declined the request${
        response.stop_details ? ` (${JSON.stringify(response.stop_details)})` : ""
      }`,
    );
  }

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report",
  );
  if (!block) throw new Error("Model returned no report block");

  const raw = block.input as {
    headline?: string;
    summary?: string;
    detail?: Record<string, unknown>;
    actions?: Array<{ kind: string; title: string; description?: string; payload?: Record<string, unknown> }>;
  };

  // Drop any action kind this agent isn't allowed to propose. The prompt says
  // which are available, but the allowlist is what actually enforces it.
  const allowed = new Set(args.allowedActions);
  const actions: ProposedAction[] = (raw.actions ?? [])
    .filter((a) => allowed.has(a.kind))
    .map((a) => ({
      kind: a.kind,
      outward: isOutward(a.kind),
      title: a.title,
      description: a.description,
      payload: a.payload ?? {},
    }));

  return {
    finding: {
      headline: raw.headline ?? "Run complete",
      summary: raw.summary ?? "",
      detail: raw.detail ?? {},
      actions,
    },
    usage: {
      input: response.usage.input_tokens ?? 0,
      output: response.usage.output_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
