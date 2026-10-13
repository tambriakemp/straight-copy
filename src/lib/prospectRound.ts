// The Prospects page's round header: when the cutoff is, and how far
// through the round you are.
//
// Pure, because the cutoff is a standing rule rather than a stored date
// and getting it wrong is invisible — a page that says "Monday, Oct 12 at
// 9:00 AM" when the real deadline was this morning reads exactly as
// convincingly as one that is right.

/**
 * Monday 9:00 AM, Central. Anything still pending then rolls over into next
 * month's batch for priority review rather than being treated as a no — only
 * approved previews ever go out.
 */
export const CUTOFF_WEEKDAY = 1; // Monday
export const CUTOFF_HOUR = 9;

const CT = "America/Chicago";

/** The wall-clock parts of `at`, read in Central. */
function centralParts(at: Date): { y: number; m: number; d: number; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: CT, weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    hour: Number(parts.hour), weekday: weekdays.indexOf(parts.weekday as string),
  };
}

/**
 * The next cutoff from `now`, as the words the header prints.
 *
 * Counted in whole days from today in Central rather than by adding
 * milliseconds: a week containing a DST change is not 7 × 24 hours, and
 * "next Monday" has to stay Monday through it.
 */
export function nextCutoffLabel(now = new Date()): string {
  const { weekday, hour } = centralParts(now);
  let days = (CUTOFF_WEEKDAY - weekday + 7) % 7;
  // Today is the cutoff day but nine has been and gone: the live round is
  // next week's. On the morning of, it is still today.
  if (days === 0 && hour >= CUTOFF_HOUR) days = 7;

  // Noon, so the date is unambiguous in every zone, then formatted back in
  // Central — only the calendar date is taken from this, not the time.
  const target = new Date(now.getTime() + days * 86_400_000);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: CT, weekday: "long", month: "short", day: "numeric",
  }).format(target);
  const [weekdayName, monthDay] = date.split(", ");
  return `${weekdayName}, ${monthDay} at ${CUTOFF_HOUR}:00 AM`;
}

/** Whole days until that cutoff — 0 means it is today. */
export function daysToCutoff(now = new Date()): number {
  const { weekday, hour } = centralParts(now);
  let days = (CUTOFF_WEEKDAY - weekday + 7) % 7;
  if (days === 0 && hour >= CUTOFF_HOUR) days = 7;
  return days;
}

export interface RoundProgress {
  approved: number;
  sentBack: number;
  skipped: number;
  pending: number;
  total: number;
  /** 0–100 of the round that has been decided. */
  pct: number;
}

/**
 * How far through the round you are.
 *
 * Skipped counts as progress but not as decided: you have looked at it and
 * moved on, which is worth seeing, but it is still in the pile at the
 * cutoff — so it stays in `pending` too, and the bar does not fill for it.
 * A bar that reached 100% on a round where nothing had been approved would
 * be the single most misleading thing on the page.
 */
export function roundProgress(
  statuses: Array<"pending" | "approved" | "rejected">,
  skippedIds: number,
): RoundProgress {
  const total = statuses.length;
  const approved = statuses.filter((s) => s === "approved").length;
  const sentBack = statuses.filter((s) => s === "rejected").length;
  const pending = statuses.filter((s) => s === "pending").length;
  const decided = approved + sentBack;
  return {
    approved, sentBack, pending, total,
    skipped: Math.min(skippedIds, pending),
    pct: total === 0 ? 0 : Math.floor((decided / total) * 100),
  };
}

// CRE-413: the rebuild-issue-per-rejection pipeline's own statuses, layered
// on top of the three above. A row's main `status` only ever says
// pending/approved/rejected — `rebuild_status` (set by create-rebuild-issue
// on rejection, pushed to 'ready_for_review' by prospect-approvals-sync on
// resubmit, and polled hourly otherwise) is what tells Queued/Rebuilding/
// Stuck apart from a plain "Sent back", and "rebuilt" apart from a plain
// "Pending" — see the CRE-413 migrations and _shared/rebuildStatus.ts.
export type RebuildStatus = "queued" | "rebuilding" | "ready_for_review" | "stuck" | null;

export interface RebuildAwareProspect {
  status: "pending" | "approved" | "rejected";
  rebuild_status: RebuildStatus;
}

export type EffectiveStatus =
  | "pending" | "rebuilt" | "queued" | "rebuilding" | "stuck" | "approved" | "sent_back" | "skipped";

export interface StatusChip {
  label: string;
  tone: "amber" | "bronze" | "blue" | "violet" | "red" | "green" | "gray";
}

const STATUS_CHIPS: Record<EffectiveStatus, StatusChip> = {
  pending: { label: "Pending", tone: "amber" },
  // Main chip stays "Pending" — a rebuilt row is back in the review queue,
  // not a new kind of pending. The "Rebuilt" badge is a separate chip next
  // to it, read off this same effective status by the caller.
  rebuilt: { label: "Pending", tone: "amber" },
  queued: { label: "Queued", tone: "blue" },
  rebuilding: { label: "Rebuilding", tone: "violet" },
  stuck: { label: "Stuck", tone: "red" },
  approved: { label: "Approved", tone: "green" },
  sent_back: { label: "Sent back", tone: "red" },
  skipped: { label: "Skipped", tone: "gray" },
};

/**
 * Which of the eight states a row is actually in, given its main status,
 * rebuild_status, and whether this session has skipped it.
 *
 * `rebuild_status` only has meaning while a row is `rejected` (queued /
 * rebuilding / stuck) or freshly `pending` again after a resubmit
 * (ready_for_review -> "rebuilt"); a `rejected` row with no rebuild_status
 * yet (the trigger hasn't landed, or this predates the pipeline) reads as a
 * plain "Sent back" rather than erroring.
 */
export function effectiveStatus(p: RebuildAwareProspect, isSkipped: boolean): EffectiveStatus {
  if (p.status === "approved") return "approved";
  if (p.status === "rejected") {
    if (p.rebuild_status === "queued") return "queued";
    if (p.rebuild_status === "rebuilding") return "rebuilding";
    if (p.rebuild_status === "stuck") return "stuck";
    return "sent_back";
  }
  // A resubmit landing while this row is marked skipped-this-session means
  // there's genuinely new work to look at, so it outranks the skip.
  if (p.rebuild_status === "ready_for_review") return "rebuilt";
  if (isSkipped) return "skipped";
  return "pending";
}

export function statusChip(effective: EffectiveStatus): StatusChip {
  return STATUS_CHIPS[effective];
}

export interface RebuildBatchProgress {
  /** Rows in scope that have ever had a rebuild issue created. */
  total: number;
  /** Of those, how many have a rebuild issue that is actually closed. */
  done: number;
}

/**
 * "Rebuilds: N of M done" — M is every row that has ever had a rebuild
 * issue created (rebuild_issue_id set, excluding the transient
 * "__creating__" claim sentinel), N is how many of those have
 * rebuild_issue_closed_at set.
 *
 * Deliberately not derived from rebuild_status: 'ready_for_review' covers
 * both "still open, already resubmitted" and "closed, already resubmitted"
 * (see _shared/rebuildStatus.ts), and this needs the second one specifically.
 */
export function rebuildBatchProgress(
  rows: Array<{ rebuild_issue_id: string | null; rebuild_issue_closed_at: string | null }>,
): RebuildBatchProgress {
  const tracked = rows.filter((r) => r.rebuild_issue_id && r.rebuild_issue_id !== "__creating__");
  const done = tracked.filter((r) => r.rebuild_issue_closed_at).length;
  return { total: tracked.length, done };
}
