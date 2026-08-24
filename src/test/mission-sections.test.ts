// "Delete from here to somewhere" is the shape of edit that silently removed
// two sections of a migration earlier in this project. This one runs against
// every agent's mission on every turn, so it gets pinned.
import { describe, it, expect } from "vitest";
import { withoutSection } from "../../supabase/functions/_shared/agents/mission-sections";

const mission = `Your job is the thing.

## First job

Do the first thing.

## What a run produces

A run is not a chat turn. Nobody asked you anything.

## What you never do

You never send anything yourself.`;

describe("withoutSection", () => {
  it("removes the named section and nothing else", () => {
    const out = withoutSection(mission, "## What a run produces");
    expect(out).not.toContain("A run is not a chat turn");
    // The important half: what comes AFTER survives.
    expect(out).toContain("## What you never do");
    expect(out).toContain("You never send anything yourself.");
    expect(out).toContain("## First job");
    expect(out).toContain("Your job is the thing.");
  });

  it("leaves a mission without that heading completely untouched", () => {
    // Most agents have no such section. They must come through unchanged.
    const plain = "Your job is the thing.\n\n## Only job\n\nDo it.";
    expect(withoutSection(plain, "## What a run produces")).toBe(plain);
  });

  it("handles the section being last", () => {
    const trailing = `Do the thing.

## What a run produces

Say what you found.`;
    expect(withoutSection(trailing, "## What a run produces")).toBe("Do the thing.");
  });

  it("handles the section being first", () => {
    const leading = `## What a run produces

Say what you found.

## What you never do

Never.`;
    const out = withoutSection(leading, "## What a run produces");
    expect(out).toContain("## What you never do");
    expect(out).not.toContain("Say what you found");
  });

  it("does not collapse the rest of the document into one blob", () => {
    const out = withoutSection(mission, "## What a run produces");
    expect(out.split("\n## ").length).toBe(3); // intro + two surviving headings
  });

  it("keeps every real agent mission section that is not the target", () => {
    // A guard against the regex or the slice widening. If this ever removes
    // more than one heading, the agent loses rules it is bound by.
    const before = (mission.match(/^## /gm) ?? []).length;
    const after = (withoutSection(mission, "## What a run produces").match(/^## /gm) ?? []).length;
    expect(after).toBe(before - 1);
  });
});
