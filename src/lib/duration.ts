// How long something took, written the way a person would say it.
//
// Used in two places that must agree: the live counter on a turn still running,
// and the collapsed label on one that has finished. A turn that read "2:04"
// while it ran and "124s" afterwards would look like two different numbers.

/** Under a minute reads "34s"; a minute or more reads "2m 4s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * The same thing for a duration that may not exist.
 *
 * Older messages predate the duration column, and a fake "0s" is worse than
 * saying nothing — it reads as a turn that took no time rather than one we
 * never measured.
 */
export function formatDurationOrNull(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  if (!Number.isFinite(ms)) return null;
  return formatDuration(ms);
}

/** Elapsed wall-clock since an ISO timestamp, floored at zero. */
export function elapsedSince(iso: string, now: number = Date.now()): number {
  const started = new Date(iso).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now - started);
}
