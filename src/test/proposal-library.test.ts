import { describe, expect, it } from "vitest";
import {
  EXEMPLARS,
  exemplarIndex,
  findExemplar,
} from "../../supabase/functions/_shared/agents/proposal-library";
import { PROPOSAL_BRIEFING } from "../../supabase/functions/_shared/agents/proposal-spine";

describe("the exemplar library", () => {
  it("carries at least one real sent proposal", () => {
    expect(EXEMPLARS.length).toBeGreaterThan(0);
  });

  // The whole point: a real document, not a summary of one. An exemplar short
  // enough to be a description teaches nothing the description did not.
  it("holds the FULL document, not an excerpt", () => {
    const menovia = findExemplar("menovia-retainer");
    expect(menovia).toBeDefined();
    expect(menovia!.text.length).toBeGreaterThan(20_000);
  });

  it("keeps the parts that make it worth reading", () => {
    const text = findExemplar("marketing retainer")!.text;
    // The bolded thesis under a heading.
    expect(text).toContain("The app is live. Now she has to find it.");
    // Scope carve-outs, stated before anyone asks.
    expect(text.toLowerCase()).toContain("not included");
    // It ends on acceptance, not a pitch.
    expect(text.toLowerCase()).toContain("acceptance");
  });

  it("indexes without dragging the text along", () => {
    const index = exemplarIndex();
    expect(index[0]).not.toHaveProperty("text");
    expect(index[0].chars).toBeGreaterThan(20_000);
    expect(index[0].kind).toBeTruthy();
  });

  it("finds an exemplar by kind, not only by key", () => {
    expect(findExemplar("marketing retainer")?.key).toBe("menovia-retainer");
    expect(findExemplar("retainer")?.key).toBe("menovia-retainer");
  });

  it("returns nothing rather than a wrong guess", () => {
    expect(findExemplar("")).toBeUndefined();
    expect(findExemplar("brand identity system")).toBeUndefined();
  });
});

describe("the briefing", () => {
  // It was ~1,600 tokens of description carried on every single turn, including
  // turns that had nothing to do with proposals.
  it("is far shorter than the description it replaced", () => {
    expect(PROPOSAL_BRIEFING.length).toBeLessThan(4_500);
  });

  it("sends the agent to a real document before it writes", () => {
    expect(PROPOSAL_BRIEFING).toContain("read_example_proposal");
  });

  it("states that the agent chooses the structure", () => {
    expect(PROPOSAL_BRIEFING.toLowerCase()).toContain("no fixed section list");
  });

  it("names the five non-negotiables", () => {
    const b = PROPOSAL_BRIEFING.toLowerCase();
    for (const phrase of ["what it costs", "what is included", "not included", "terms", "acceptance"]) {
      expect(b).toContain(phrase);
    }
  });

  it("tells the agent to write section by section, never in one call", () => {
    expect(PROPOSAL_BRIEFING).toContain("write_proposal_section");
    expect(PROPOSAL_BRIEFING.toLowerCase()).toContain("one section at a time");
  });

  it("tells the agent to read a section before revising it", () => {
    expect(PROPOSAL_BRIEFING).toContain("read_proposal");
    expect(PROPOSAL_BRIEFING.toLowerCase()).toContain("do not revise from memory");
  });
});
