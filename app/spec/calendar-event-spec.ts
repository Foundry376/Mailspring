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
// `exclusiveDayEnds` supplies them. Chicago runner, so 2025-11-02 is 25 hours long.
function timedDimensions(startISO: string, endISO: string, dayISO: string, nextDayISO: string) {
  const event = {
    ...OCCURRENCE_META,
    isAllDay: false,
    start: moment(startISO).unix(),
    end: moment(endISO).unix(),
    startDate: parseCalendarDate(dayISO),
    endDate: parseCalendarDate(dayISO),
  } as TimedOccurrence;
  return dimensions(event, 'vertical', moment(dayISO).unix(), moment(nextDayISO).unix());
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

describe('CalendarEvent timed dimensions across DST', function () {
  it('keeps a late event on a 25-hour day inside its column', function () {
    // Against a hardcoded 86399s scope a 23:30 event computes top 102%, which
    // `.event-column { overflow: hidden }` clips away entirely.
    const { topPct, heightPct } = timedDimensions(
      '2025-11-02 23:30',
      '2025-11-02 23:45',
      '2025-11-02',
      '2025-11-03'
    );
    expect(topPct).toBeCloseTo((88200 / 90000) * 100, 4);
    expect(topPct + heightPct).toBeLessThan(100.0001);
  });

  it('sizes an event against the real length of a 23-hour day', function () {
    // Proportional to elapsed seconds, which is NOT the wall-clock hour gridline: the
    // legend and now-line divide the column into 24 equal hours, so on a transition day a
    // 10:00 event draws ~37 min off its own "10 AM" line. Pre-existing and improved here
    // (it was a full hour), not fixed — see the backlog's elapsed-vs-wall-clock item.
    const { topPct } = timedDimensions(
      '2026-03-08 10:00',
      '2026-03-08 11:00',
      '2026-03-08',
      '2026-03-09'
    );
    expect(topPct).toBeCloseTo((32400 / 82800) * 100, 4);
  });
});
