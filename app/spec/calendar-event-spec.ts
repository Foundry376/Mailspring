import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import {
  AllDayOccurrence,
  EventOccurrence,
  TimedOccurrence,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import moment from 'moment';
import { CalendarDateUtils } from 'mailspring-exports';
import { parseCalendarDate } from '../src/calendar-date';

// Fields _getDimensions never reads, but the occurrence type requires.
const OCCURRENCE_META = {
  id: 'e0',
  accountId: 'a',
  calendarId: 'c',
  title: '',
  location: '',
  description: '',
  isCancelled: false,
  isPending: false,
  isException: false,
  isRecurring: false,
  organizer: null,
  attendees: [],
};

// _getDimensions reads only this.props, so we can exercise it without rendering.
function dimensions(
  event: EventOccurrence,
  direction: 'horizontal' | 'vertical',
  scopeStart: number,
  scopeEnd: number
) {
  const instance = new CalendarEvent({
    event,
    order: 1,
    concurrentEvents: 1,
    fixedSize: -1,
    direction,
    scopeStart,
    scopeEnd,
  } as any);
  const d = (instance as any)._getDimensions();
  return { topPct: parseFloat(d.top), heightPct: parseFloat(d.height) };
}

function allDayDimensions(startISO: string, endISO: string) {
  const weekStart = parseCalendarDate('2026-06-21'); // Sun; June has no DST transition
  const event = {
    ...OCCURRENCE_META,
    isAllDay: true,
    startDate: parseCalendarDate(startISO),
    endDate: parseCalendarDate(endISO),
  } as AllDayOccurrence;
  return dimensions(
    event,
    'horizontal',
    CalendarDateUtils.dayStartUnix(weekStart),
    CalendarDateUtils.dayStartUnix((weekStart + 7) as any)
  );
}

// A day column's scope: its own start, and the next day's start as the exclusive end, as
// `exclusiveDayEnds` supplies them. Chicago runner, so 2025-11-02 is 25 hours long and
// 2026-03-08 is 23.
// Times are local ISO strings, or unix seconds where the clock reading is ambiguous.
function timedDimensions(start: string | number, end: string | number, dayISO: string) {
  const day = parseCalendarDate(dayISO);
  const unix = (t: string | number) => (typeof t === 'number' ? t : moment(t).unix());
  const event = {
    ...OCCURRENCE_META,
    isAllDay: false,
    start: unix(start),
    end: unix(end),
    startDate: day,
    endDate: day,
  } as TimedOccurrence;
  return dimensions(
    event,
    'vertical',
    CalendarDateUtils.dayStartUnix(day),
    CalendarDateUtils.nextDayStartUnix(day)
  );
}

/** Percent of the column a wall-clock hour is at: the gridline the legend labels with it. */
function hourLine(hours: number) {
  return (hours / 24) * 100;
}

describe('CalendarEvent all-day dimensions', function () {
  it('sizes a fully-visible multi-day span by its covered days', function () {
    // Jun 22-24 inclusive = 3 of the 7 week days
    const { topPct, heightPct } = allDayDimensions('2026-06-22', '2026-06-24');
    expect(topPct).toBeCloseTo((1 / 7) * 100, 4); // starts 1 day into the week
    expect(heightPct).toBeCloseTo((3 / 7) * 100, 4);
  });

  it('clips the pre-week portion of a span that starts before the visible week', function () {
    // Covers Jun 19-22; only Jun 21-22 (2 days) are visible. Regression: the dropped
    // overflow clamp drew the full 4-day span (57%) pinned at day 0 instead of 2 days (29%).
    const { topPct, heightPct } = allDayDimensions('2026-06-19', '2026-06-22');
    expect(topPct).toBe(0);
    expect(heightPct).toBeCloseTo((2 / 7) * 100, 4);
  });
});

// The legend, gridlines and now-line divide every column into 24 equal hours, so an event has
// to sit on the line its own label names; elapsed seconds drift off it by up to an hour.
describe('CalendarEvent timed dimensions across DST', function () {
  it('keeps a late event on a 25-hour day on its own gridline', function () {
    const { topPct, heightPct } = timedDimensions(
      '2025-11-02 23:30',
      '2025-11-02 23:45',
      '2025-11-02'
    );
    expect(topPct).toBeCloseTo(hourLine(23.5), 4);
    expect(topPct + heightPct).toBeCloseTo(hourLine(23.75), 4);
  });

  it('draws a 10:00 event on the 10 AM line of a 23-hour day', function () {
    const { topPct } = timedDimensions('2026-03-08 10:00', '2026-03-08 11:00', '2026-03-08');
    expect(topPct).toBeCloseTo(hourLine(10), 4);
  });

  it('spans the hours its label names across a spring-forward gap', function () {
    // 01:30-03:30 lasts one real hour; the grid still has a 2 AM row, so it draws two tall.
    const { topPct, heightPct } = timedDimensions(
      '2026-03-08 01:30',
      '2026-03-08 03:30',
      '2026-03-08'
    );
    expect(topPct).toBeCloseTo(hourLine(1.5), 4);
    expect(heightPct).toBeCloseTo(hourLine(2), 4);
  });

  it('draws its real duration when its end reads no later than its start', function () {
    // 01:30 CDT to 01:30 CST is one real hour whose two ends read the same on the clock.
    const { topPct, heightPct } = timedDimensions(
      Date.UTC(2025, 10, 2, 6, 30) / 1000,
      Date.UTC(2025, 10, 2, 7, 30) / 1000,
      '2025-11-02'
    );
    expect(topPct).toBeCloseTo(hourLine(1.5), 4);
    expect(heightPct).toBeCloseTo(hourLine(1), 4);
  });

  it('reaches the column bottom when it ends at the next midnight', function () {
    // The end instant's own wall clock reads 00:00; the exclusive scope end is what makes it 100%.
    const { topPct, heightPct } = timedDimensions(
      '2025-11-02 22:00',
      '2025-11-03 00:00',
      '2025-11-02'
    );
    expect(topPct).toBeCloseTo(hourLine(22), 4);
    expect(topPct + heightPct).toBeCloseTo(100, 4);
  });

  it('clips to the column top when it began the day before', function () {
    const { topPct, heightPct } = timedDimensions(
      '2025-11-01 22:00',
      '2025-11-02 03:00',
      '2025-11-02'
    );
    expect(topPct).toBe(0);
    expect(heightPct).toBeCloseTo(hourLine(3), 4);
  });
});
