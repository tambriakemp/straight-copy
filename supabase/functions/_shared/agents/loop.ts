import { requestTuning } from "./model-params.ts";
// The agentic loop.
//
// This is the change that turns these from templated LLM calls into agents.
// Every model call in this codebase used to be single-shot with a forced tool
// choice, and both tools told the model "call this exactly once, as your final
// step" — so an agent could never look anything up, never see the result of its
// own work, and had no move except asking the owner when data was missing.
//
// Now it can call a tool, read what came back, and decide again.
//
// Hand-written rather than the SDK's tool runner, for four reasons that all
// matter here: the loop has to write a progress row per step so the UI can show
// the work; it has to enforce a wall-clock budget because it runs inside
// EdgeRuntime.waitUntil; it has to resume `pause_turn` itself, which the runner
// does not do and which web search makes likely; and it has to move the rolling
// cache breakpoint each iteration, which is what makes a multi-step turn
// affordable at all.
// No SDK import. This module is reached by the frontend test suite, where a
// Deno `npm:` specifier does not resolve — the same constraint rules.ts and
// table-access.ts document. The loop only touches four shapes, so they are
// declared here rather than dragging the whole SDK into the app's tsconfig.
export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ModelResponse {
  content: ContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface ModelClient {
  messages: {
    stream(params: Record<string, unknown>): { finalMessage(): Promise<ModelResponse> };
  };
}

export interface LoopStep {
  seq: number;
  kind: "thinking" | "tool" | "action" | "note";
  toolName?: string;
  label: string;
  status: "running" | "ok" | "error";
  detail?: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  content: string;
}

export interface LoopArgs {
  client: ModelClient;
  model: string;
  effort: string;
  system: ContentBlock[];
  tools: Record<string, unknown>[];
  /** Opening messages: context, then history. Already breakpointed. */
  messages: MessageParam[];
  maxIterations: number;
  budgetMs: number;
  maxTokens?: number;
  /** Called as each step starts and finishes. Must not throw. */
  onStep?: (step: LoopStep) => Promise<void>;
  /** Runs one tool call. Must not throw. */
  dispatch: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  /** Human label for a call in progress. */
  labelFor: (name: string, input: Record<string, unknown>) => string;
}

export interface LoopResult {
  /** The assistant's final prose. */
  text: string;
  /** Every tool_use block seen, in order, with its input. */
  calls: Array<{ name: string; input: Record<string, unknown> }>;
  iterations: number;
  stoppedBy: "end_turn" | "iterations" | "budget" | "refusal" | "max_tokens" | "error";
  error?: string;
  usage: { input: number; output: number; cacheRead: number };
  /** The full message array, for storing as a replayable transcript. */
  messages: MessageParam[];
}

/** Identical calls past this many times get refused rather than run again. */
const REPEAT_LIMIT = 2;

const textOf = (content: ContentBlock[]): string =>
  content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();

/**
 * Move the rolling cache breakpoint onto the newest message.
 *
 * Only four breakpoints are allowed, so the old one has to be cleared before
 * the new one is set. Without this every iteration re-bills the whole
 * accumulated transcript at full rate, which is quadratic in the number of
 * steps — the thing that would make a twelve-step turn unaffordable.
 */
function moveBreakpoint(messages: MessageParam[]): void {
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content as Array<Record<string, unknown>>) {
      if (block.cache_control && block.__rolling) {
        delete block.cache_control;
        delete block.__rolling;
      }
    }
  }
  const last = messages[messages.length - 1];
  if (!last || typeof last.content === "string") return;
  const blocks = last.content as Array<Record<string, unknown>>;
  const tail = blocks[blocks.length - 1];
  if (!tail || tail.cache_control) return;
  tail.cache_control = { type: "ephemeral" };
  tail.__rolling = true;
}

/** Strip the marker before sending — it is ours, not the API's. */
function clean(messages: MessageParam[]): MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    return {
      ...m,
      content: (m.content as Array<Record<string, unknown>>).map((b) => {
        if (!b.__rolling) return b;
        const { __rolling: _drop, ...rest } = b;
        return rest;
      }),
    } as MessageParam;
  });
}

export async function runToolLoop(args: LoopArgs): Promise<LoopResult> {
  const messages = [...args.messages];
  const calls: LoopResult["calls"] = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  const seen = new Map<string, number>();
  const deadline = Date.now() + args.budgetMs;
  let seq = 0;
  let text = "";

  const step = async (s: Omit<LoopStep, "seq">) => {
    if (!args.onStep) return;
    try { await args.onStep({ ...s, seq: seq++ }); } catch { /* progress is never fatal */ }
  };

  for (let i = 0; i < args.maxIterations; i++) {
    const outOfTime = Date.now() > deadline;
    // On the last pass, take tools away rather than cutting the turn off. The
    // model then has to answer with what it has, which is a usable outcome —
    // an abandoned turn is not.
    const finalPass = outOfTime || i === args.maxIterations - 1;

    moveBreakpoint(messages);

    let response: ModelResponse;
    try {
      const stream = args.client.messages.stream({
        model: args.model,
        max_tokens: args.maxTokens ?? 32_000,
        // tool_choice is auto or none here, never forced, so thinking is fine —
        // in whichever shape this model accepts.
        ...requestTuning({
          model: args.model,
          effort: args.effort,
          maxTokens: args.maxTokens ?? 32_000,
          display: "summarized",
        }),
        system: args.system,
        tools: args.tools,
        tool_choice: finalPass ? { type: "none" } : { type: "auto" },
        messages: clean(messages),
      });
      response = await stream.finalMessage();
    } catch (e) {
      return {
        text, calls, iterations: i, stoppedBy: "error",
        error: String((e as Error).message || e), usage, messages,
      };
    }

    usage.input += response.usage.input_tokens ?? 0;
    usage.output += response.usage.output_tokens ?? 0;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      return { text, calls, iterations: i + 1, stoppedBy: "refusal", usage, messages };
    }

    // Surface the reasoning, one line per block. Summaries only — streaming
    // deltas would be dozens of writes for something nobody reads word by word.
    for (const block of response.content) {
      if (block.type !== "thinking") continue;
      const summary = (block.thinking ?? "").trim();
      if (!summary) continue;
      const firstLine = summary.split(/(?<=[.!?])\s|\n/)[0].slice(0, 160);
      if (firstLine) {
        await step({ kind: "thinking", label: firstLine, status: "ok" });
      }
    }

    const said = textOf(response.content);
    if (said) text = said;
    messages.push({ role: "assistant", content: response.content });

    // A paused turn is not finished — push it back and let it carry on. The SDK
    // does not do this, and web search makes it common; left unhandled it looks
    // exactly like a randomly truncated answer.
    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason === "max_tokens") {
      return { text, calls, iterations: i + 1, stoppedBy: "max_tokens", usage, messages };
    }

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) {
      return {
        text, calls, iterations: i + 1,
        stoppedBy: finalPass && outOfTime ? "budget" : "end_turn",
        usage, messages,
      };
    }

    const results: ContentBlock[] = [];
    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, unknown>;
      calls.push({ name: use.name, input });
      const label = args.labelFor(use.name, input);

      // Reading the same thing three times means it is stuck, not thorough.
      const fingerprint = `${use.name}:${JSON.stringify(input)}`;
      const times = (seen.get(fingerprint) ?? 0) + 1;
      seen.set(fingerprint, times);
      if (times > REPEAT_LIMIT) {
        await step({ kind: "tool", toolName: use.name, label, status: "error" });
        results.push({
          type: "tool_result", tool_use_id: use.id, is_error: true,
          content: "You have already run this exact call. Stop looking and answer with what you have.",
        });
        continue;
      }

      await step({ kind: "tool", toolName: use.name, label, status: "running" });
      const outcome = await args.dispatch(use.name, input);
      await step({
        kind: "tool", toolName: use.name, label,
        status: outcome.ok ? "ok" : "error",
      });

      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        // A failed call comes back as an error result, never dropped — an
        // unanswered tool_use is a malformed conversation.
        is_error: !outcome.ok,
        content: outcome.content,
      });
    }

    // Every result in ONE user message. Splitting them across messages teaches
    // the model to stop making parallel calls.
    messages.push({ role: "user", content: results });
  }

  return { text, calls, iterations: args.maxIterations, stoppedBy: "iterations", usage, messages };
}
