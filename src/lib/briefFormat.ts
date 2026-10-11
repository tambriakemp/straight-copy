// Turning the brief's raw strings into the words the Today page shows.
//
// Pure and on its own so the rules are testable: the brief writes machine
// timestamps ("2026-10-12T09:00") and a title that often already carries
// its own date, and the page printed both verbatim — a cutoff pill reading
// "Cutoff 2026-10-12T09:00" and a header reading "… Oct 10, 2026 · Oct 11,
// 2026 · posted 12:17 AM".

/** A date that is today, in the viewer's zone. */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * A deadline, the way the canvas prints one: "Mon Oct 12, 9:00 AM".
 *
 * Anything that is not a timestamp comes back untouched. The brief is
 * written by an agent and already sends free text for some of these
 * ("Usual time", "Monday 9 AM"); reformatting is for the machine ones, and
 * mangling a human phrase into "Invalid Date" is worse than leaving it.
 */
export function formatMoment(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // Only touch something that actually looks like a timestamp. A bare
  // YYYY-MM-DD counts; "Monday 9 AM" does not.
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) return s;
  const d = new Date(s.includes("T") || s.includes(" ") ? s : `${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;

  const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const hasTime = /[T ]\d{2}:\d{2}/.test(s);
  if (!hasTime) return date;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

/** Does this text already end in something that reads as a date? */
function carriesDate(title: string): boolean {
  return /\b\d{4}$|\b\d{1,2},?\s*\d{4}$/.test(title.trim());
}

/**
 * The line under "Today": which brief you are reading, and when it landed.
 *
 * The brief's own title usually ends with its date ("Saturday catch-up
 * brief · Oct 10, 2026"), so appending created_at's date as well printed
 * two — and they disagree whenever a brief lands after midnight, which is
 * exactly when you most want to know which day it covers. The title wins;
 * only the posting time is added.
 */
export function briefHeadline(title: string, createdAt: string): string {
  const d = new Date(createdAt);
  const posted = Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const parts = [title.trim()];
  if (!carriesDate(title) && !Number.isNaN(d.getTime())) {
    parts.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
  }
  if (posted) parts.push(`posted ${posted}`);
  return parts.join(" · ");
}

/** "Oct 11 – 17", the range label beside "This week". */
export function weekRangeLabel(dates: string[]): string | null {
  const parsed = dates
    .map((d) => new Date(`${d}T12:00:00`))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!parsed.length) return null;
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  if (month(first) === month(last)) {
    return `${month(first)} ${first.getDate()} – ${last.getDate()}`;
  }
  return `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}`;
}

/** "Sun 11", and whether that day is today. */
export function dayLabel(date: string, now = new Date()): { label: string; isToday: boolean } {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { label: date, isToday: false };
  // Composed rather than asked for as one format: a `weekday + day`
  // toLocaleDateString comes back "12 Mon" in some locales, and the canvas
  // reads "Mon 12".
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return { label: `${weekday} ${d.getDate()}`, isToday: isSameDay(d, now) };
}
