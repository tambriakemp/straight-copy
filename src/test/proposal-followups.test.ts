import { describe, expect, it } from "vitest";
import {
  buildFollowupAgenda,
  classifyProposal,
  needingHuman,
  needingNudge,
  summariseAgenda,
  type FollowupThresholds,
  type ProposalSignal,
} from "../../supabase/functions/_shared/agents/followups";

// A fixed clock. Every elapsed figure below is exact rather than approximate,
// which is the point of a 48-hour promise.
const NOW = Date.parse("2026-08-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

const T: FollowupThresholds = {
  followupAfterDays: 2,
  maxFollowups: 3,
  staleAfterDays: 21,
  meetingLink: "https://book.example.com/proposal",
};

function signal(over: Partial<ProposalSignal> = {}): ProposalSignal {
  return {
    id: "p1",
    title: "Marketing retainer",
    status: "sent",
    client: "Menovia",
    client_id: "c1",
    client_email: "hello@menovia.test",
    project: "Menovia marketing",
    sent_at: daysAgo(6),
    last_activity_at: daysAgo(6),
    first_opened_at: null,
    first_viewed_at: null,
    client_signed_at: null,
    declined_at: null,
    followups_sent: 0,
    ...over,
  };
}

describe("the 48-hour window", () => {
  it("leaves a proposal alone inside the window", () => {
    const o = classifyProposal(signal({ sent_at: hoursAgo(30), last_activity_at: hoursAgo(30) }), T, NOW);
    expect(o.bucket).toBe("waiting");
    expect(o.nudge).toBeNull();
  });

  // Rounding is what makes a promise about hours untrue. At 47 hours a rounded
  // day count says 2 and the proposal would be chased an hour early.
  it("does not chase at 47 hours", () => {
    const o = classifyProposal(signal({ sent_at: hoursAgo(47), last_activity_at: hoursAgo(47) }), T, NOW);
    expect(o.days_quiet).toBe(1);
    expect(o.bucket).toBe("waiting");
  });

  it("chases at 48 hours", () => {
    const o = classifyProposal(signal({ sent_at: hoursAgo(48), last_activity_at: hoursAgo(48) }), T, NOW);
    expect(o.days_quiet).toBe(2);
    expect(o.bucket).toBe("never_opened");
    expect(o.nudge).toBeTruthy();
  });

  it("still takes the threshold from config rather than the default", () => {
    const slow = { ...T, followupAfterDays: 7 };
    expect(classifyProposal(signal(), slow, NOW).bucket).toBe("waiting");
    expect(classifyProposal(signal(), T, NOW).bucket).toBe("never_opened");
  });
});

describe("one proposal, one bucket", () => {
  it("separates never-opened from read-but-unsigned", () => {
    const unopened = classifyProposal(signal(), T, NOW);
    const read = classifyProposal(signal({ first_opened_at: daysAgo(5) }), T, NOW);
    expect(unopened.bucket).toBe("never_opened");
    expect(read.bucket).toBe("read_unsigned");
    expect(unopened.nudge).not.toEqual(read.nudge);
  });

  // The whole value of the split: asking someone to decide about a document
  // they have never opened is the failure this prevents.
  it("never asks for a decision on something unread", () => {
    const n = classifyProposal(signal(), T, NOW).nudge!;
    expect(n).toMatch(/reached them|resend/i);
    expect(n).toMatch(/do not ask for a decision/i);
  });

  it("offers the meeting link only to someone who has read it", () => {
    expect(classifyProposal(signal({ first_opened_at: daysAgo(5) }), T, NOW).nudge)
      .toContain("https://book.example.com/proposal");
    expect(classifyProposal(signal(), T, NOW).nudge)
      .not.toContain("https://book.example.com/proposal");
  });

  it("invites the question without a link when none is configured", () => {
    const n = classifyProposal(
      signal({ first_opened_at: daysAgo(5) }), { ...T, meetingLink: null }, NOW,
    ).nudge!;
    expect(n).toMatch(/never invent a URL/i);
    expect(n).not.toContain("http");
  });

  it("treats a long silence as stale whether or not it was ever opened", () => {
    const cold = signal({ sent_at: daysAgo(40), last_activity_at: daysAgo(40) });
    expect(classifyProposal(cold, T, NOW).bucket).toBe("stale");
    expect(classifyProposal({ ...cold, first_opened_at: daysAgo(39) }, T, NOW).bucket).toBe("stale");
  });
});

describe("the ceiling", () => {
  it("flags a proposal at the cap for a human instead of chasing it", () => {
    const o = classifyProposal(signal({ followups_sent: 3 }), T, NOW);
    expect(o.bucket).toBe("capped");
    expect(o.needs_human).toBe(true);
    expect(o.nudge).toBeNull();
  });

  // The cap is checked before any reason to send, so a proposal cannot be
  // chased a fourth time by qualifying under a different heading.
  it("holds even when the proposal would otherwise be stale", () => {
    const o = classifyProposal(
      signal({ followups_sent: 5, sent_at: daysAgo(60), last_activity_at: daysAgo(60) }), T, NOW,
    );
    expect(o.bucket).toBe("capped");
    expect(o.nudge).toBeNull();
  });

  it("still chases one below the cap", () => {
    expect(classifyProposal(signal({ followups_sent: 2 }), T, NOW).bucket).toBe("never_opened");
  });
});

// The reason the decline feature and the follow-up feature shipped together:
// without a decline, "no" and "silence" are the same row.
describe("a decline ends the follow-up", () => {
  it("drops a declined proposal out of every nudge list", () => {
    const o = classifyProposal(
      signal({ status: "declined", declined_at: daysAgo(1) }), T, NOW,
    );
    expect(o.bucket).toBe("closed");
    expect(o.nudge).toBeNull();
    expect(o.needs_human).toBe(false);
  });

  it("drops it even when the status column has not caught up", () => {
    const o = classifyProposal(signal({ declined_at: daysAgo(1) }), T, NOW);
    expect(o.bucket).toBe("closed");
    expect(o.nudge).toBeNull();
  });

  it("says declined rather than signed", () => {
    const o = classifyProposal(signal({ status: "declined", declined_at: daysAgo(3) }), T, NOW);
    expect(o.headline).toMatch(/declined/i);
    expect(o.headline).not.toMatch(/signed/i);
  });

  it("closes a signed proposal the same way", () => {
    const o = classifyProposal(
      signal({ status: "signed", client_signed_at: daysAgo(2) }), T, NOW,
    );
    expect(o.bucket).toBe("closed");
    expect(o.nudge).toBeNull();
  });
});

describe("what a run reports", () => {
  const agenda = () => buildFollowupAgenda([
    signal({ id: "a", client: "Aviya Telemed", sent_at: daysAgo(6), last_activity_at: daysAgo(6) }),
    signal({ id: "b", client: "Menovia", first_opened_at: daysAgo(4), last_activity_at: daysAgo(4) }),
    signal({ id: "c", client: "Magna", status: "signed", client_signed_at: daysAgo(1) }),
    signal({ id: "d", client: "Corva", status: "declined", declined_at: daysAgo(2) }),
    signal({ id: "e", client: "Halden", followups_sent: 3 }),
    signal({ id: "f", client: "Ivory", status: "draft", sent_at: null, last_activity_at: daysAgo(9) }),
  ], T, NOW);

  it("drafts exactly one email per proposal that needs one", () => {
    const ids = needingNudge(agenda()).map((o) => o.proposal_id);
    expect(ids).toEqual(["a", "b"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("routes the capped and the unsent to a human, not to the client", () => {
    const ids = needingHuman(agenda()).map((o) => o.proposal_id).sort();
    expect(ids).toEqual(["e", "f"]);
    expect(needingHuman(agenda()).every((o) => o.nudge === null)).toBe(true);
  });

  it("names the client and the wait in every headline", () => {
    for (const o of agenda()) {
      expect(o.headline).toContain(o.client!);
      expect(o.headline.length).toBeGreaterThan(10);
    }
  });

  it("reports the actionable ones first and the finished ones last", () => {
    const order = agenda().map((o) => o.proposal_id);
    expect(order.slice(0, 2)).toEqual(["a", "b"]);
    expect(order.slice(-2).sort()).toEqual(["c", "d"]);
  });

  it("keeps every proposal, so nothing is silently omitted", () => {
    expect(agenda()).toHaveLength(6);
  });

  it("summarises the work rather than the row count", () => {
    expect(summariseAgenda(agenda())).toBe(
      "2 proposals past the follow-up window, and 2 needing a decision from you.",
    );
  });

  it("says so plainly when there is nothing outstanding", () => {
    const quiet = buildFollowupAgenda(
      [signal({ status: "signed", client_signed_at: daysAgo(1) })], T, NOW,
    );
    expect(summariseAgenda(quiet)).toMatch(/nothing outstanding/i);
  });
});
