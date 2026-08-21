import { describe, expect, it } from "vitest";
import {
  reviewProposal,
  writtenSections,
  type ProposalContent,
  type ProposalSectionContent,
} from "../../supabase/functions/_shared/agents/proposal-spine";

/**
 * The section-write rule, extracted so it can be tested without a database.
 *
 * This mirrors the `write_proposal_section` executor in actions.ts: an existing
 * heading replaces in place, anything else appends. Replacing in place is what
 * keeps document order stable — a revised section must not jump to the end just
 * because it was rewritten.
 */
function applySection(
  sections: ProposalSectionContent[],
  written: ProposalSectionContent,
  replace?: string | boolean,
): { sections: ProposalSectionContent[]; action: "replaced" | "appended"; position: number } {
  const next = [...sections];
  const target = (typeof replace === "string" && replace.trim()
    ? replace
    : written.heading ?? ""
  ).trim().toLowerCase();
  const at = next.findIndex((s) => (s.heading ?? "").trim().toLowerCase() === target);
  if (at >= 0) {
    next[at] = written;
    return { sections: next, action: "replaced", position: at + 1 };
  }
  next.push(written);
  return { sections: next, action: "appended", position: next.length };
}

const draft = (): ProposalSectionContent[] => [
  { heading: "The Opportunity", body: "The app is live. Now she has to find it." },
  { heading: "Investment & Pass-Throughs", body: "**$750/mo.** Three installments." },
  { heading: "Acceptance", body: "Signing accepts the scope above." },
];

describe("writing a proposal a section at a time", () => {
  it("starts from nothing and builds up", () => {
    let sections: ProposalSectionContent[] = [];
    for (const h of ["The Opportunity", "Engagement Summary", "Acceptance"]) {
      sections = applySection(sections, { heading: h, body: `Body of ${h}.` }).sections;
    }
    expect(sections.map((s) => s.heading)).toEqual([
      "The Opportunity", "Engagement Summary", "Acceptance",
    ]);
  });

  it("appends a new section at the end", () => {
    const r = applySection(draft(), { heading: "Terms", body: "Billed monthly." });
    expect(r.action).toBe("appended");
    expect(r.position).toBe(4);
  });

  // The revision invariant. This is the one that matters.
  it("replaces in place, leaving every other section byte-identical", () => {
    const before = draft();
    const r = applySection(before, {
      heading: "Investment & Pass-Throughs",
      body: "**$600/mo.** Second installment reduced.",
    });

    expect(r.action).toBe("replaced");
    expect(r.position).toBe(2);
    expect(r.sections[1].body).toContain("$600");

    // Neighbours untouched, and still in the same order.
    expect(r.sections[0]).toEqual(before[0]);
    expect(r.sections[2]).toEqual(before[2]);
    expect(r.sections.map((s) => s.heading)).toEqual(before.map((s) => s.heading));
  });

  it("matches a heading regardless of case or surrounding space", () => {
    const r = applySection(draft(), { heading: "  acceptance  ", body: "Updated." });
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(3);
  });

  it("can rename a section via replace without moving it", () => {
    const r = applySection(
      draft(),
      { heading: "Investment", body: "Renamed and rewritten." },
      "Investment & Pass-Throughs",
    );
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(2);
    expect(r.sections[1].heading).toBe("Investment");
    expect(r.sections).toHaveLength(3);
  });

  // The failure mode the one-shot write had: lose one part, lose everything.
  it("keeps what was already written when a later section never arrives", () => {
    let sections: ProposalSectionContent[] = [];
    sections = applySection(sections, { heading: "One", body: "First." }).sections;
    sections = applySection(sections, { heading: "Two", body: "Second." }).sections;
    // Third write never happens — the turn ran out of budget.
    const content: ProposalContent = { sections };
    expect(writtenSections(content)).toHaveLength(2);
    expect(reviewProposal(content).sectionCount).toBe(2);
  });

  it("reports what is still missing after each write, without refusing any of them", () => {
    let sections: ProposalSectionContent[] = [];
    sections = applySection(sections, { heading: "The Opportunity", body: "Why now." }).sections;
    const early = reviewProposal({ sections });
    expect(early.missing.length).toBeGreaterThan(0);

    for (const [h, b] of [
      ["Investment", "$30,000 paid in three installments."],
      ["What's Included", "- Everything listed above"],
      ["What's Not Included", "Out of scope: hosting."],
      ["Terms", "Governed by Georgia law."],
      ["Acceptance", "Signing accepts this scope."],
    ] as const) {
      sections = applySection(sections, { heading: h, body: b }).sections;
    }
    expect(reviewProposal({ sections }).missing).toEqual([]);
  });
});

describe("section-addressable reads", () => {
  /** Mirrors runReadProposal's matching: exact first, then substring. */
  const find = (sections: ProposalSectionContent[], wanted: string) => {
    const w = wanted.trim().toLowerCase();
    const exact = sections.findIndex((s) => (s.heading ?? "").trim().toLowerCase() === w);
    return exact >= 0
      ? exact
      : sections.findIndex((s) => (s.heading ?? "").toLowerCase().includes(w));
  };

  it("resolves a vague reference to the right section", () => {
    expect(find(draft(), "investment")).toBe(1);
    expect(find(draft(), "pass-through")).toBe(1);
  });

  it("prefers an exact heading over a substring elsewhere", () => {
    const sections: ProposalSectionContent[] = [
      { heading: "Investment & Pass-Throughs", body: "..." },
      { heading: "Investment", body: "..." },
    ];
    expect(find(sections, "Investment")).toBe(1);
  });

  it("reports no match rather than guessing", () => {
    expect(find(draft(), "prescriptions")).toBe(-1);
  });
});

// The exact payload that failed in production on 21 Aug, repeatedly:
// "(p.replace ?? p.heading).trim is not a function". The tool schema said
// `replace?`, which reads as a boolean flag, so the model sent `replace: true`
// and every rewrite died with the error showing in the chat.
describe("a boolean in replace must not crash the write", () => {
  it("treats replace: true as 'the section named in heading'", () => {
    const r = applySection(
      draft(),
      { heading: "Investment & Pass-Throughs", body: "**$600/mo.**" },
      true,
    );
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(2);
    expect(r.sections[1].body).toContain("$600");
  });

  it("treats replace: false the same way rather than throwing", () => {
    const r = applySection(draft(), { heading: "Acceptance", body: "Updated." }, false);
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(3);
  });

  it("still renames in place when replace is a real heading", () => {
    const r = applySection(
      draft(),
      { heading: "Investment", body: "Renamed." },
      "Investment & Pass-Throughs",
    );
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(2);
    expect(r.sections[1].heading).toBe("Investment");
  });

  it("ignores an empty string in replace", () => {
    const r = applySection(draft(), { heading: "Acceptance", body: "Updated." }, "   ");
    expect(r.action).toBe("replaced");
    expect(r.position).toBe(3);
  });
});
