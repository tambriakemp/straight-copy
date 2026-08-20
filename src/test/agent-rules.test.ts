// Rules exist so the agent stops asking about things it has already been told.
// These cover the rendering — grouping, ordering, and the empty case that must
// produce no block at all rather than an empty heading.
import { describe, it, expect } from "vitest";
import { renderRules, type AgentRule } from "../../supabase/functions/_shared/agents/rules";

const rule = (over: Partial<AgentRule>): AgentRule => ({
  id: crypto.randomUUID(),
  label: "Governing law",
  body: "Georgia unless the client is outside the US.",
  category: "terms",
  order_index: 10,
  ...over,
});

describe("renderRules", () => {
  it("produces nothing at all when there are no rules", () => {
    // An empty heading would read as "you have no rules", which is a claim the
    // agent should never be given.
    expect(renderRules([])).toBe("");
  });

  it("groups by category and keeps each rule's label with its body", () => {
    const out = renderRules([
      rule({ label: "Governing law", category: "terms" }),
      rule({ label: "Warranty", body: "30 days.", category: "terms", order_index: 20 }),
      rule({ label: "Pass-through", body: "At cost, no markup.", category: "pricing", order_index: 30 }),
    ]);
    expect(out).toContain("TERMS");
    expect(out).toContain("PRICING");
    expect(out).toContain("Governing law: Georgia unless the client is outside the US.");
    expect(out).toContain("Warranty: 30 days.");
    // Both terms rules sit under the one heading, not two.
    expect(out.match(/TERMS/g)).toHaveLength(1);
  });

  it("tells the agent not to ask about what the rules already answer", () => {
    // Collapse the wrap — the instruction spans a line break in the source.
    const out = renderRules([rule({})]).toLowerCase().replace(/\s+/g, " ");
    expect(out).toContain("never ask about anything they already answer");
  });

  it("preserves the order it was given", () => {
    const out = renderRules([
      rule({ label: "First", category: "general", order_index: 1 }),
      rule({ label: "Second", category: "general", order_index: 2 }),
    ]);
    expect(out.indexOf("First")).toBeLessThan(out.indexOf("Second"));
  });
});
