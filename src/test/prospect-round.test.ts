// The cutoff is a standing rule, not a stored date, so nothing catches it
// being wrong: a header reading "Monday, Oct 12 at 9:00 AM" when the real
// deadline was this morning looks exactly as convincing as one that is right.
import { describe, it, expect } from "vitest";
import { nextCutoffLabel, daysToCutoff, roundProgress } from "@/lib/prospectRound";

// 15:00Z is 10am Central year-round, so these are unambiguous.
const at = (iso: string) => new Date(iso);

describe("nextCutoffLabel", () => {
  it("names the coming Monday from mid-week", () => {
    // Thu Oct 8 2026 → Mon Oct 12.
    expect(nextCutoffLabel(at("2026-10-08T15:00:00Z"))).toBe("Monday, Oct 12 at 9:00 AM");
  });

  it("still says today on the morning of the cutoff", () => {
    // Mon Oct 12, 8am Central — nine has not happened yet.
    expect(nextCutoffLabel(at("2026-10-12T13:00:00Z"))).toBe("Monday, Oct 12 at 9:00 AM");
  });

  it("rolls to next week once nine has passed", () => {
    // Mon Oct 12, 10am Central — this round is over.
    expect(nextCutoffLabel(at("2026-10-12T15:00:00Z"))).toBe("Monday, Oct 19 at 9:00 AM");
  });

  it("counts from Sunday to the very next day", () => {
    expect(nextCutoffLabel(at("2026-10-11T15:00:00Z"))).toBe("Monday, Oct 12 at 9:00 AM");
  });

  it("crosses a month end", () => {
    // Fri Oct 30 2026 → Mon Nov 2.
    expect(nextCutoffLabel(at("2026-10-30T15:00:00Z"))).toBe("Monday, Nov 2 at 9:00 AM");
  });

  it("stays on Monday through a DST change", () => {
    // US DST ends Sun Nov 1 2026. Counted in whole days, not 7 × 24 hours,
    // so the week containing it does not slide to Sunday.
    expect(nextCutoffLabel(at("2026-10-28T15:00:00Z"))).toMatch(/^Monday, Nov 2/);
    expect(nextCutoffLabel(at("2026-11-04T15:00:00Z"))).toMatch(/^Monday, Nov 9/);
  });
});

describe("daysToCutoff", () => {
  it("is 0 on the morning of and 7 once it has passed", () => {
    expect(daysToCutoff(at("2026-10-12T13:00:00Z"))).toBe(0);
    expect(daysToCutoff(at("2026-10-12T15:00:00Z"))).toBe(7);
  });

  it("counts down across the week", () => {
    expect(daysToCutoff(at("2026-10-11T15:00:00Z"))).toBe(1); // Sunday
    expect(daysToCutoff(at("2026-10-08T15:00:00Z"))).toBe(4); // Thursday
  });
});

describe("roundProgress", () => {
  const statuses = (a: number, r: number, p: number) => [
    ...Array<"approved">(a).fill("approved"),
    ...Array<"rejected">(r).fill("rejected"),
    ...Array<"pending">(p).fill("pending"),
  ];

  it("counts each outcome", () => {
    const g = roundProgress(statuses(3, 2, 5), 0);
    expect(g).toMatchObject({ approved: 3, sentBack: 2, pending: 5, total: 10, pct: 50 });
  });

  it("does not let skipped fill the bar", () => {
    // Skipping is looking and moving on. It is still in the pile at the
    // cutoff, so a full bar on a round where nothing was approved would be
    // the most misleading thing on the page.
    const g = roundProgress(statuses(0, 0, 10), 10);
    expect(g.skipped).toBe(10);
    expect(g.pct).toBe(0);
    expect(g.pending).toBe(10);
  });

  it("cannot report more skipped than are left pending", () => {
    // The skip count is per session; deciding something you skipped
    // earlier must not leave the tally above the work remaining.
    expect(roundProgress(statuses(8, 0, 2), 5).skipped).toBe(2);
  });

  it("is all zeroes for an empty round", () => {
    expect(roundProgress([], 0)).toMatchObject({ total: 0, pct: 0, approved: 0 });
  });

  it("reaches 100 only when everything is decided", () => {
    expect(roundProgress(statuses(5, 5, 0), 0).pct).toBe(100);
    expect(roundProgress(statuses(5, 4, 1), 0).pct).toBe(90);
  });
});
