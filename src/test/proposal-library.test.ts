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

// Normalised the way proposal-defaults.test.ts does it: the briefing is
// hard-wrapped prose, so a phrase that spans a line break would otherwise fail
// a substring check for reasons that have nothing to do with its content.
const briefing = PROPOSAL_BRIEFING.toLowerCase().replace(/\s+/g, " ");

describe("the briefing", () => {
  // Honest accounting. PROPOSAL_DNA was ~6,455 characters. The briefing came
  // in at ~1,830 and then grew back to ~5,200 once the revision doctrine was
  // added, because those rules have to be known BEFORE the agent decides to
  // call read_proposal — they cannot be loaded on demand the way an exemplar
  // can. So the per-turn saving is real but modest.
  //
  // The actual win was never the token count: it is that the agent now has the
  // document instead of a description of it. This bound exists to stop the
  // briefing drifting back into being a substitute for reading a real one.
  it("stays smaller than the description it replaced", () => {
    expect(PROPOSAL_BRIEFING.length).toBeLessThan(6_000);
  });

  it("sends the agent to a real document before it writes", () => {
    expect(PROPOSAL_BRIEFING).toContain("read_example_proposal");
  });

  it("states that the agent chooses the structure", () => {
    expect(briefing).toContain("no fixed section list");
  });

  it("names the five non-negotiables", () => {
    const b = briefing;
    for (const phrase of ["what it costs", "what is included", "not included", "terms", "acceptance"]) {
      expect(b).toContain(phrase);
    }
  });

  it("tells the agent to write section by section, never in one call", () => {
    expect(PROPOSAL_BRIEFING).toContain("write_proposal_section");
    expect(briefing).toContain("one section at a time");
  });

  it("tells the agent to read a section before revising it", () => {
    expect(PROPOSAL_BRIEFING).toContain("read_proposal");
    expect(briefing).toContain("never revise from memory");
  });

  it("tells the agent to resolve a vague reference by looking, not by asking", () => {
    const b = briefing;
    expect(b).toContain("the second installment");
    expect(b).toContain("only after looking");
  });

  it("tells the agent to change one section and report what moved", () => {
    const b = briefing;
    expect(b).toContain("change one section");
    expect(b).toContain("say what moved, not what exists");
  });

  // The failure already in the transcripts: 1,637 characters describing a draft
  // that did not exist, with empty action_ids.
  it("forbids describing a revision that was never made", () => {
    expect(briefing).toContain("never describe a revision you did not actually make");
  });

  it("points 'put it back' at the restore action", () => {
    expect(PROPOSAL_BRIEFING).toContain("restore_proposal_version");
  });
});
