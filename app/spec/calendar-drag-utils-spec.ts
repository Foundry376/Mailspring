// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  isPastDate,
  canMoveEvent,
  snapAllDayTimes,
} from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import { EventOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const HOUR = 60 * 60;

function makeOccurrence(overrides: Partial<EventOccurrence> = {}): EventOccurrence {
  const nowUnix = Date.now() / 1000;
  return {
    id: 'event-1-e0',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: 'Standup',
    location: '',
    description: '',
    start: nowUnix + HOUR,
    end: nowUnix + 2 * HOUR,
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    ...overrides,
  };
}

describe('isPastDate', function () {
  it('returns true for a timestamp in the past', function () {
    expect(isPastDate(Date.now() / 1000 - HOUR)).toBe(true);
  });

  it('returns false for a timestamp in the future', function () {
    expect(isPastDate(Date.now() / 1000 + HOUR)).toBe(false);
  });
});

describe('canMoveEvent', function () {
  it('allows moving an upcoming event', function () {
    expect(canMoveEvent(makeOccurrence())).toBe(true);
  });

  it('blocks moving an event that has already ended', function () {
    const nowUnix = Date.now() / 1000;
    const past = makeOccurrence({ start: nowUnix - 2 * HOUR, end: nowUnix - HOUR });
    expect(canMoveEvent(past)).toBe(false);
  });

  it('allows moving an in-progress event, since only the end time being past locks it', function () {
    const nowUnix = Date.now() / 1000;
    const inProgress = makeOccurrence({ start: nowUnix - HOUR, end: nowUnix + HOUR });
    expect(canMoveEvent(inProgress)).toBe(true);
  });

  it('blocks moving an event in a read-only calendar', function () {
    expect(canMoveEvent(makeOccurrence(), true)).toBe(false);
  });

  it('blocks moving a cancelled event', function () {
    expect(canMoveEvent(makeOccurrence({ isCancelled: true }))).toBe(false);
  });

  it('blocks an all-day event only once its day is over', function () {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartUnix = startOfToday.getTime() / 1000;

    const today = makeOccurrence({
      isAllDay: true,
      start: todayStartUnix,
      end: todayStartUnix + 24 * HOUR,
    });
    expect(canMoveEvent(today)).toBe(true);

    const yesterday = makeOccurrence({
      isAllDay: true,
      start: todayStartUnix - 24 * HOUR,
      end: todayStartUnix - 1,
    });
    expect(canMoveEvent(yesterday)).toBe(false);
  });
});

describe('snapAllDayTimes', function () {
  // Local midnights: all-day times are built from local date components.
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;
  const JUN22 = day(2026, 6, 22);
  const JUN23 = day(2026, 6, 23);

  it('snaps an inclusive end-of-day end to the next midnight', function () {
    expect(snapAllDayTimes(JUN22 + 9 * 3600, JUN23 - 1)).toEqual({
      start: JUN22,
      end: JUN23,
    });
  });

  it('leaves an already-exclusive end unchanged, so repeated drags do not grow the event', function () {
    expect(snapAllDayTimes(JUN22, JUN23)).toEqual({ start: JUN22, end: JUN23 });
    const once = snapAllDayTimes(JUN22, JUN23 - 1);
    expect(snapAllDayTimes(once.start, once.end)).toEqual(once);
  });

  it('gives a degenerate end a full day rather than zero length', function () {
    expect(snapAllDayTimes(JUN22, JUN22)).toEqual({ start: JUN22, end: JUN23 });
  });

  it('preserves a multi-day span', function () {
    expect(snapAllDayTimes(day(2026, 6, 20), day(2026, 6, 23))).toEqual({
      start: day(2026, 6, 20),
      end: day(2026, 6, 23),
    });
  });

  it('stays idempotent across DST transitions', function () {
    // March 8 2026 is a 23-hour day and November 1 a 25-hour day in DST zones
    [
      [day(2026, 3, 7), day(2026, 3, 8)],
      [day(2026, 3, 8), day(2026, 3, 9)],
      [day(2026, 10, 31), day(2026, 11, 1)],
      [day(2026, 11, 1), day(2026, 11, 2)],
    ].forEach(([start, end]) => {
      const once = snapAllDayTimes(start, end);
      expect(once).toEqual({ start, end });
      expect(snapAllDayTimes(once.start, once.end)).toEqual(once);
    });
  });

  it('always returns at least one whole day', function () {
    [JUN22 - 1, JUN22, JUN22 + 1, JUN23 - 1, JUN23].forEach((end) => {
      const snapped = snapAllDayTimes(JUN22, end);
      expect(snapped.end).toBeGreaterThan(snapped.start);
    });
  });
});
