import { describe, expect, it } from "vitest";

/**
 * Which proposal states still accept a signature.
 *
 * Mirrors the guards at the top of proposal-sign's `sign` handler. That module
 * imports Deno globals and cannot be imported here, so the rule is restated —
 * and pinned, because it is a commercial rule rather than a technical one and
 * would otherwise be easy to relax by accident.
 *
 * Bree: "It should be a hard block because price and timeline could change
 * based off of if they want to continue the project in the future." A declined
 * proposal quoted a price for a decision made then. Letting someone sign it
 * weeks later binds us to numbers we may no longer be able to honour.
 */
type Status = "draft" | "sent" | "signed" | "voided" | "declined";

function refusalForSigning(status: Status): string | null {
  if (status === "signed") return "Already signed";
  if (status === "voided") return "Proposal voided";
  if (status === "declined") {
    return "This proposal was declined and can no longer be signed. " +
      "Ask us for a new one and we will re-quote it.";
  }
  return null;
}

describe("a declined proposal is closed for good", () => {
  it("refuses the signature", () => {
    expect(refusalForSigning("declined")).not.toBeNull();
  });

  it("says why, and points at the way forward rather than just saying no", () => {
    const msg = refusalForSigning("declined")!;
    expect(msg).toMatch(/declined/i);
    expect(msg).toMatch(/no longer be signed/i);
    expect(msg).toMatch(/new one|re-quote/i);
  });

  it("is refused for the same reason a voided one is — terminal, not an error", () => {
    expect(refusalForSigning("voided")).not.toBeNull();
    expect(refusalForSigning("signed")).not.toBeNull();
  });
});

describe("the states that can still be signed", () => {
  it.each(["draft", "sent"] as const)("%s still accepts a signature", (s) => {
    expect(refusalForSigning(s)).toBeNull();
  });

  // Guards against the previous behaviour coming back: signing used to clear
  // declined_at and go through, which is exactly what must no longer happen.
  it("has no state that both reads declined and accepts a signature", () => {
    const signable = (["draft", "sent", "signed", "voided", "declined"] as Status[])
      .filter((s) => refusalForSigning(s) === null);
    expect(signable).not.toContain("declined");
  });
});
