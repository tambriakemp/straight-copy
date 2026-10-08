import { Fragment } from "react";
import { ArrowRight, Check, Home, X } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/lib/briefs";

const TYPE_COLOR: Record<CalendarEventType, { bg: string; border: string; accent: string; tm: string }> = {
  rental: { bg: "#e6f6f3", border: "#c3ebe3", accent: "#0d9488", tm: "#0f766e" },
  business: { bg: "#eef0ff", border: "#dfe2ff", accent: "#4f46e5", tm: "#4338ca" },
  live: { bg: "#fdf0f6", border: "#fadbe9", accent: "#db2777", tm: "#be185d" },
  home: { bg: "#fff6e8", border: "#fde6c2", accent: "#d97706", tm: "#b45309" },
};

const LEGEND: Array<{ key: CalendarEventType; label: string }> = [
  { key: "rental", label: "Rentals" },
  { key: "business", label: "Business" },
  { key: "live", label: "Live / marketing" },
  { key: "home", label: "Home / personal" },
];

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
function todayChicago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function weekdayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}
function monthShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}
function longDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function isWeekendDay(d: Date): boolean {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}
function formatRange(startIso: string, endIso: string): string {
  const s = parseDateOnly(startIso);
  const e = parseDateOnly(endIso);
  if (isoDate(s) === isoDate(e)) return `${monthShort(s)} ${s.getUTCDate()}`;
  if (monthShort(s) === monthShort(e)) return `${monthShort(s)} ${s.getUTCDate()}–${e.getUTCDate()}`;
  return `${monthShort(s)} ${s.getUTCDate()}–${monthShort(e)} ${e.getUTCDate()}`;
}

function to12h(hhmm: string): { h: number; m: number; ampm: "AM" | "PM" } {
  const [hhStr, mmStr] = hhmm.split(":");
  const hh = Number(hhStr) || 0;
  const mm = Number(mmStr) || 0;
  const ampm: "AM" | "PM" = hh >= 12 ? "PM" : "AM";
  let h = hh % 12;
  if (h === 0) h = 12;
  return { h, m: mm, ampm };
}
function fmt12(t: { h: number; m: number; ampm: "AM" | "PM" }): string {
  return t.m ? `${t.h}:${String(t.m).padStart(2, "0")} ${t.ampm}` : `${t.h} ${t.ampm}`;
}
function formatTimeLabel(ev: CalendarEvent): string | null {
  if (ev.time_label) return ev.time_label;
  if (!ev.start_time) return null;
  const s = to12h(ev.start_time);
  if (!ev.end_time) return fmt12(s);
  const e = to12h(ev.end_time);
  if (s.ampm === e.ampm) {
    const sPart = s.m ? `${s.h}:${String(s.m).padStart(2, "0")}` : `${s.h}`;
    const ePart = e.m ? `${e.h}:${String(e.m).padStart(2, "0")}` : `${e.h}`;
    return `${sPart}–${ePart} ${e.ampm}`;
  }
  return `${fmt12(s)}–${fmt12(e)}`;
}

interface RentalBar {
  ev: CalendarEvent;
  startCol: number; // 1-based, within the visible 7-day window
  span: number;
  multi: boolean; // original event covers more than one calendar day
}

function RentalBarContent({ ev, multi }: { ev: CalendarEvent; multi: boolean }) {
  const canceled = ev.status === "canceled";
  if (canceled) {
    return (
      <>
        <X size={14} className="cv-weekcal__bar-icon" />
        <span className="cv-weekcal__bar-strike">{ev.title}</span>
        <small>canceled</small>
      </>
    );
  }
  if (multi) {
    return (
      <>
        <Home size={14} className="cv-weekcal__bar-icon" />
        <span>{ev.title}</span>
        <small>· stay {formatRange(ev.start_date, ev.end_date ?? ev.start_date)}</small>
      </>
    );
  }
  return (
    <>
      <ArrowRight size={14} className="cv-weekcal__bar-icon" />
      <span className="cv-weekcal__bar-stack">
        <small>Arrives</small>
        {ev.title}
      </span>
    </>
  );
}

function EventChip({ ev }: { ev: CalendarEvent }) {
  const canceled = ev.status === "canceled";
  const colors = TYPE_COLOR[ev.type] ?? TYPE_COLOR.business;
  const timeLabel = formatTimeLabel(ev);
  return (
    <div
      className={`cv-weekcal__chip ${canceled ? "cv-weekcal__chip--cancel" : ""}`}
      style={canceled ? undefined : { background: colors.bg, borderColor: colors.border, boxShadow: `inset 3px 0 0 ${colors.accent}` }}
    >
      {timeLabel && (
        <span className="cv-weekcal__chip-tm" style={canceled ? undefined : { color: colors.tm }}>{timeLabel}</span>
      )}
      <span className={`cv-weekcal__chip-nm ${canceled ? "cv-weekcal__bar-strike" : ""}`}>{ev.title}</span>
      {canceled ? (
        <span className="cv-weekcal__chip-meta cv-weekcal__chip-meta--muted">canceled</span>
      ) : ev.status === "confirmed" ? (
        <span className="cv-weekcal__chip-meta"><Check size={11} strokeWidth={3} /> Confirmed</span>
      ) : null}
    </div>
  );
}

/**
 * Rolling 7-day (today + next 6) calendar card for the brief's calendar
 * section (CRE-358), replacing the old checkbox list. Presentation only —
 * no checkboxes, nothing here writes anything back.
 */
export default function WeeklyCalendarCard({ events }: { events: CalendarEvent[] }) {
  const todayIso = todayChicago();
  const day0 = parseDateOnly(todayIso);
  const days = Array.from({ length: 7 }, (_, i) => addDays(day0, i));
  const day6 = days[6];

  const rentalBars: RentalBar[] = [];
  const dayChips: Record<string, CalendarEvent[]> = {};
  const later: CalendarEvent[] = [];

  for (const ev of events) {
    const evStart = parseDateOnly(ev.start_date);
    const evEnd = ev.end_date ? parseDateOnly(ev.end_date) : evStart;

    if (ev.type === "rental") {
      if (diffDays(evStart, day6) > 0) { later.push(ev); continue; } // entirely after the window
      if (diffDays(evEnd, day0) < 0) continue; // entirely in the past
      const clipStart = diffDays(evStart, day0) < 0 ? day0 : evStart;
      const clipEnd = diffDays(evEnd, day6) > 0 ? day6 : evEnd;
      rentalBars.push({
        ev,
        startCol: diffDays(clipStart, day0) + 1,
        span: diffDays(clipEnd, clipStart) + 1,
        multi: diffDays(evEnd, evStart) > 0,
      });
      continue;
    }

    if (diffDays(evStart, day6) > 0) { later.push(ev); continue; } // entirely after the window
    if (diffDays(evStart, day0) < 0) continue; // entirely in the past
    const key = isoDate(evStart);
    (dayChips[key] ??= []).push(ev);
  }

  later.sort((a, b) => a.start_date.localeCompare(b.start_date));

  const rentalsByDay: Record<string, RentalBar[]> = {};
  for (const bar of rentalBars) {
    for (let i = bar.startCol - 1; i < bar.startCol - 1 + bar.span; i++) {
      const iso = isoDate(days[i]);
      (rentalsByDay[iso] ??= []).push(bar);
    }
  }

  // Greedy interval-graph coloring: each lane is a row of non-overlapping bars.
  const lanes: RentalBar[][] = [];
  for (const bar of [...rentalBars].sort((a, b) => a.startCol - b.startCol)) {
    const lane = lanes.find((l) => {
      const last = l[l.length - 1];
      return last.startCol + last.span <= bar.startCol;
    });
    if (lane) lane.push(bar); else lanes.push([bar]);
  }

  const isDayEmpty = (iso: string) => !dayChips[iso]?.length && !rentalsByDay[iso]?.length;

  return (
    <div className="cv-weekcal">
      <div className="cv-weekcal__head">
        <div>
          <div className="cv-weekcal__eyebrow">Calendar</div>
          <div className="cv-weekcal__title">
            <h3>This week</h3>
            <span className="cv-weekcal__range">{formatRange(isoDate(day0), isoDate(day6))}</span>
          </div>
        </div>
        <div className="cv-weekcal__legend">
          {LEGEND.map((l) => (
            <span key={l.key}><i className="cv-weekcal__dot" style={{ background: TYPE_COLOR[l.key].accent }} />{l.label}</span>
          ))}
          <span><i className="cv-weekcal__dot cv-weekcal__dot--cx" />Canceled</span>
        </div>
      </div>

      <div className="cv-weekcal__grid cv-weekcal__grid--desktop">
        <div className="cv-weekcal__row cv-weekcal__row--head">
          {days.map((d) => {
            const iso = isoDate(d);
            const today = iso === todayIso;
            const quiet = !today && isDayEmpty(iso);
            return (
              <div
                key={iso}
                className={`cv-weekcal__dayhead ${today ? "cv-weekcal__dayhead--today" : ""} ${quiet ? "cv-weekcal__dayhead--quiet" : ""} ${isWeekendDay(d) ? "cv-weekcal__dayhead--weekend" : ""}`}
              >
                <span className="cv-weekcal__dow">{weekdayLabel(d)}</span>
                <span className="cv-weekcal__dnum">{d.getUTCDate()}</span>
                {today && <span className="cv-weekcal__todaytag">Today</span>}
              </div>
            );
          })}
        </div>

        {lanes.map((lane, li) => (
          <div key={li} className="cv-weekcal__row cv-weekcal__row--lane">
            {lane.map((bar) => (
              <div
                key={bar.ev.id}
                className={`cv-weekcal__bar ${bar.ev.status === "canceled" ? "cv-weekcal__bar--cancel" : "cv-weekcal__bar--rental"}`}
                style={{ gridColumn: `${bar.startCol} / span ${bar.span}` }}
              >
                <RentalBarContent ev={bar.ev} multi={bar.multi} />
              </div>
            ))}
          </div>
        ))}

        <div className="cv-weekcal__row cv-weekcal__row--cells">
          {days.map((d) => {
            const iso = isoDate(d);
            return (
              <div key={iso} className="cv-weekcal__cell">
                {(dayChips[iso] ?? []).map((ev) => <EventChip key={ev.id} ev={ev} />)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cv-weekcal__mobile">
        {days.map((d) => {
          const iso = isoDate(d);
          const today = iso === todayIso;
          const quiet = !today && isDayEmpty(iso);
          return (
            <div key={iso} className="cv-weekcal__mobileday">
              <div className={`cv-weekcal__mobileday-head ${quiet ? "cv-weekcal__dayhead--quiet" : ""}`}>
                <span>{longDateLabel(d)}</span>
                {today && <span className="cv-weekcal__todaytag">Today</span>}
              </div>
              {(rentalsByDay[iso] ?? []).map((bar) => (
                <Fragment key={bar.ev.id}>
                  <div className={`cv-weekcal__bar ${bar.ev.status === "canceled" ? "cv-weekcal__bar--cancel" : "cv-weekcal__bar--rental"}`}>
                    <RentalBarContent ev={bar.ev} multi={bar.multi} />
                  </div>
                </Fragment>
              ))}
              {(dayChips[iso] ?? []).map((ev) => <EventChip key={ev.id} ev={ev} />)}
            </div>
          );
        })}
      </div>

      {later.length > 0 && (
        <div className="cv-weekcal__later">
          <b>Later</b>
          {later.slice(0, 6).map((ev) => (
            <span key={ev.id} className="cv-weekcal__later-chip">
              <i className="cv-weekcal__dot" style={{ background: TYPE_COLOR[ev.type]?.accent ?? TYPE_COLOR.business.accent }} />
              {ev.status === "canceled" ? (
                <><s>{ev.title}</s> canceled</>
              ) : (
                <>{ev.title} · {formatRange(ev.start_date, ev.end_date ?? ev.start_date)}</>
              )}
            </span>
          ))}
          <span className="cv-weekcal__later-note">All times CT</span>
        </div>
      )}
      {later.length === 0 && <div className="cv-weekcal__later"><span className="cv-weekcal__later-note">All times CT</span></div>}
    </div>
  );
}
