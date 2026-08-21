import { describe, expect, it } from "vitest";
import {
  liftThesis,
  renderProposalHtml,
  stripSectionNumber,
} from "../../supabase/functions/_shared/agents/proposal-spine";
import { collapseProposalWrites } from "../components/admin/agent/collapseProposalWrites";
import { ASIDE_MIN, ASIDE_MAX, clampAside, maxForViewport } from "../components/admin/agent/useAsideWidth";

// Exactly what Bria wrote for the Menovia retainer, v13.
const REAL = {
  heading: "02 — ENGAGEMENT SUMMARY",
  summary: "The retainer at a glance",
  body:
    "**The retainer, at a glance.**\n\nThe management retainer covers every service.\n\n" +
    "**WHAT WE PRODUCE**\n\nVideo scripts — short form.\n\n" +
    "**Organic social media.** No content calendar, no posting schedule.",
};

describe("stripSectionNumber", () => {
  it("removes a number the agent already put in the heading", () => {
    expect(stripSectionNumber("02 — ENGAGEMENT SUMMARY")).toBe("ENGAGEMENT SUMMARY");
    expect(stripSectionNumber("1 - Terms")).toBe("Terms");
    expect(stripSectionNumber("11 – Acceptance")).toBe("Acceptance");
  });

  it("leaves an unnumbered heading alone", () => {
    expect(stripSectionNumber("The Opportunity")).toBe("The Opportunity");
  });

  // "90 Days" must not lose its number.
  it("does not eat a number that is part of the title", () => {
    expect(stripSectionNumber("The First 90 Days")).toBe("The First 90 Days");
  });
});

describe("liftThesis", () => {
  it("takes a leading all-bold line as the thesis", () => {
    const { thesis, rest } = liftThesis("**The app is live.**\n\nNow the work.");
    expect(thesis).toBe("The app is live.");
    expect(rest).toBe("Now the work.");
  });

  it("leaves a bold lead-in inside a paragraph alone", () => {
    const body = "**Organic social media.** No content calendar.";
    expect(liftThesis(body)).toEqual({ thesis: "", rest: body });
  });

  it("leaves a body with no bold opener alone", () => {
    expect(liftThesis("Plain prose.").thesis).toBe("");
  });
});

describe("the rendered section", () => {
  const html = renderProposalHtml("Menovia", { sections: [REAL] });

  // "the section sub description has the section number in it twice"
  it("numbers the section exactly once", () => {
    expect(html).toContain("01 — ENGAGEMENT SUMMARY");
    expect(html).not.toContain("01 — 02 —");
  });

  // The h2 used to just restate the eyebrow.
  it("puts the thesis in the heading, not a repeat of the eyebrow", () => {
    expect(html).toContain("<h2>The retainer, at a glance.</h2>");
    expect(html).not.toContain("<h2>02 — ENGAGEMENT SUMMARY</h2>");
  });

  it("does not leave the thesis in the body as well", () => {
    expect(html).not.toContain("<strong>The retainer, at a glance.</strong>");
  });

  // "sub headings don't really standout"
  it("renders an all-bold line as a subhead", () => {
    expect(html).toContain("<h3>WHAT WE PRODUCE</h3>");
    expect(html).not.toContain("<p><strong>WHAT WE PRODUCE</strong></p>");
  });

  it("still treats a bold lead-in as a paragraph", () => {
    expect(html).toContain("<strong>Organic social media.</strong> No content calendar, no posting schedule.");
    expect(html).not.toContain("<h3>Organic social media.</h3>");
  });

  it("falls back to the heading when a section has no thesis", () => {
    const plain = renderProposalHtml("X", {
      sections: [{ heading: "03 — TERMS", body: "Billed monthly." }],
    });
    expect(plain).toContain("<h2>TERMS</h2>");
  });

  it("strips the number from the contents entry too", () => {
    expect(html).toContain('<span class="h">ENGAGEMENT SUMMARY</span>');
  });
});

describe("aside width", () => {
  it("never lets the panel crush the chat on a narrow window", () => {
    // 1280px laptop: 232 rail + 420 minimum chat leaves 628 for the panel.
    expect(maxForViewport(1280)).toBe(628);
    // A width saved on a wide monitor must come back down.
    expect(Math.min(900, maxForViewport(1280))).toBe(628);
  });

  it("keeps a floor so the panel stays worth showing", () => {
    expect(maxForViewport(600)).toBe(ASIDE_MIN);
    expect(clampAside(50)).toBe(ASIDE_MIN);
    expect(clampAside(5000)).toBe(ASIDE_MAX);
  });
});

describe("collapsing the chat's proposal cards", () => {
  const act = (id: string, kind: string, proposal_id?: string) =>
    ({ id, kind, status: "executed", result: proposal_id ? { proposal_id } : null }) as never;

  it("shows one card for a proposal written in eleven writes", () => {
    const actions = [
      act("a", "create_proposal_draft", "p1"),
      ...Array.from({ length: 10 }, (_, i) => act(`w${i}`, "write_proposal_section", "p1")),
    ];
    expect(collapseProposalWrites(actions)).toHaveLength(1);
  });

  it("keeps the document where it first appeared in the thread", () => {
    const actions = [
      act("task", "create_task"),
      act("a", "create_proposal_draft", "p1"),
      act("w", "write_proposal_section", "p1"),
      act("email", "draft_email"),
    ];
    const out = collapseProposalWrites(actions);
    expect(out.map((a) => a.id)).toEqual(["task", "w", "email"]);
  });

  it("keeps two different proposals apart", () => {
    const actions = [
      act("a", "write_proposal_section", "p1"),
      act("b", "write_proposal_section", "p2"),
    ];
    expect(collapseProposalWrites(actions)).toHaveLength(2);
  });

  it("leaves unrelated actions alone", () => {
    const actions = [act("t", "create_task"), act("e", "draft_email")];
    expect(collapseProposalWrites(actions)).toHaveLength(2);
  });
});
