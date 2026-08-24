// The decisions behind a posting schedule, with no database and no network.
//
// Import-free for the same reason as copost.ts — the frontend test suite
// imports it directly. Everything here is a pure function of its arguments, so
// the branching that decides when a client's posts go out, whether a failure
// is worth retrying, and when a photo bucket is about to run dry can be tested
// exhaustively rather than observed in production.
//
// The shapes below are declared locally rather than imported from the
// generated Supabase types: those live under the app's tsconfig and this file
// has to be readable from a Deno edge function too.

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

export interface AttemptState {
  attempts: number;
  maxAttempts: number;
  retryAfterMinutes: number;
}

export type NextAttempt =
  | { action: "retry"; scheduledAt: Date }
  | { action: "give_up" };

/**
 * What to do with a send that just failed.
 *
 * `attempts` is incremented when the row is CLAIMED, not here, so by the time
 * a failure is being handled the count already includes the attempt that just
 * failed. One retry covers the overwhelmingly common case — a transient 502,
 * a signed URL that expired a minute early — and giving up after that is what
 * stops a genuinely broken post from cycling forever.
 */
export function nextAttempt(state: AttemptState, now: Date): NextAttempt {
  if (state.attempts >= state.maxAttempts) return { action: "give_up" };
  return {
    action: "retry",
    scheduledAt: new Date(now.getTime() + state.retryAfterMinutes * 60_000),
  };
}

/**
 * Whether a CoPost error is the client's to fix rather than ours.
 *
 * An expired or revoked social token is the single most common way a client's
 * posting stops, and no amount of retrying fixes it — only the client
 * reconnecting the account does. Telling those apart from a transient failure
 * is what decides between opening a task for Bree and emailing the client.
 *
 * Deliberately conservative: an unrecognised error is treated as ours, because
 * emailing a client to reconnect an account that is fine is worse than opening
 * a task that turns out to be a blip.
 */
export function isAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  if (/\b(401|403)\b/.test(m)) return true;
  return [
    "unauthorized",
    "unauthorised",
    "token expired",
    "expired token",
    "invalid token",
    "invalid_grant",
    "reconnect",
    "re-authenticate",
    "reauthenticate",
    "account disconnected",
    "not connected",
    "permission denied",
  ].some((needle) => m.includes(needle));
}

// ---------------------------------------------------------------------------
// Sendability
// ---------------------------------------------------------------------------

export type Sendability = "ok" | "not_approved" | "already_sent" | "no_images";

export interface PostTarget {
  kind: "post";
  status: string;
  imageCount: number;
}

export interface ImageTarget {
  kind: "image";
  copostStatus: string;
  hasStoragePath: boolean;
}

/**
 * Re-checked at send time, not just at schedule time, and that is the point.
 *
 * A post can be sent by hand through the existing "Send to CoPost" button
 * between the moment it was scheduled and the moment it comes due. Without
 * this check the button and the dispatcher both send it and the client gets
 * the same post twice.
 */
export function sendability(target: PostTarget | ImageTarget): Sendability {
  if (target.kind === "post") {
    if (target.status === "published") return "already_sent";
    if (target.status !== "approved") return "not_approved";
    if (target.imageCount < 1) return "no_images";
    return "ok";
  }
  if (target.copostStatus === "sent" || target.copostStatus === "sending") {
    return "already_sent";
  }
  if (!target.hasStoragePath) return "no_images";
  return "ok";
}

// ---------------------------------------------------------------------------
// Photo runway
// ---------------------------------------------------------------------------

export type RunwaySeverity = "ok" | "thin" | "critical" | "empty";

export interface Runway {
  days: number;
  severity: RunwaySeverity;
}

/**
 * How long a client's remaining photos will last at their posting rate.
 *
 * An empty photo bucket is the thing that silently stops a client posting —
 * nothing errors, nothing fails, the calendar just quietly has nothing to put
 * in it. Naming the number of days left is what turns that into something
 * anyone can act on.
 *
 * The thresholds are a week and three days: a week is enough notice for a
 * client to go and take some photos, and three days is the point where asking
 * again politely has stopped working.
 */
export function runway(unpostedCount: number, postsPerWeek: number): Runway {
  if (unpostedCount <= 0) return { days: 0, severity: "empty" };
  if (postsPerWeek <= 0) return { days: Infinity, severity: "ok" };
  const days = Math.floor((unpostedCount / postsPerWeek) * 7);
  if (days <= 3) return { days, severity: "critical" };
  if (days <= 7) return { days, severity: "thin" };
  return { days, severity: "ok" };
}

// ---------------------------------------------------------------------------
// Report cadence
// ---------------------------------------------------------------------------

export interface Cadence {
  /** Every run. */
  daily: true;
  /** Mondays — the recap across every marketing client. */
  weekly: boolean;
  /** The 1st — the per-client month in review. */
  monthly: boolean;
}

/**
 * Which reports are due on a given day.
 *
 * An agent has exactly one `schedule_cron`, so the alternative to deciding
 * this from the date is three more agent rows doing three-quarters of the same
 * work. The run reads the flags and writes the sections that apply.
 *
 * UTC throughout, matching `schedule_cron`.
 */
export function cadenceFor(now: Date): Cadence {
  return {
    daily: true,
    weekly: now.getUTCDay() === 1,
    monthly: now.getUTCDate() === 1,
  };
}

// ---------------------------------------------------------------------------
// Timezone
// ---------------------------------------------------------------------------

/**
 * How far the given zone is from UTC at that instant, in milliseconds.
 *
 * Done by formatting the instant in the target zone and reading the wall clock
 * back, because there is no other way without a timezone database — and
 * shipping one for this would be absurd when Intl already has it.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as 24 in some locales/runtimes.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The instant at which it is `hour` o'clock on that date, in that zone.
 *
 * Two passes on purpose. The offset depends on the instant, and the instant is
 * what we are solving for, so the first guess can land on the wrong side of a
 * daylight-saving boundary — which is exactly the week a client's posts would
 * silently go out an hour early and nobody would connect the two.
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour: number, timeZone: string,
): Date {
  const wallClock = Date.UTC(year, month, day, hour);
  const first = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  const second = wallClock - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Calendar date and weekday as seen in that zone, not in UTC. */
export function localParts(
  instant: Date, timeZone: string,
): { year: number; month: number; day: number; weekday: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: (parts.weekday ?? "").toLowerCase().slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Spreading posts across the horizon
// ---------------------------------------------------------------------------

export interface SpreadOptions {
  /** Earliest moment a new post may be booked. Usually "now". */
  from: Date;
  /** How far ahead to look. Two weeks, rolling, topped up each run. */
  horizonDays: number;
  /**
   * Hours of the day worth posting at, in the CLIENT'S timezone.
   *
   * Local, not UTC. A client in Los Angeles who wants 2pm means 2pm where they
   * are; treating that as UTC posts to their audience at six in the morning.
   */
  preferredHours: number[];
  /** IANA zone. Anything unrecognised falls back to UTC. */
  timeZone: string;
  /** Weekdays they want, as three-letter lowercase. Empty means any day. */
  preferredDays?: string[];
  /** The client's cap. Counted over any rolling seven days, not per calendar week. */
  postsPerWeek: number;
  /** Never put two of a client's posts closer together than this. */
  minGapHours: number;
  /** Slots already booked for this client. Both caps are measured against these too. */
  taken: Date[];
  /** How many new slots are wanted. */
  count: number;
}

/**
 * Pick times for the next few posts.
 *
 * Two rules, both measured against already-booked slots as well as the ones
 * being chosen here — otherwise a run that tops the calendar up would happily
 * stack five posts on top of a week that was already full.
 *
 * The rolling-seven-days cap is deliberate rather than a calendar week: a
 * calendar week lets a client get ten posts across Friday and Monday and still
 * be "within five a week", which is not what anyone means by it.
 *
 * Days and hours are both evaluated in the client's zone, so "Mondays at 2pm"
 * means their Monday and their two o'clock.
 */
export function spreadSlots(opts: SpreadOptions): Date[] {
  if (opts.count <= 0 || opts.postsPerWeek <= 0) return [];

  const hours = [...new Set(opts.preferredHours)]
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);
  if (!hours.length) return [];

  const zone = isValidZone(opts.timeZone) ? opts.timeZone : "UTC";
  const days = new Set((opts.preferredDays ?? []).map((d) => d.toLowerCase().slice(0, 3)));

  const minGapMs = opts.minGapHours * 3_600_000;
  const weekMs = 7 * 86_400_000;
  const booked = [...opts.taken].sort((a, b) => a.getTime() - b.getTime());
  const chosen: Date[] = [];

  const startLocal = localParts(opts.from, zone);

  for (let day = 0; day <= opts.horizonDays && chosen.length < opts.count; day++) {
    // Step the LOCAL calendar. Date.UTC normalises overflow, so day 40 of a
    // month becomes the right date in the next one.
    const probe = new Date(Date.UTC(startLocal.year, startLocal.month, startLocal.day + day, 12));
    const dayLocal = localParts(probe, zone);
    if (days.size && !days.has(dayLocal.weekday)) continue;

    for (const hour of hours) {
      if (chosen.length >= opts.count) break;

      const slot = zonedTimeToUtc(dayLocal.year, dayLocal.month, dayLocal.day, hour, zone);
      if (slot.getTime() <= opts.from.getTime()) continue;

      const all = [...booked, ...chosen];
      if (all.some((t) => Math.abs(t.getTime() - slot.getTime()) < minGapMs)) continue;

      // The cap, over the seven days ending at this slot.
      const inWindow = all.filter(
        (t) => t.getTime() > slot.getTime() - weekMs && t.getTime() <= slot.getTime(),
      ).length;
      if (inWindow >= opts.postsPerWeek) continue;

      chosen.push(slot);
    }
  }

  return chosen;
}

function isValidZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
