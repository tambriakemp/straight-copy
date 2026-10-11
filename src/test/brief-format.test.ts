// The brief writes machine timestamps and a title that usually carries its
// own date. Both went to the screen verbatim — a pill reading "Cutoff
// 2026-10-12T09:00" and a header reading "… Oct 10, 2026 · Oct 11, 2026".
import { describe, it, expect } from "vitest";
import { formatMoment, briefHeadline, weekRangeLabel, dayLabel } from "@/lib/briefFormat";

describe("formatMoment", () => {
  it("turns a timestamp into the words the canvas prints", () => {
    const out = formatMoment("2026-10-12T09:00");
    expect(out).toMatch(/Mon/);
    expect(out).toMatch(/Oct 12/);
    expect(out).toMatch(/9:00/);
  });

  it("leaves a date with no time as a date", () => {
    expect(formatMoment("2026-10-12")).toMatch(/Mon.*Oct 12/);
    expect(formatMoment("2026-10-12")).not.toMatch(/\d:\d\d/);
  });

  it("leaves a human phrase alone", () => {
    // The brief is written by an agent and already sends free text for
    // some of these. Mangling "Usual time" into "Invalid Date" is worse
    // than printing it as written.
    for (const s of ["Usual time", "Monday 9 AM", "before the cutoff"]) {
      expect(formatMoment(s), s).toBe(s);
    }
  });

  it("gives nothing back for nothing", () => {
    expect(formatMoment(null)).toBeNull();
    expect(formatMoment("   ")).toBeNull();
  });

  it("does not turn an unparseable timestamp into Invalid Date", () => {
    expect(formatMoment("2026-13-45T99:99")).toBe("2026-13-45T99:99");
  });
});

describe("briefHeadline", () => {
  it("does not print the date twice when the title already has one", () => {
    // The bug: a brief titled for Oct 10 that landed at 00:17 on Oct 11
    // printed both, and they disagree — which is exactly when you most
    // want to know which day it covers.
    const out = briefHeadline("Saturday catch-up brief · Oct 10, 2026", "2026-10-11T00:17:00");
    expect(out).toContain("Oct 10, 2026");
    expect(out).not.toContain("Oct 11, 2026");
    expect(out).toMatch(/posted/);
  });

  it("adds the date when the title has none", () => {
    const out = briefHeadline("Morning brief", "2026-10-11T08:25:00");
    expect(out).toContain("Oct 11, 2026");
    expect(out).toMatch(/posted/);
  });

  it("survives a timestamp it cannot read", () => {
    expect(briefHeadline("Morning brief", "not a date")).toBe("Morning brief");
  });
});

describe("weekRangeLabel", () => {
  it("collapses a same-month range to one month name", () => {
    expect(weekRangeLabel(["2026-10-11", "2026-10-13", "2026-10-17"])).toBe("Oct 11 – 17");
  });

  it("names both months when the week straddles one", () => {
    expect(weekRangeLabel(["2026-10-30", "2026-11-02"])).toBe("Oct 30 – Nov 2");
  });

  it("is unbothered by unsorted input", () => {
    expect(weekRangeLabel(["2026-10-17", "2026-10-11"])).toBe("Oct 11 – 17");
  });

  it("says nothing for an empty week", () => {
    expect(weekRangeLabel([])).toBeNull();
  });
});

describe("dayLabel", () => {
  it("reads as weekday and date", () => {
    expect(dayLabel("2026-10-12", new Date("2026-10-11T12:00:00")).label).toMatch(/Mon.*12/);
  });

  it("knows which day is today", () => {
    // Parsed at noon, so a viewer behind or ahead of UTC still lands on
    // the same calendar day.
    expect(dayLabel("2026-10-11", new Date("2026-10-11T23:30:00")).isToday).toBe(true);
    expect(dayLabel("2026-10-12", new Date("2026-10-11T23:30:00")).isToday).toBe(false);
  });
});
