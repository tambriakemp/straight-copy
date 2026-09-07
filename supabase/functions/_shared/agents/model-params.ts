// What request shape a given model will actually accept.
//
// The agents were written against Opus 5, which takes `thinking: {type:
// "adaptive"}` and `output_config: {effort}`. Both are recent additions. Point
// the same code at Sonnet 4.5 and the API answers 400 "adaptive thinking is not
// supported on this model" — which is what happened the moment the default
// model changed. Rather than pinning the code to one model forever, ask what
// this model supports and send that.
//
// Three rules, all of them from the API's own error surface:
//
//  1. Adaptive thinking and output_config.effort arrived with the 4.6 family.
//     Earlier thinking-capable models (Sonnet 4.5, Haiku 4.5, Opus 4.0-4.5)
//     reject `adaptive` outright and ignore or reject effort.
//  2. Those earlier models still think — via the older
//     `{type: "enabled", budget_tokens: N}` shape. So effort does not vanish,
//     it becomes a token budget.
//  3. Thinking of any kind is incompatible with a forced tool choice
//     (`tool_choice: {type: "tool"}` or `"any"`). Forced tool use prefills the
//     assistant turn, which suppresses the blocks thinking needs. A call that
//     forces a tool must send no thinking at all.

/** Effort, as the registry stores it. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ThinkingParam =
  | { type: "adaptive"; display?: "summarized" }
  | { type: "enabled"; budget_tokens: number };

export type RequestTuning = {
  thinking?: ThinkingParam;
  output_config?: { effort: Effort };
};

/**
 * The 4.6 family and anything after it. Matched on the version number in the
 * model id rather than an allowlist of names, so a new 4.7 or 5 does not have
 * to be added here before it can think properly.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  const m = /claude-(?:opus|sonnet|haiku)-(\d+)[-.]?(\d+)?/.exec(model);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2] ?? 0);
  if (!Number.isFinite(major)) return false;
  if (major > 4) return true;
  return major === 4 && minor >= 6;
}

/** effort → thinking budget, for models that only take a budget. */
const BUDGETS: Record<Effort, number> = {
  low: 2_000,
  medium: 4_000,
  high: 10_000,
  xhigh: 16_000,
  max: 24_000,
};

/**
 * Clamp a budget so it stays under max_tokens. The API requires
 * budget_tokens < max_tokens, and the minimum budget is 1024 — if max_tokens
 * is too small to leave room, the caller gets no thinking rather than a 400.
 */
function budgetFor(effort: Effort, maxTokens: number): number | null {
  const wanted = BUDGETS[effort] ?? BUDGETS.medium;
  // Leave a quarter of the window for the answer itself.
  const ceiling = Math.floor(maxTokens * 0.75);
  const budget = Math.min(wanted, ceiling);
  return budget >= 1024 ? budget : null;
}

/**
 * The thinking/effort half of a messages.create call, for this model.
 *
 * @param forcedTool the call sets tool_choice to a specific tool or "any", so
 *   no thinking can be requested at all.
 */
export function requestTuning(args: {
  model: string;
  effort: string;
  maxTokens: number;
  forcedTool?: boolean;
  display?: "summarized";
}): RequestTuning {
  const effort = (args.effort || "medium") as Effort;

  if (args.forcedTool) return {};

  if (supportsAdaptiveThinking(args.model)) {
    return {
      thinking: args.display
        ? { type: "adaptive", display: args.display }
        : { type: "adaptive" },
      output_config: { effort },
    };
  }

  const budget = budgetFor(effort, args.maxTokens);
  return budget ? { thinking: { type: "enabled", budget_tokens: budget } } : {};
}
