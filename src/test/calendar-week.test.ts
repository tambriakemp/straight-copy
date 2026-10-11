// The day rows "This week" draws are entirely date arithmetic, and none of
// it shows in a screenshot: which day a stay that started last week is
// filed under, whether an event that ended yesterday still appears, what
// falls past the window. The card is markup; this is the part that can be
// wrong.
import { describe, it, expect } from "vitest";
import { groupWeek, weekWindow, formatRange, formatTimeLabel, todayInChicago } from "@/lib/calendarWeek";
import type { CalendarEvent } from "@/lib/briefs";

const TODAY = "2026-10-11";

function ev(over: Partial<CalendarEvent> & { id: string; start_date: string }): CalendarEvent {
  return {
    title: `Event ${over.id}`,
    type: "business",
    status: "confirmed",
    ...over,
  } as CalendarEvent;
}

describe("groupWeek", () => {
  it("files each event under its own day, in date order", () => {
    const { days } = groupWeek(
      [ev({ id: "c", start_date: "2026-10-14" }), ev({ id: "a", start_date: "2026-10-11" })],
      TODAY,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-11", "2026-10-14"]);
  });

  it("leaves out days with nothing on them", () => {
    // The row list is a sidebar column — an empty Wednesday in it is a
    // row of whitespace that says nothing.
    const { days } = groupWeek([ev({ id: "a", start_date: "2026-10-13" })], TODAY);
    expect(days).toHaveLength(1);
  });

  it("files a multi-day stay once, not on every day it covers", () => {
    const { days } = groupWeek(
      [ev({ id: "s", type: "rental", start_date: "2026-10-12", end_date: "2026-10-16" })],
      TODAY,
    );
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-10-12");
    expect(days[0].events[0].spans).toBe(true);
    expect(days[0].events[0].detail).toContain("Oct 12 – 16");
  });

  it("files a stay that began before today under today", () => {
    // It is happening now. Filing it under its own start date would put it
    // outside the window and drop it entirely.
    const { days } = groupWeek(
      [ev({ id: "s", type: "rental", start_date: "2026-10-08", end_date: "2026-10-13" })],
      TODAY,
    );
    expect(days.map((d) => d.date)).toEqual([TODAY]);
    expect(days[0].events[0].detail).toContain("Oct 8 – 13");
  });

  it("drops what is already over", () => {
    const { days, later } = groupWeek([ev({ id: "p", start_date: "2026-10-09" })], TODAY);
    expect(days).toHaveLength(0);
    expect(later).toHaveLength(0);
  });

  it("pushes anything past the seventh day into Later", () => {
    const { days, later } = groupWeek(
      [ev({ id: "in", start_date: "2026-10-17" }), ev({ id: "out", start_date: "2026-10-18" })],
      TODAY,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-17"]);
    expect(later.map((e) => e.id)).toEqual(["out"]);
  });

  it("sorts Later by date", () => {
    const { later } = groupWeek(
      [ev({ id: "b", start_date: "2026-11-02" }), ev({ id: "a", start_date: "2026-10-20" })],
      TODAY,
    );
    expect(later.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("puts all-day events above timed ones within a day", () => {
    const { days } = groupWeek(
      [
        ev({ id: "timed", start_date: TODAY, start_time: "14:00" }),
        ev({ id: "allday", start_date: TODAY }),
        ev({ id: "early", start_date: TODAY, start_time: "09:00" }),
      ],
      TODAY,
    );
    expect(days[0].events.map((p) => p.ev.id)).toEqual(["allday", "early", "timed"]);
  });

  it("shows a timed event's time as its detail line", () => {
    const { days } = groupWeek(
      [ev({ id: "a", start_date: TODAY, start_time: "09:00", end_time: "10:30" })],
      TODAY,
    );
    expect(days[0].events[0].detail).toBe("9:00 – 10:30 AM");
  });

  it("falls back to the note when there is no time", () => {
    const { days } = groupWeek([ev({ id: "a", start_date: TODAY, note: "Bring the camera" })], TODAY);
    expect(days[0].events[0].detail).toBe("Bring the camera");
  });

  it("keeps a canceled event in place rather than hiding it", () => {
    // You need to see that the thing you planned around is off.
    const { days } = groupWeek([ev({ id: "x", start_date: TODAY, status: "canceled" })], TODAY);
    expect(days[0].events[0].ev.status).toBe("canceled");
  });

  it("is unbothered by an unparseable date", () => {
    const { days, later } = groupWeek([ev({ id: "bad", start_date: "not a date" })], TODAY);
    expect(days).toHaveLength(0);
    expect(later).toHaveLength(0);
  });

  it("says nothing for no events", () => {
    expect(groupWeek([], TODAY)).toEqual({ days: [], later: [] });
  });
});

describe("weekWindow", () => {
  it("is the seven days from today, whatever is on them", () => {
    // The range label beside "This week" reads off this and not off the
    // day rows, so skipping empty days must not shrink "Oct 11 – 17".
    expect(weekWindow(TODAY)).toEqual([
      "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14",
      "2026-10-15", "2026-10-16", "2026-10-17",
    ]);
  });

  it("crosses a month end", () => {
    expect(weekWindow("2026-10-30").slice(-1)).toEqual(["2026-11-05"]);
  });
});

describe("formatRange", () => {
  it("prints one date for a single day", () => {
    expect(formatRange("2026-10-12", "2026-10-12")).toBe("Oct 12");
  });
  it("names the month once within a month", () => {
    expect(formatRange("2026-10-12", "2026-10-16")).toBe("Oct 12 – 16");
  });
  it("names both months across one", () => {
    expect(formatRange("2026-10-30", "2026-11-02")).toBe("Oct 30 – Nov 2");
  });
});

describe("formatTimeLabel", () => {
  it("prefers the brief's own label", () => {
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY, start_time: "09:00", time_label: "Usual time" })))
      .toBe("Usual time");
  });
  it("says the AM/PM once for a range inside one half of the day", () => {
    // Minutes always printed: these are cutoffs and call times, and "9"
    // for 9:00 reads as an approximation. This is the canvas's format.
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY, start_time: "09:00", end_time: "10:30" })))
      .toBe("9:00 – 10:30 AM");
  });
  it("names both halves when the range crosses noon", () => {
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY, start_time: "11:00", end_time: "13:00" })))
      .toBe("11:00 AM – 1:00 PM");
  });
  it("handles midnight and noon as 12", () => {
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY, start_time: "00:30" }))).toBe("12:30 AM");
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY, start_time: "12:00" }))).toBe("12:00 PM");
  });
  it("gives nothing for an all-day event", () => {
    expect(formatTimeLabel(ev({ id: "a", start_date: TODAY }))).toBeNull();
  });
});

describe("todayInChicago", () => {
  it("reads the Chicago date, not the viewer's", () => {
    // 02:00 UTC on the 12th is still the 11th in Chicago. A viewer in
    // London late at night must not see tomorrow's events as today's.
    expect(todayInChicago(new Date("2026-10-12T02:00:00Z"))).toBe("2026-10-11");
    expect(todayInChicago(new Date("2026-10-12T14:00:00Z"))).toBe("2026-10-12");
  });
});
