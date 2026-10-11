import type { CalendarEvent } from "./briefs";

// Sorting the brief's calendar_events into the rows "This week" draws.
//
// Pure and on its own because the date arithmetic is the whole of the
// component's logic and none of it is visible in a screenshot: which day a
// multi-day stay is filed under, whether a past event still shows, what
// falls past the window into "Later". The card itself is now just markup.
//
// Dates in the brief are calendar dates, not instants — "2026-10-12" is
// the 12th wherever you read it. They are parsed at UTC noon and compared
// as dates throughout, so a viewer in any zone sees the 12th on the 12th.

export interface PlacedEvent {
  ev: CalendarEvent;
  /** The line under the title: a time, a multi-day span, or the note. */
  detail: string | null;
  /** True when the event runs past this day — a stay, not an appointment. */
  spans: boolean;
}

export interface CalendarDay {
  /** YYYY-MM-DD. */
  date: string;
  events: PlacedEvent[];
}

export interface CalendarWeek {
  days: CalendarDay[];
  /** Beyond the seven-day window — shown as pills, not rows. */
  later: CalendarEvent[];
}

const DAY_MS = 86400000;

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/**
 * Today in Chicago, as a calendar date.
 *
 * The agency runs on Central time and the brief's own dates are written in
 * it, so "today" is Chicago's today whatever zone the browser is in —
 * otherwise a London viewer at 2am sees tomorrow's events as today's.
 */
export function todayInChicago(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function monthShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

/** "Oct 12", or "Oct 12 – 13" / "Oct 30 – Nov 2" for a span. */
export function formatRange(startIso: string, endIso: string): string {
  const s = parseDateOnly(startIso);
  const e = parseDateOnly(endIso);
  if (isoDate(s) === isoDate(e)) return `${monthShort(s)} ${s.getUTCDate()}`;
  if (monthShort(s) === monthShort(e)) return `${monthShort(s)} ${s.getUTCDate()} – ${e.getUTCDate()}`;
  return `${monthShort(s)} ${s.getUTCDate()} – ${monthShort(e)} ${e.getUTCDate()}`;
}

function to12h(hhmm: string): { label: string; ampm: "AM" | "PM" } {
  const [hhStr, mmStr] = hhmm.split(":");
  const hh = Number(hhStr) || 0;
  const mm = Number(mmStr) || 0;
  const ampm: "AM" | "PM" = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return { label: `${h}:${String(mm).padStart(2, "0")}`, ampm };
}

/**
 * "9:00 AM", "10:00 – 11:00 AM", "11:00 AM – 1:00 PM", or the brief's
 * own `time_label` if it wrote one.
 *
 * Minutes are always printed and the AM/PM said once per range, which is
 * how the canvas writes them. Collapsing "9:00" to "9" reads as an
 * approximation, and these are cutoffs and call times.
 */
export function formatTimeLabel(ev: CalendarEvent): string | null {
  if (ev.time_label) return ev.time_label;
  if (!ev.start_time) return null;
  const s = to12h(ev.start_time);
  if (!ev.end_time) return `${s.label} ${s.ampm}`;
  const e = to12h(ev.end_time);
  if (s.ampm === e.ampm) return `${s.label} – ${e.label} ${e.ampm}`;
  return `${s.label} ${s.ampm} – ${e.label} ${e.ampm}`;
}

/**
 * The seven days from today, as rows, plus whatever falls past them.
 *
 * Days with nothing on them are left out. The card is a sidebar column, and
 * an empty Wednesday in it is a row of whitespace that says nothing — the
 * week grid this replaced spent a seventh of its width on each of them.
 *
 * A multi-day event is filed once, on the first day of the window it
 * covers, with its span in the detail line. Repeating it down five rows
 * reads as five bookings.
 */
export function groupWeek(events: CalendarEvent[], todayIso = todayInChicago()): CalendarWeek {
  const day0 = parseDateOnly(todayIso);
  const day6 = new Date(day0.getTime() + 6 * DAY_MS);

  const byDay = new Map<string, PlacedEvent[]>();
  const later: CalendarEvent[] = [];

  for (const ev of events) {
    const start = parseDateOnly(ev.start_date);
    const end = ev.end_date ? parseDateOnly(ev.end_date) : start;
    if (Number.isNaN(start.getTime())) continue;

    if (diffDays(start, day6) > 0) { later.push(ev); continue; }
    // Over before today. A stay that started last week but runs through
    // today is not over, and is filed under today.
    if (diffDays(end, day0) < 0) continue;

    const anchor = diffDays(start, day0) < 0 ? day0 : start;
    const spans = diffDays(end, start) > 0;
    const time = formatTimeLabel(ev);
    const detail = spans
      ? `${formatRange(ev.start_date, ev.end_date ?? ev.start_date)}${ev.note ? ` · ${ev.note}` : ""}`
      : time ?? ev.note ?? null;

    const key = isoDate(anchor);
    const list = byDay.get(key) ?? [];
    list.push({ ev, detail, spans });
    byDay.set(key, list);
  }

  const days: CalendarDay[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      // All-day and multi-day first, then by start time: the order you
      // actually live the day in.
      events: list.sort((a, b) => (a.ev.start_time ?? "").localeCompare(b.ev.start_time ?? "")),
    }));

  later.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { days, later };
}

/**
 * The dates the range label beside "This week" should cover: the whole
 * window, not only the days that have something on them. Skipping empty
 * days must not shrink "Oct 11 – 17" to "Oct 12 – 14".
 */
export function weekWindow(todayIso = todayInChicago()): string[] {
  const day0 = parseDateOnly(todayIso);
  return Array.from({ length: 7 }, (_, i) => isoDate(new Date(day0.getTime() + i * DAY_MS)));
}
