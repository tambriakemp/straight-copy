import { describe, expect, it } from "vitest";
import {
  requestTuning,
  supportsAdaptiveThinking,
} from "../../supabase/functions/_shared/agents/model-params.ts";

// The bug this file exists to prevent: the agents were written against Opus 5
// and sent `thinking: {type:"adaptive"}` unconditionally. Changing the default
// model to Sonnet 4.5 made every agent run fail with 400 "adaptive thinking is
// not supported on this model".

describe("supportsAdaptiveThinking", () => {
  it("says no to the pre-4.6 models that reject adaptive", () => {
    expect(supportsAdaptiveThinking("claude-sonnet-4-5")).toBe(false);
    expect(supportsAdaptiveThinking("claude-haiku-4-5")).toBe(false);
    expect(supportsAdaptiveThinking("claude-opus-4-1")).toBe(false);
    expect(supportsAdaptiveThinking("claude-opus-4-5")).toBe(false);
  });

  it("says yes from 4.6 onwards", () => {
    expect(supportsAdaptiveThinking("claude-opus-4-6")).toBe(true);
    expect(supportsAdaptiveThinking("claude-sonnet-4-6")).toBe(true);
    expect(supportsAdaptiveThinking("claude-opus-5")).toBe(true);
    // A future model should not need a code change to think properly.
    expect(supportsAdaptiveThinking("claude-sonnet-6-2")).toBe(true);
  });

  it("does not guess at an unrecognisable model id", () => {
    // Falling back to the older, more widely accepted shape is the safe error.
    expect(supportsAdaptiveThinking("some-other-model")).toBe(false);
    expect(supportsAdaptiveThinking("")).toBe(false);
  });
});

describe("requestTuning", () => {
  it("sends the legacy budget shape to Sonnet 4.5, and no effort", () => {
    const t = requestTuning({
      model: "claude-sonnet-4-5",
      effort: "high",
      maxTokens: 32_000,
    });
    expect(t.thinking).toEqual({ type: "enabled", budget_tokens: 10_000 });
    // output_config would itself 400 on this model.
    expect(t.output_config).toBeUndefined();
  });

  it("sends adaptive plus effort to a 4.6-family model", () => {
    const t = requestTuning({
      model: "claude-opus-4-6",
      effort: "high",
      maxTokens: 32_000,
      display: "summarized",
    });
    expect(t.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(t.output_config).toEqual({ effort: "high" });
  });

  it("sends no thinking at all when a tool is forced, on any model", () => {
    for (const model of ["claude-sonnet-4-5", "claude-opus-5"]) {
      const t = requestTuning({
        model,
        effort: "high",
        maxTokens: 16_000,
        forcedTool: true,
      });
      expect(t.thinking).toBeUndefined();
      expect(t.output_config).toBeUndefined();
    }
  });

  it("keeps the thinking budget under max_tokens", () => {
    const t = requestTuning({
      model: "claude-sonnet-4-5",
      effort: "max",
      maxTokens: 8_000,
    });
    // 24k of thinking in an 8k window is an instant 400.
    expect(t.thinking).toEqual({ type: "enabled", budget_tokens: 6_000 });
  });

  it("drops thinking rather than sending an illegal budget in a tiny window", () => {
    const t = requestTuning({
      model: "claude-sonnet-4-5",
      effort: "low",
      maxTokens: 1_000,
    });
    // The API floor is 1024, so there is no legal budget here.
    expect(t.thinking).toBeUndefined();
  });

  it("treats a missing or unknown effort as medium", () => {
    const t = requestTuning({
      model: "claude-sonnet-4-5",
      effort: "",
      maxTokens: 32_000,
    });
    expect(t.thinking).toEqual({ type: "enabled", budget_tokens: 4_000 });
  });

  it("scales the budget with effort", () => {
    const budget = (effort: string) => {
      const t = requestTuning({
        model: "claude-sonnet-4-5",
        effort,
        maxTokens: 64_000,
      });
      return t.thinking && "budget_tokens" in t.thinking
        ? t.thinking.budget_tokens
        : 0;
    };
    expect(budget("low")).toBeLessThan(budget("medium"));
    expect(budget("medium")).toBeLessThan(budget("high"));
    expect(budget("high")).toBeLessThan(budget("xhigh"));
    expect(budget("xhigh")).toBeLessThan(budget("max"));
  });
});
