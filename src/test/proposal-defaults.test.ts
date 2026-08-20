// Bria asked for a legal entity name, phase names, a billing date, whether AI
// costs counted, and the strategic thesis — every one of which has an obvious
// professional default. These pin the instructions that say to decide instead.
import { describe, it, expect } from "vitest";
import { PROPOSAL_DNA } from "../../supabase/functions/_shared/agents/proposal-spine";

const dna = PROPOSAL_DNA.toLowerCase().replace(/\s+/g, " ");

describe("the writing brief tells her to decide, not ask", () => {
  it("asks for an assumptions block rather than questions", () => {
    expect(dna).toContain("assumed:");
    expect(dna).toContain("she corrects a line; she does not sit an interview");
  });

  it.each([
    ["the legal entity name", "legal entity name"],
    ["the signer's title", "the title their role"],
    ["phase names", "three phase names"],
    ["billing and payment terms", "billing date, payment terms"],
    ["AI and tooling costs", "ai and tooling costs"],
    ["scope depth", "how deep to scope"],
    ["the strategic thesis", "derive it from the scope"],
  ])("covers %s", (_label, phrase) => {
    expect(dna).toContain(phrase);
  });

  it("still refuses to invent a price", () => {
    // The one genuine exception — everything else is assumable, this is not.
    expect(dna).toContain("never to invent is a price");
  });

  it("reads the signer's name off the email when there is no contact name", () => {
    expect(dna).toContain("read the name from it");
  });
});
