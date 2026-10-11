import type { CalendarEvent, CalendarEventType } from "@/lib/briefs";
import { dayLabel, weekRangeLabel } from "@/lib/briefFormat";
import { groupWeek, weekWindow, formatRange, type PlacedEvent } from "@/lib/calendarWeek";
import { LinkifiedText } from "./IssueLinks";

// "This week" — a list of days, not a week grid.
//
// It was seven columns with absolutely-positioned bars across them. At the
// ~500px this card actually gets in Today's right-hand column that is 60px
// a day: every title truncated to two words, multi-day stays running off
// the right edge, chips overlapping. A week grid needs the width of a page
// and this is a sidebar, so the canvas draws it as rows — the day on the
// left, its events stacked beside it, days with nothing on them left out.
//
// No legend, because the canvas has none: each event says what it is in its
// own second line ("Checkout 11 AM · Airbnb"), which survives being read in
// greyscale where a colour key does not.
//
// All the date arithmetic lives in @/lib/calendarWeek, which is tested.
// What is left here is markup.

const TYPE_CLASS: Record<CalendarEventType, string> = {
  rental: "cv-cal-ev--rental",
  business: "cv-cal-ev--business",
  live: "cv-cal-ev--live",
  home: "cv-cal-ev--home",
};

function EventRow({ placed }: { placed: PlacedEvent }) {
  const { ev, detail } = placed;
  const canceled = ev.status === "canceled";
  const tone = canceled ? "cv-cal-ev--cancel" : TYPE_CLASS[ev.type] ?? TYPE_CLASS.business;
  return (
    <div className={`cv-cal-ev ${tone}`}>
      <LinkifiedText text={ev.title} />
      {(detail || canceled) && (
        <small>{[detail, canceled ? "Canceled" : null].filter(Boolean).join(" · ")}</small>
      )}
    </div>
  );
}

export default function WeeklyCalendarCard({ events }: { events: CalendarEvent[] }) {
  const { days, later } = groupWeek(events);
  // The whole window, not just the days with something on them — see
  // weekWindow's comment.
  const range = weekRangeLabel(weekWindow());

  return (
    <section className="cv-card cv-card-pad">
      <div className="cv-card-head">
        <h2 className="cv-card-title">This week</h2>
        {range && <span className="cv-card-sub">{range}</span>}
      </div>

      {!days.length && !later.length && (
        <p className="cv-cal-empty">Nothing on the calendar this week.</p>
      )}

      {days.map((day) => {
        const { label, isToday } = dayLabel(day.date);
        return (
          <div key={day.date} className="cv-cal-day">
            <b className="cv-cal-day__label">
              {label}
              {isToday && <span className="cv-cal-day__today">Today</span>}
            </b>
            <div className="cv-cal-day__events">
              {day.events.map((placed) => <EventRow key={placed.ev.id} placed={placed} />)}
            </div>
          </div>
        );
      })}

      {later.length > 0 && (
        <div className="cv-cal-later">
          <span className="cv-cal-later__label">Later</span>
          {later.slice(0, 6).map((ev) => (
            <span key={ev.id} className="cv-cal-later__pill">
              {formatRange(ev.start_date, ev.end_date ?? ev.start_date)} · {ev.title}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
