// Bria kept saying a proposal had been drafted when nothing had been written.
// These pin the difference between claiming work and offering to do it.
import { describe, it, expect } from "vitest";
import { claimsUnperformedWork } from "../../supabase/functions/_shared/agents/claims";

describe("claimsUnperformedWork", () => {
  it("catches a reply that says the document exists", () => {
    expect(claimsUnperformedWork("I've drafted the proposal for Menovia.")).toBe(true);
    expect(claimsUnperformedWork("Here is the draft — let me know.")).toBe(true);
    expect(claimsUnperformedWork("It has been filed against the project.")).toBe(true);
  });

  it("leaves offers and plans alone", () => {
    expect(claimsUnperformedWork("I can draft the proposal if you'd like.")).toBe(false);
    expect(claimsUnperformedWork("Shall I create one for Menovia?")).toBe(false);
    expect(claimsUnperformedWork("Menovia is on a retainer of $4,500/month.")).toBe(false);
  });

  it("respects an explicit retraction", () => {
    expect(claimsUnperformedWork("I haven't drafted it yet — I need the budget first.")).toBe(false);
  });

  it("treats an empty reply as no claim", () => {
    expect(claimsUnperformedWork("")).toBe(false);
    expect(claimsUnperformedWork(null)).toBe(false);
  });
});
