// The branching that decides when a client's posts go out, whether a failure
// is worth retrying, and when a photo bucket is about to run dry.
import { describe, it, expect } from "vitest";
import {
  nextAttempt, isAuthFailure, sendability, runway, cadenceFor, spreadSlots,
} from "../../supabase/functions/_shared/social/schedule-policy";

const utc = (s: string) => new Date(`${s}Z`);

describe("nextAttempt", () => {
  const base = { maxAttempts: 2, retryAfterMinutes: 5 };
  const now = utc("2026-08-23T12:00:00");

  it("retries once, five minutes out", () => {
    const r = nextAttempt({ ...base, attempts: 1 }, now);
    expect(r.action).toBe("retry");
    if (r.action === "retry") {
      expect(r.scheduledAt.toISOString()).toBe("2026-08-23T12:05:00.000Z");
    }
  });

  it("gives up once the attempts are spent", () => {
    expect(nextAttempt({ ...base, attempts: 2 }, now).action).toBe("give_up");
    expect(nextAttempt({ ...base, attempts: 3 }, now).action).toBe("give_up");
  });

  it("gives up immediately when retries are switched off", () => {
    expect(nextAttempt({ ...base, maxAttempts: 1, attempts: 1 }, now).action)
      .toBe("give_up");
  });
});

describe("isAuthFailure", () => {
  it("recognises the errors only the client can fix", () => {
    expect(isAuthFailure("CoPost 401: unauthorized")).toBe(true);
    expect(isAuthFailure("CoPost 403: permission denied")).toBe(true);
    expect(isAuthFailure("Instagram token expired")).toBe(true);
    expect(isAuthFailure("Account disconnected — please reconnect")).toBe(true);
  });

  it("treats anything else as ours", () => {
    // Conservative on purpose: emailing a client to reconnect an account that
    // is fine is worse than opening a task for a blip.
    expect(isAuthFailure("CoPost 502: bad gateway")).toBe(false);
    expect(isAuthFailure("signed url failed")).toBe(false);
    expect(isAuthFailure("post has no rendered images")).toBe(false);
    expect(isAuthFailure("")).toBe(false);
  });
});

describe("sendability", () => {
  it("only sends an approved post that has images", () => {
    expect(sendability({ kind: "post", status: "approved", imageCount: 1 })).toBe("ok");
    expect(sendability({ kind: "post", status: "draft", imageCount: 1 })).toBe("not_approved");
    expect(sendability({ kind: "post", status: "error", imageCount: 1 })).toBe("not_approved");
    expect(sendability({ kind: "post", status: "approved", imageCount: 0 })).toBe("no_images");
  });

  it("refuses a post the Send button already published", () => {
    // The double-post guard: a human can send between scheduling and due time.
    expect(sendability({ kind: "post", status: "published", imageCount: 3 }))
      .toBe("already_sent");
  });

  it("refuses an image already sent or in flight", () => {
    const img = { kind: "image" as const, hasStoragePath: true };
    expect(sendability({ ...img, copostStatus: "idle" })).toBe("ok");
    expect(sendability({ ...img, copostStatus: "error" })).toBe("ok");
    expect(sendability({ ...img, copostStatus: "sent" })).toBe("already_sent");
    expect(sendability({ ...img, copostStatus: "sending" })).toBe("already_sent");
    expect(sendability({ kind: "image", copostStatus: "idle", hasStoragePath: false }))
      .toBe("no_images");
  });
});

describe("runway", () => {
  it("turns photos left into days left", () => {
    expect(runway(10, 5)).toEqual({ days: 14, severity: "ok" });
    expect(runway(5, 5)).toEqual({ days: 7, severity: "thin" });
    expect(runway(2, 5)).toEqual({ days: 2, severity: "critical" });
  });

  it("calls an empty bucket empty rather than zero days", () => {
    expect(runway(0, 5)).toEqual({ days: 0, severity: "empty" });
    expect(runway(-1, 5)).toEqual({ days: 0, severity: "empty" });
  });

  it("does not divide by a posting rate of zero", () => {
    expect(runway(3, 0).severity).toBe("ok");
  });
});

describe("cadenceFor", () => {
  it("adds the recap on Mondays and the review on the 1st", () => {
    expect(cadenceFor(utc("2026-08-24T12:00:00")).weekly).toBe(true);  // Monday
    expect(cadenceFor(utc("2026-08-25T12:00:00")).weekly).toBe(false); // Tuesday
    expect(cadenceFor(utc("2026-09-01T12:00:00")).monthly).toBe(true);
    expect(cadenceFor(utc("2026-09-02T12:00:00")).monthly).toBe(false);
  });

  it("can be both at once", () => {
    const c = cadenceFor(utc("2026-06-01T12:00:00")); // a Monday and the 1st
    expect(c.weekly).toBe(true);
    expect(c.monthly).toBe(true);
    expect(c.daily).toBe(true);
  });
});

describe("spreadSlots", () => {
  const base = {
    from: utc("2026-08-23T00:00:00"),
    horizonDays: 14,
    preferredHoursUtc: [14, 17, 21],
    postsPerWeek: 5,
    minGapHours: 6,
    taken: [] as Date[],
    count: 3,
  };

  it("books at the preferred hours, in order", () => {
    const slots = spreadSlots(base);
    expect(slots).toHaveLength(3);
    expect(slots[0].toISOString()).toBe("2026-08-23T14:00:00.000Z");
    expect(slots.every((s) => [14, 17, 21].includes(s.getUTCHours()))).toBe(true);
  });

  it("never books two posts closer together than the minimum gap", () => {
    const slots = spreadSlots({ ...base, count: 8 });
    for (let i = 1; i < slots.length; i++) {
      const gapHours =
        (slots[i].getTime() - slots[i - 1].getTime()) / 3_600_000;
      expect(gapHours).toBeGreaterThanOrEqual(6);
    }
  });

  it("counts already-booked slots against both caps", () => {
    // Topping up a calendar must not stack on top of a week that is full.
    const taken = [
      utc("2026-08-23T14:00:00"), utc("2026-08-24T14:00:00"),
      utc("2026-08-25T14:00:00"), utc("2026-08-26T14:00:00"),
      utc("2026-08-27T14:00:00"),
    ];
    const slots = spreadSlots({ ...base, taken, count: 3, horizonDays: 5 });
    for (const s of slots) {
      const inWindow = [...taken, ...slots].filter(
        (t) => t.getTime() > s.getTime() - 7 * 86_400_000 &&
          t.getTime() <= s.getTime(),
      ).length;
      expect(inWindow).toBeLessThanOrEqual(5);
    }
  });

  it("fits at most a week's worth into a single week", () => {
    // horizonDays 6 is days 0..6 — exactly seven days, so every slot shares
    // one window and the total is the cap.
    const slots = spreadSlots({ ...base, count: 40, horizonDays: 6 });
    expect(slots.length).toBeLessThanOrEqual(5);
  });

  it("caps over any rolling seven days, not per calendar week", () => {
    // Over a longer horizon the total legitimately exceeds the weekly cap —
    // early slots fall out of the window. The invariant is per-window, so
    // that is what gets asserted: no seven-day stretch holds more than five.
    const slots = spreadSlots({ ...base, count: 40, horizonDays: 21 });
    expect(slots.length).toBeGreaterThan(5);
    for (const s of slots) {
      const inWindow = slots.filter(
        (t) => t.getTime() > s.getTime() - 7 * 86_400_000 &&
          t.getTime() <= s.getTime(),
      ).length;
      expect(inWindow).toBeLessThanOrEqual(5);
    }
  });

  it("never books in the past", () => {
    const slots = spreadSlots({ ...base, from: utc("2026-08-23T18:00:00") });
    expect(slots[0].getTime()).toBeGreaterThan(utc("2026-08-23T18:00:00").getTime());
  });

  it("returns nothing rather than guessing when it has nothing to go on", () => {
    expect(spreadSlots({ ...base, count: 0 })).toEqual([]);
    expect(spreadSlots({ ...base, postsPerWeek: 0 })).toEqual([]);
    expect(spreadSlots({ ...base, preferredHoursUtc: [] })).toEqual([]);
  });
});
