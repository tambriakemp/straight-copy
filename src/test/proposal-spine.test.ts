import { describe, expect, it } from "vitest";
import {
  NON_NEGOTIABLES,
  PALETTE,
  renderProposalHtml,
  reviewProposal,
  writtenSections,
  type ProposalContent,
} from "../../supabase/functions/_shared/agents/proposal-spine";

/** A minimal complete proposal — nothing like twelve sections, and that is the point. */
const complete = (): ProposalContent => ({
  kind: "marketing retainer",
  cover: { project_name: "Menovia.ai", prepared_for: "Dr. Khadra Kahin" },
  sections: [
    { heading: "The Opportunity", summary: "Why this matters now", body: "The app is live. Now she has to find it." },
    { heading: "Investment & Pass-Throughs", body: "**$750/mo.** Ad spend passed through at cost." },
    { heading: "What's Included", body: "- ASO foundation\n- Paid acquisition" },
    { heading: "What's Not Included", body: "Organic social is out of scope." },
    { heading: "Terms & Next Steps", body: "Billed monthly, thirty days notice." },
    { heading: "Acceptance", body: "Signing accepts the scope above." },
  ],
});

describe("writtenSections", () => {
  it("keeps document order rather than imposing one", () => {
    const headings = writtenSections(complete()).map((s) => s.heading);
    expect(headings[0]).toBe("The Opportunity");
    expect(headings.at(-1)).toBe("Acceptance");
  });

  it("drops sections with nothing in them", () => {
    const c: ProposalContent = {
      sections: [
        { heading: "Written", body: "Real content." },
        { heading: "Empty", body: "   " },
        { heading: "Missing" },
      ],
    };
    expect(writtenSections(c)).toHaveLength(1);
  });

  it("accepts a proposal of any length — there is no required count", () => {
    const two: ProposalContent = {
      sections: [
        { heading: "Investment", body: "$30,000 in three installments." },
        { heading: "Acceptance", body: "Sign here." },
      ],
    };
    expect(writtenSections(two)).toHaveLength(2);
  });
});

describe("reviewProposal", () => {
  it("passes a document that covers all five non-negotiables", () => {
    const review = reviewProposal(complete());
    expect(review.missing).toEqual([]);
    expect(review.sectionCount).toBe(6);
    expect(review.bodyChars).toBeGreaterThan(0);
  });

  // The whole reason the old gate was removed: it refused to save.
  it("NEVER blocks — it reports", () => {
    const empty = reviewProposal({});
    expect(empty.notes.length).toBeGreaterThan(0);
    expect(empty.sectionCount).toBe(0);
    // No throw, no error field. Callers save regardless.
  });

  it("flags a draft with no pricing anywhere", () => {
    const c = complete();
    c.sections = c.sections!.filter((s) => !/Investment/.test(s.heading ?? ""));
    const review = reviewProposal(c);
    expect(review.missing).toContain("what it costs and when it is paid");
    expect(review.notes.join(" ")).toMatch(/costs/);
  });

  it("flags a missing acceptance section", () => {
    const c = complete();
    c.sections = c.sections!.filter((s) => !/Acceptance/.test(s.heading ?? ""));
    expect(reviewProposal(c).missing).toContain("an acceptance or signature section");
  });

  it("finds a non-negotiable in the body, not only the heading", () => {
    const c: ProposalContent = {
      sections: [
        { heading: "Engagement Summary", body: "Total investment is $30,000, paid in three installments." },
      ],
    };
    expect(reviewProposal(c).missing).not.toContain("what it costs and when it is paid");
  });

  it("notices sections with no heading", () => {
    const c: ProposalContent = { sections: [{ body: "Orphaned prose." }] };
    expect(reviewProposal(c).notes.join(" ")).toMatch(/no heading/);
  });

  it("covers all five non-negotiables", () => {
    expect(NON_NEGOTIABLES).toHaveLength(5);
    expect(NON_NEGOTIABLES.map((n) => n.key)).toEqual([
      "price", "included", "excluded", "terms", "acceptance",
    ]);
  });
});

describe("renderProposalHtml", () => {
  it("numbers sections by position, not by any fixed list", () => {
    const html = renderProposalHtml("Menovia", complete());
    expect(html).toContain("01 — THE OPPORTUNITY");
    expect(html).toContain("06 — ACCEPTANCE");
  });

  it("renders a two-section proposal without complaint", () => {
    const html = renderProposalHtml("Small", {
      sections: [
        { heading: "Investment", body: "$30,000." },
        { heading: "Acceptance", body: "Sign here." },
      ],
    });
    expect(html).toContain("01 — INVESTMENT");
    expect(html).toContain("02 — ACCEPTANCE");
    // Nothing invented to fill a spine it no longer has.
    expect(html).not.toContain("has not been written yet");
  });

  it("puts the summary on the contents page when there is one", () => {
    const html = renderProposalHtml("Menovia", complete());
    expect(html).toContain("Why this matters now");
  });

  it("renders an in-progress draft rather than erroring", () => {
    const html = renderProposalHtml("Half done", {
      sections: [{ heading: "The Opportunity", body: "Only this so far." }],
    });
    expect(html).toContain("Only this so far.");
  });

  it("escapes markup in agent-written content", () => {
    const html = renderProposalHtml("X", {
      sections: [{ heading: "<script>", body: "5 < 6 & 7 > 2" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("uses the Cre8 Visions palette", () => {
    const html = renderProposalHtml("X", complete());
    expect(html).toContain(PALETTE.bronze);
    expect(html).toContain(PALETTE.ink);
  });
});

describe("PALETTE", () => {
  // Verified byte-for-byte against Menovia_Marketing_Proposal_1.docx.
  it("matches the colours in the real document", () => {
    expect(PALETTE).toMatchObject({
      cream: "#F5F2EE",
      warmWhite: "#FAFAF8",
      stone: "#C8C0B4",
      taupe: "#A89F94",
      charcoal: "#2A2825",
      ink: "#1A1916",
      bronze: "#8B7355",
      softGray: "#9A938A",
    });
  });
});
