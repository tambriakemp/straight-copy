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
  // HONEST ACCOUNTING, third revision of this number and the last.
  //
  // PROPOSAL_DNA was 6,455 characters. The briefing replaced it at ~1,830,
  // then grew to ~5,200 with the revision doctrine, and now sits at ~6,340
  // with the section-formatting rules. It is the same size as the thing it
  // replaced. I claimed a 72% saving early on and that claim was wrong.
  //
  // The token count was never the win and framing it that way was a mistake.
  // The win is that the agent has the real documents to read instead of only a
  // description of them, and that everything here is a rule it must know
  // BEFORE deciding to read one — which is precisely why it cannot be loaded
  // on demand the way an exemplar can.
  //
  // So this is a ceiling against unbounded growth, not a shrinkage claim.
  // Anything that can wait until the agent is actually writing belongs in the
  // exemplar's front matter, not here.
  it("stays within its ceiling", () => {
    expect(PROPOSAL_BRIEFING.length).toBeLessThan(8_000);
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

  it("tells the agent not to number its own headings", () => {
    expect(briefing).toContain("do not put a number in the heading");
  });

  it("tells the agent to open a section with a bold one-line thesis", () => {
    expect(briefing).toContain("one-line thesis on its own line, in bold");
  });

  // Bree: "the engagement summary didn't have a call out of the pricing before
  // it started talking about pricing."
  it("tells the agent to lead with the numbers before explaining them", () => {
    expect(briefing).toContain("lead with the numbers, then explain them");
  });

  it("points 'put it back' at the restore action", () => {
    expect(PROPOSAL_BRIEFING).toContain("restore_proposal_version");
  });
});
