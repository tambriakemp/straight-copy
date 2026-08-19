// Cron matching for the agent dispatcher.
//
// Pure functions, no Deno APIs, so src/test/agent-schedule.test.ts covers the
// same code the dispatcher runs. Worth testing properly: a bug here means
// agents silently never fire, or fire repeatedly on every 15-minute tick.

/** Does `value` satisfy one cron field? Supports *, N, a-b, a,b and step (/n). */
export function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) return false;

    // Unbounded step (*/n) matches on the step alone.
    if (range === "*") return value % step === 0;

    let lo: number, hi: number;
    if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      lo = a; hi = b;
    } else {
      lo = hi = Number(range);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  });
}

/** True if `cron` matches `now` (UTC) to the minute. 5 fields, dow 0 = Sunday. */
export function cronMatches(cron: string, now: Date): boolean {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return false;
  return (
    fieldMatches(f[0], now.getUTCMinutes()) &&
    fieldMatches(f[1], now.getUTCHours()) &&
    fieldMatches(f[2], now.getUTCDate()) &&
    fieldMatches(f[3], now.getUTCMonth() + 1) &&
    fieldMatches(f[4], now.getUTCDay())
  );
}

/**
 * Is this agent due?
 *
 * The dispatcher only wakes every 15 minutes, so requiring an exact minute
 * match would miss nearly every schedule. Instead we ask: what is the most
 * recent scheduled moment that has already passed today, and have we run since
 * then? That makes a run at-most-once per slot and tolerant of a late tick or a
 * missed one.
 */
export function isDue(cron: string, lastRunAt: string | null, now: Date): boolean {
  const slot = latestSlotOnOrBefore(cron, now);
  if (!slot) return false;
  return !lastRunAt || new Date(lastRunAt) < slot;
}

/** The most recent moment today that `cron` fired, at or before `now`. */
export function latestSlotOnOrBefore(cron: string, now: Date): Date | null {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  if (!fieldMatches(f[2], now.getUTCDate())) return null;
  if (!fieldMatches(f[3], now.getUTCMonth() + 1)) return null;
  if (!fieldMatches(f[4], now.getUTCDay())) return null;

  let best = -1;
  for (let h = 0; h <= now.getUTCHours(); h++) {
    if (!fieldMatches(f[1], h)) continue;
    for (let m = 0; m < 60; m++) {
      if (h === now.getUTCHours() && m > now.getUTCMinutes()) break;
      if (fieldMatches(f[0], m)) best = h * 60 + m;
    }
  }
  if (best < 0) return null;

  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    Math.floor(best / 60), best % 60, 0, 0,
  ));
}

/** Next scheduled fire time, scanning forward up to `horizonDays`. */
export function nextRunAfter(cron: string, from: Date, horizonDays = 370): Date | null {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;

  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const limit = new Date(from.getTime() + horizonDays * 86_400_000);
  while (cursor <= limit) {
    if (
      fieldMatches(f[2], cursor.getUTCDate()) &&
      fieldMatches(f[3], cursor.getUTCMonth() + 1) &&
      fieldMatches(f[4], cursor.getUTCDay())
    ) {
      if (fieldMatches(f[1], cursor.getUTCHours()) && fieldMatches(f[0], cursor.getUTCMinutes())) {
        return new Date(cursor.getTime());
      }
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    } else {
      // Whole day excluded — jump to the next midnight instead of 1440 steps.
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
    }
  }
  return null;
}
