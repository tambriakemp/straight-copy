// A lead's stage is free text written by the agent, not one of
// pipeline-board's keys, so the colour is guessed from the words. The
// fallback is the case worth pinning: an unrecognised stage must come back
// neutral, never green.
import { describe, it, expect } from "vitest";
import { stageTone, TONE_DOT } from "@/lib/pipelineTone";

describe("stageTone", () => {
  it("reads a close as green", () => {
    for (const s of ["Won", "won", "Signed", "Closed won", "Deposit paid"]) {
      expect(stageTone(s), s).toBe("green");
    }
  });

  it("reads a loss as red, even when it mentions a later stage", () => {
    expect(stageTone("Lost")).toBe("red");
    expect(stageTone("Lost after proposal sent")).toBe("red");
    expect(stageTone("Declined")).toBe("red");
  });

  it("reads something out for review as amber", () => {
    for (const s of ["Offer sent", "Proposal sent", "Quote out", "Estimate shared"]) {
      expect(stageTone(s), s).toBe("amber");
    }
  });

  it("reads a conversation in progress as blue", () => {
    for (const s of ["Intake", "Intake call booked", "Discovery meeting"]) {
      expect(stageTone(s), s).toBe("blue");
    }
  });

  it("falls back to neutral rather than guessing", () => {
    for (const s of ["Lead", "New prospect", "Parked", "???", "", null, undefined]) {
      expect(stageTone(s), String(s)).toBe("gray");
    }
  });

  it("has a dot colour for every tone it can return", () => {
    // The dot is looked up by the tone, so a tone with no entry renders a
    // transparent dot and nothing says so.
    for (const tone of ["green", "red", "amber", "blue", "gray"] as const) {
      expect(TONE_DOT[tone], tone).toBeTruthy();
    }
  });
});
