// Scheduling is the piece most likely to fail silently: a bug means agents
// either never fire, or fire on every 15-minute dispatcher tick. These pin the
// exact module the dispatcher runs.
import { describe, it, expect } from "vitest";
import {
  fieldMatches, cronMatches, isDue, latestSlotOnOrBefore, nextRunAfter,
} from "../../supabase/functions/_shared/agents/schedule";

const utc = (s: string) => new Date(`${s}Z`);

describe("fieldMatches", () => {
  it("handles wildcards, exact values, ranges, lists and steps", () => {
    expect(fieldMatches("*", 7)).toBe(true);
    expect(fieldMatches("7", 7)).toBe(true);
    expect(fieldMatches("7", 8)).toBe(false);
    expect(fieldMatches("1-5", 3)).toBe(true);
    expect(fieldMatches("1-5", 6)).toBe(false);
    expect(fieldMatches("1,3,5", 3)).toBe(true);
    expect(fieldMatches("1,3,5", 4)).toBe(false);
    expect(fieldMatches("*/6", 12)).toBe(true);
    expect(fieldMatches("*/6", 13)).toBe(false);
    expect(fieldMatches("0-30/10", 20)).toBe(true);
    expect(fieldMatches("0-30/10", 25)).toBe(false);
  });

  it("rejects malformed fields rather than matching everything", () => {
    expect(fieldMatches("abc", 3)).toBe(false);
    expect(fieldMatches("5/0", 5)).toBe(false);
  });
});

describe("cronMatches", () => {
  it("matches a weekday morning schedule only on weekdays", () => {
    // 2026-08-19 is a Wednesday; 2026-08-22 a Saturday.
    expect(cronMatches("0 12 * * 1-5", utc("2026-08-19T12:00:00"))).toBe(true);
    expect(cronMatches("0 12 * * 1-5", utc("2026-08-22T12:00:00"))).toBe(false);
  });

  it("is minute-exact", () => {
    expect(cronMatches("0 12 * * *", utc("2026-08-19T12:00:00"))).toBe(true);
    expect(cronMatches("0 12 * * *", utc("2026-08-19T12:01:00"))).toBe(false);
  });

  it("rejects a cron without exactly five fields", () => {
    expect(cronMatches("0 12 * *", utc("2026-08-19T12:00:00"))).toBe(false);
    expect(cronMatches("0 12 * * * *", utc("2026-08-19T12:00:00"))).toBe(false);
  });
});

describe("isDue", () => {
  const CRON = "0 12 * * *"; // daily at noon UTC

  it("fires when the slot has passed and there is no prior run", () => {
    expect(isDue(CRON, null, utc("2026-08-19T12:07:00"))).toBe(true);
  });

  it("does not fire before the slot", () => {
    expect(isDue(CRON, null, utc("2026-08-19T11:59:00"))).toBe(false);
  });

  it("does not fire twice for the same slot", () => {
    // Already ran at 12:02; the 12:14 dispatcher tick must not re-run it.
    expect(isDue(CRON, "2026-08-19T12:02:00Z", utc("2026-08-19T12:14:00"))).toBe(false);
  });

  it("fires again the next day", () => {
    expect(isDue(CRON, "2026-08-19T12:02:00Z", utc("2026-08-20T12:03:00"))).toBe(true);
  });

  it("still fires after a missed tick rather than skipping the day", () => {
    // Dispatcher was down over noon and only woke at 15:40.
    expect(isDue(CRON, "2026-08-18T12:01:00Z", utc("2026-08-19T15:40:00"))).toBe(true);
  });

  it("respects day-of-week restrictions", () => {
    // Monday-only, checked on a Wednesday.
    expect(isDue("0 12 * * 1", null, utc("2026-08-19T13:00:00"))).toBe(false);
    // 2026-08-17 is a Monday.
    expect(isDue("0 12 * * 1", null, utc("2026-08-17T13:00:00"))).toBe(true);
  });

  it("handles a multi-slot schedule, firing once per slot", () => {
    const every6 = "0 */6 * * *"; // 00:00, 06:00, 12:00, 18:00
    expect(isDue(every6, "2026-08-19T06:01:00Z", utc("2026-08-19T11:00:00"))).toBe(false);
    expect(isDue(every6, "2026-08-19T06:01:00Z", utc("2026-08-19T12:05:00"))).toBe(true);
  });
});

describe("latestSlotOnOrBefore", () => {
  it("returns the most recent slot today, not a future one", () => {
    const slot = latestSlotOnOrBefore("0 */6 * * *", utc("2026-08-19T13:30:00"));
    expect(slot?.toISOString()).toBe("2026-08-19T12:00:00.000Z");
  });

  it("returns null before the day's first slot", () => {
    expect(latestSlotOnOrBefore("0 12 * * *", utc("2026-08-19T06:00:00"))).toBeNull();
  });
});

describe("nextRunAfter", () => {
  it("finds the next daily slot", () => {
    expect(nextRunAfter("0 12 * * *", utc("2026-08-19T13:00:00"))?.toISOString())
      .toBe("2026-08-20T12:00:00.000Z");
  });

  it("skips the weekend for a weekday schedule", () => {
    // From Friday afternoon, the next weekday run is Monday.
    expect(nextRunAfter("0 12 * * 1-5", utc("2026-08-21T13:00:00"))?.toISOString())
      .toBe("2026-08-24T12:00:00.000Z");
  });

  it("returns null for a malformed cron instead of scanning forever", () => {
    expect(nextRunAfter("nonsense", utc("2026-08-19T13:00:00"))).toBeNull();
  });
});
