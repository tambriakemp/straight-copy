// What a signup form produces, and what the CRM needs, are different shapes.
// These pin the mapping — including the one that decides whether the client
// ends up with a brand voice at all.
import { describe, it, expect } from "vitest";
import {
  normalizeSignup, signupProblems, projectSettings, intakeData,
  isValidTimezone, DEFAULT_POSTS_PER_WEEK, MAX_POSTS_PER_WEEK,
} from "../../supabase/functions/_shared/social/signup";

const good = {
  email: "  Owner@Example.COM ",
  contact_name: "Jane Doe",
  business_name: "Menovia",
  timezone: "America/Los_Angeles",
  channels: ["Instagram", "TikTok", "myspace"],
  posts_per_week: "4",
  preferred_days: ["monday", "WED", "funday"],
  what_they_do: "Hormone health for women over 40",
  primary_offer: "Initial consult",
  avoid: "No medical claims",
  tone_words: "warm, plain, unhurried",
  consent: true,
};

describe("normalizeSignup", () => {
  it("lowercases the email and trims it", () => {
    expect(normalizeSignup(good).email).toBe("owner@example.com");
  });

  it("keeps only channels the plan actually covers", () => {
    expect(normalizeSignup(good).channels).toEqual(["instagram", "tiktok"]);
  });

  it("clamps the posting rate and defaults a missing one", () => {
    expect(normalizeSignup(good).posts_per_week).toBe(4);
    expect(normalizeSignup({ ...good, posts_per_week: 999 }).posts_per_week).toBe(MAX_POSTS_PER_WEEK);
    expect(normalizeSignup({ ...good, posts_per_week: 0 }).posts_per_week).toBe(DEFAULT_POSTS_PER_WEEK);
    expect(normalizeSignup({ ...good, posts_per_week: "nonsense" }).posts_per_week).toBe(DEFAULT_POSTS_PER_WEEK);
  });

  it("keeps only real weekdays", () => {
    expect(normalizeSignup(good).preferred_days).toEqual(["mon", "wed"]);
  });

  it("falls back to UTC for a timezone this runtime does not know", () => {
    expect(normalizeSignup({ ...good, timezone: "Mars/Olympus" }).timezone).toBe("UTC");
    expect(normalizeSignup({ ...good, timezone: undefined }).timezone).toBe("UTC");
    expect(normalizeSignup(good).timezone).toBe("America/Los_Angeles");
  });

  it("treats consent as false unless it is exactly true", () => {
    expect(normalizeSignup({ ...good, consent: undefined }).consent).toBe(false);
    expect(normalizeSignup({ ...good, consent: "yes" as unknown as boolean }).consent).toBe(false);
  });
});

describe("isValidTimezone", () => {
  it("accepts real zones and rejects the rest", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("signupProblems", () => {
  it("passes a complete signup", () => {
    expect(signupProblems(normalizeSignup(good))).toEqual([]);
  });

  it("refuses without consent to post", () => {
    const p = signupProblems(normalizeSignup({ ...good, consent: false }));
    expect(p.join(" ")).toMatch(/permission/i);
  });

  it("refuses without a channel, an email, or a business name", () => {
    expect(signupProblems(normalizeSignup({ ...good, channels: [] })).length).toBe(1);
    expect(signupProblems(normalizeSignup({ ...good, email: "nope" })).length).toBe(1);
    expect(signupProblems(normalizeSignup({ ...good, business_name: "" })).length).toBe(1);
  });

  it("refuses when nothing describes the business", () => {
    // generate-brand-voice hard-refuses an empty intake, so letting this
    // through means a client whose captions are generic forever.
    const p = signupProblems(normalizeSignup({
      ...good, what_they_do: "", primary_offer: "",
    }));
    expect(p.join(" ")).toMatch(/what the business does/i);
  });
});

describe("intakeData", () => {
  it("produces at least one key generate-brand-voice will accept", () => {
    // Its guard is `what_they_do || primary_offer || tone_words`. Miss all
    // three and it returns 400 and the client never gets a voice.
    const d = intakeData(normalizeSignup(good));
    expect(d.what_they_do || d.primary_offer || d.tone_words).toBeTruthy();
  });

  it("falls back to what they want promoted when they skipped the offer", () => {
    const d = intakeData(normalizeSignup({
      ...good, primary_offer: "", promote: "Spring package",
    }));
    expect(d.primary_offer).toBe("Spring package");
  });
});

describe("projectSettings", () => {
  it("carries the per-client posting rules Iris reads", () => {
    const s = projectSettings(normalizeSignup(good));
    expect(s).toMatchObject({
      channels: ["instagram", "tiktok"],
      posts_per_week: 4,
      preferred_days: ["mon", "wed"],
      avoid: "No medical claims",
    });
  });
});
