import { describe, expect, it } from "vitest";
import { elapsedSince, formatDuration, formatDurationOrNull } from "../lib/duration";

describe("formatDuration", () => {
  it("reads seconds under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("reads minutes and seconds past a minute, not raw seconds", () => {
    expect(formatDuration(124_000)).toBe("2m 4s");
    expect(formatDuration(61_000)).toBe("1m 1s");
  });

  it("drops the seconds on a whole minute", () => {
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(60_000)).toBe("1m");
  });

  it("never goes negative", () => {
    expect(formatDuration(-5000)).toBe("0s");
  });
});

describe("formatDurationOrNull", () => {
  // Older messages predate the column; "0s" would claim they were instant.
  it("says nothing rather than zero when the duration is missing", () => {
    expect(formatDurationOrNull(null)).toBeNull();
    expect(formatDurationOrNull(undefined)).toBeNull();
  });

  it("still formats a real zero", () => {
    expect(formatDurationOrNull(0)).toBe("0s");
  });

  it("refuses a non-finite value rather than rendering NaN", () => {
    expect(formatDurationOrNull(Number.NaN)).toBeNull();
    expect(formatDurationOrNull(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("elapsedSince", () => {
  it("measures forward from the timestamp", () => {
    const start = "2026-08-20T12:00:00.000Z";
    const now = new Date("2026-08-20T12:00:34.000Z").getTime();
    expect(elapsedSince(start, now)).toBe(34_000);
  });

  it("floors at zero when the clock disagrees", () => {
    const start = "2026-08-20T12:00:10.000Z";
    const now = new Date("2026-08-20T12:00:00.000Z").getTime();
    expect(elapsedSince(start, now)).toBe(0);
  });

  it("treats an unparseable timestamp as no time at all", () => {
    expect(elapsedSince("not a date")).toBe(0);
  });
});
