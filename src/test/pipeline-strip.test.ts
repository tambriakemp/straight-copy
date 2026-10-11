// The stage strip's figures and the stale threshold. All three decisions
// here render plausibly when wrong — a "$0.00" under a stage full of
// unpriced deals looks like a real number, and a deal that has sat for two
// months looks the same as one that arrived yesterday.
import { describe, it, expect } from "vitest";
import { stageTile, daysLabel, isStale, emptyCopy, STALE_DAYS } from "@/lib/pipelineStrip";

const stage = (over: Partial<Parameters<typeof stageTile>[0]> = {}) => ({
  key: "lead", label: "Lead", count: 1, totalCents: 0, ...over,
});

describe("stageTile", () => {
  it("leads with the count for a stage in progress", () => {
    // How many things are in it is what you would act on.
    const t = stageTile(stage({ count: 3, totalCents: 500_000 }));
    expect(t.value).toBe("3");
    expect(t.caption).toBe("$5,000");
    expect(t.dark).toBe(false);
  });

  it("leads with the money for Won", () => {
    // A count of 1 under "Won" tells you nothing. What you made does.
    const t = stageTile(stage({ key: "won", label: "Won", count: 1, totalCents: 500_000 }));
    expect(t.value).toBe("$5,000");
    expect(t.caption).toBe("1 deal");
    expect(t.dark).toBe(true);
  });

  it("pluralises the Won caption", () => {
    expect(stageTile(stage({ key: "won", count: 2, totalCents: 100 })).caption).toBe("2 deals");
  });

  it("says so plainly when a stage holds deals nobody has priced", () => {
    // "$0.00" there is a claim about their value.
    const t = stageTile(stage({ count: 2, totalCents: 0 }));
    expect(t.value).toBe("2");
    expect(t.caption).toBe("No amount set");
  });

  it("shows an em dash, not $0, for an empty stage", () => {
    // Nothing is in it, so there is no amount to be zero — "$0" reads as
    // a stage full of free work.
    const t = stageTile(stage({ count: 0, totalCents: 0 }));
    expect(t.value).toBe("0");
    expect(t.caption).toBe("—");
  });

  it("keeps Won dark even when it is empty", () => {
    expect(stageTile(stage({ key: "won", count: 0 })).dark).toBe(true);
  });

  it("falls back to the count when Won has deals but no amounts", () => {
    const t = stageTile(stage({ key: "won", count: 2, totalCents: 0 }));
    expect(t.value).toBe("2");
  });
});

describe("daysLabel", () => {
  it("pluralises", () => {
    expect(daysLabel(1)).toBe("1 day in stage");
    expect(daysLabel(51)).toBe("51 days in stage");
  });

  it("says Today rather than '0 days in stage'", () => {
    expect(daysLabel(0)).toBe("Today");
  });

  it("says nothing when it is unknown", () => {
    expect(daysLabel(null)).toBeNull();
    expect(daysLabel(undefined)).toBeNull();
    expect(daysLabel(-3)).toBeNull();
  });
});

describe("isStale", () => {
  it("fires at the threshold and above", () => {
    expect(isStale(STALE_DAYS)).toBe(true);
    expect(isStale(51)).toBe(true);
  });

  it("does not fire below it, or on an unknown age", () => {
    expect(isStale(STALE_DAYS - 1)).toBe(false);
    expect(isStale(1)).toBe(false);
    expect(isStale(null)).toBe(false);
  });
});

describe("emptyCopy", () => {
  it("says what would put something in the column, not 'No deals'", () => {
    expect(emptyCopy("intake")).toMatch(/intake chat/);
    expect(emptyCopy("signed")).toMatch(/deposit/);
  });

  it("has something to say about a column it does not know", () => {
    expect(emptyCopy("whatever")).toBeTruthy();
  });
});
