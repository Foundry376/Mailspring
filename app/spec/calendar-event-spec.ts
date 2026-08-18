import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { AllDayOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { CalendarDateUtils } from 'mailspring-exports';
import { parseCalendarDate } from '../src/calendar-date';

// _getDimensions reads only this.props, so we can exercise it without rendering.
function allDayDimensions(startISO: string, endISO: string) {
  const weekStart = parseCalendarDate('2026-06-21'); // Sun; June has no DST transition
  const event = {
    isAllDay: true,
    startDate: parseCalendarDate(startISO),
    endDate: parseCalendarDate(endISO),
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
  } as AllDayOccurrence;
  const instance = new CalendarEvent({
    event,
    order: 1,
    concurrentEvents: 1,
    fixedSize: -1,
    direction: 'horizontal',
    scopeStart: CalendarDateUtils.dayStartUnix(weekStart),
    scopeEnd: CalendarDateUtils.dayStartUnix((weekStart + 7) as any),
  } as any);
  const d = (instance as any)._getDimensions();
  return { topPct: parseFloat(d.top), heightPct: parseFloat(d.height) };
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
