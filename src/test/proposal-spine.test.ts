// The structure is the product. These tests exist so a proposal can never
// silently lose a section or gain one, and so a draft with holes is caught
// before it reaches a client rather than after.
import { describe, it, expect } from "vitest";
import {
  BUILD_SECTIONS,
  PROPOSAL_SECTIONS,
  RETAINER_SECTIONS,
  missingSections,
  renderProposalHtml,
  spineFor,
  type ProposalContent,
} from "../../supabase/functions/_shared/agents/proposal-spine";

const full = (): ProposalContent => ({
  cover: { project_name: "Menovia", prepared_for: "Dr. Khadra Kahin" },
  sections: PROPOSAL_SECTIONS.map((s) => ({ key: s.key, heading: s.heading, body: `Body for ${s.key}.` })),
});

describe("the locked spine", () => {
  it("is exactly fourteen sections", () => {
    expect(PROPOSAL_SECTIONS).toHaveLength(14);
  });

  it("has no duplicate keys", () => {
    const keys = PROPOSAL_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("opens on the opportunity and closes on acceptance", () => {
    expect(PROPOSAL_SECTIONS[0].key).toBe("opportunity");
    expect(PROPOSAL_SECTIONS[PROPOSAL_SECTIONS.length - 1].key).toBe("acceptance");
  });
});

describe("missingSections", () => {
  it("passes a complete draft", () => {
    expect(missingSections(full())).toEqual([]);
  });

  it("names what was skipped", () => {
    const c = full();
    c.sections = c.sections!.filter((s) => s.key !== "approach" && s.key !== "investment");
    expect(missingSections(c).sort()).toEqual(["approach", "investment"]);
  });

  it("treats an empty body as missing, not present", () => {
    // A section that exists but says nothing renders as a hole, which is the
    // failure this guard is for.
    const c = full();
    c.sections!.find((s) => s.key === "approach")!.body = "   ";
    expect(missingSections(c)).toEqual(["approach"]);
  });

  it("reports every section missing for an empty draft", () => {
    expect(missingSections({})).toHaveLength(14);
  });
});

describe("renderProposalHtml", () => {
  it("renders all fourteen headings in spine order", () => {
    const html = renderProposalHtml("Menovia", full());
    // Headings are escaped on the way out ("Terms & Conditions"), so match the
    // escaped form rather than the source string.
    const esc = (t: string) => t.replace(/&/g, "&amp;");
    const positions = PROPOSAL_SECTIONS.map((s) => html.indexOf(`>${esc(s.heading)}<`));
    expect(positions.every((p) => p > -1)).toBe(true);
    // Order is part of the contract, not just presence.
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("drops an optional section the agent left out rather than printing a hole", () => {
    const c = full();
    c.sections = c.sections!.filter((s) => s.key !== "ai");
    const html = renderProposalHtml("Menovia", c);
    expect(html).not.toContain("AI in Development");
  });

  it("marks an unwritten essential section rather than dropping it", () => {
    const c = full();
    c.sections = c.sections!.filter((s) => s.key !== "investment");
    const html = renderProposalHtml("Menovia", c);
    expect(html).toContain("Investment &amp; Payment Schedule");
    expect(html).toContain("has not been written yet");
  });

  it("renders a section the agent invented rather than discarding it", () => {
    const c = full();
    c.sections!.push({ key: "case_study", heading: "Comparable Work", body: "A body." });
    const html = renderProposalHtml("Menovia", c);
    expect(html).toContain("Comparable Work");
  });


  it("escapes markup in client-supplied text", () => {
    const c = full();
    c.cover = { project_name: "<script>alert(1)</script>" };
    const html = renderProposalHtml("x", c);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the four markdown constructs the brief allows", () => {
    const c = full();
    c.sections!.find((s) => s.key === "approach")!.body =
      "## Why this\nA lead line.\n- **Focus** — one thing\n> The bottom line.";
    const html = renderProposalHtml("x", c);
    expect(html).toContain("<h3>Why this</h3>");
    expect(html).toContain("<p>A lead line.</p>");
    expect(html).toContain("<strong>Focus</strong>");
    expect(html).toContain("<blockquote>The bottom line.</blockquote>");
  });
});


describe("the retainer spine", () => {
  const retainer = (): ProposalContent => ({
    kind: "retainer",
    cover: { project_name: "Menovia", price_line: "Monthly retainer: $900" },
    sections: RETAINER_SECTIONS.map((s) => ({ key: s.key, heading: s.heading, body: `Body for ${s.key}.` })),
  });

  it("is a different document, not the build spine renamed", () => {
    expect(RETAINER_SECTIONS).toHaveLength(7);
    const buildKeys = new Set(BUILD_SECTIONS.map((s) => s.key));
    // The month-by-month is the part a retainer client actually reads, and the
    // build spine has nowhere to put it.
    expect(buildKeys.has("timeline")).toBe(false);
    expect(RETAINER_SECTIONS.some((s) => s.key === "timeline")).toBe(true);
  });

  it("validates a retainer against its own spine, not the build one", () => {
    expect(missingSections(retainer())).toEqual([]);
    // The same content judged as a build would be missing almost everything.
    expect(missingSections({ ...retainer(), kind: "build" }).length).toBeGreaterThan(10);
  });

  it("renders seven sections for a retainer and fourteen for a build", () => {
    const html = renderProposalHtml("Menovia", retainer());
    expect(html).toContain("Month by Month");
    expect(html).not.toContain("Ownership &amp; IP");
    expect(html).toContain("Monthly retainer: $900");
  });

  it("falls back to the build spine for an unknown or missing kind", () => {
    expect(spineFor(undefined)).toBe(BUILD_SECTIONS);
    expect(spineFor("nonsense")).toBe(BUILD_SECTIONS);
    expect(spineFor("retainer")).toBe(RETAINER_SECTIONS);
  });

  it("keeps PROPOSAL_SECTIONS pointing at the build spine", () => {
    expect(PROPOSAL_SECTIONS).toBe(BUILD_SECTIONS);
  });
});
