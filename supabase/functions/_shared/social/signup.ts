// Turning social-plan signup answers into the rows the CRM expects.
//
// Import-free so the frontend test suite can cover it. Everything here is a
// pure function of its input — the shape of a client, a project's posting
// settings, and the intake blob the brand voice generator reads.

/** The only channels the social plan covers. */
export const CHANNELS = ["facebook", "instagram", "tiktok"] as const;
export type Channel = (typeof CHANNELS)[number];

export const DEFAULT_POSTS_PER_WEEK = 5;
export const MAX_POSTS_PER_WEEK = 14;

export interface SignupInput {
  email?: string;
  contact_name?: string;
  business_name?: string;
  phone?: string;
  timezone?: string;
  /** What the business does, in their words. Feeds the brand voice. */
  what_they_do?: string;
  /** The thing they most want promoted. */
  primary_offer?: string;
  /** Free text: current offers, campaigns, seasonal notes. */
  promote?: string;
  /** Hard no-gos — topics, claims, words. */
  avoid?: string;
  /** Three to five words for how they want to sound. */
  tone_words?: string;
  channels?: string[];
  posts_per_week?: number | string;
  preferred_days?: string[];
  /** Must be true. Publishing under someone's brand needs their say-so. */
  consent?: boolean;
}

export interface NormalizedSignup {
  email: string;
  contact_name: string | null;
  business_name: string | null;
  phone: string | null;
  timezone: string;
  channels: Channel[];
  posts_per_week: number;
  preferred_days: string[];
  what_they_do: string | null;
  primary_offer: string | null;
  promote: string | null;
  avoid: string | null;
  tone_words: string | null;
  consent: boolean;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function text(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Whether a string is a timezone this runtime recognises.
 *
 * Checked rather than trusted because the whole point of collecting it is that
 * posting times are computed from it — an unrecognised zone that silently fell
 * back to UTC would put a California client's posts out at 6am with nothing to
 * show anyone had got it wrong.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeSignup(input: SignupInput): NormalizedSignup {
  const tz = text(input.timezone, 64) ?? "";
  const requested = Number(input.posts_per_week);

  return {
    email: (text(input.email, 320) ?? "").toLowerCase(),
    contact_name: text(input.contact_name, 200),
    business_name: text(input.business_name, 200),
    phone: text(input.phone, 40),
    timezone: isValidTimezone(tz) ? tz : "UTC",
    channels: (input.channels ?? [])
      .map((c) => String(c).toLowerCase().trim())
      .filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c)),
    posts_per_week: Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_POSTS_PER_WEEK)
      : DEFAULT_POSTS_PER_WEEK,
    preferred_days: (input.preferred_days ?? [])
      .map((d) => String(d).toLowerCase().slice(0, 3))
      .filter((d) => DAYS.includes(d)),
    what_they_do: text(input.what_they_do),
    primary_offer: text(input.primary_offer),
    promote: text(input.promote),
    avoid: text(input.avoid),
    tone_words: text(input.tone_words, 200),
    consent: input.consent === true,
  };
}

/**
 * What is missing before this signup can be taken.
 *
 * Empty means it is good to go. Consent is on the list because publishing to
 * someone's accounts without a recorded yes is not something to discover later.
 */
export function signupProblems(s: NormalizedSignup): string[] {
  const problems: string[] = [];
  if (!s.email.includes("@")) problems.push("A valid email is required");
  if (!s.business_name) problems.push("Business name is required");
  if (!s.channels.length) problems.push("Pick at least one of Facebook, Instagram or TikTok");
  if (!s.consent) problems.push("We need your permission to post on your accounts");
  if (!s.what_they_do && !s.primary_offer) {
    // generate-brand-voice refuses to run on an empty intake, so a signup that
    // says nothing about the business would produce a client Iris can only
    // write generically for.
    problems.push("Tell us what the business does, or what you most want promoted");
  }
  return problems;
}

/** The `client_projects.social_settings` blob. Read whole by Iris's gatherer. */
export function projectSettings(s: NormalizedSignup): Record<string, unknown> {
  return {
    channels: s.channels,
    posts_per_week: s.posts_per_week,
    preferred_days: s.preferred_days,
    promote: s.promote,
    avoid: s.avoid,
  };
}

/**
 * The `clients.intake_data` blob.
 *
 * Keys chosen to match what generate-brand-voice already reads — it guards on
 * `what_they_do || primary_offer || tone_words` and refuses to run without one
 * of them, so a signup that does not produce these silently leaves the client
 * with no brand voice and Iris writing generically forever.
 */
export function intakeData(s: NormalizedSignup): Record<string, unknown> {
  return {
    business: s.business_name,
    business_name: s.business_name,
    name: s.contact_name,
    contact_name: s.contact_name,
    what_they_do: s.what_they_do,
    primary_offer: s.primary_offer ?? s.promote,
    tone_words: s.tone_words,
    things_to_avoid: s.avoid,
    channels: s.channels,
    source: "social_plan_signup",
  };
}
