// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  isPastDate,
  canMoveEvent,
  snapAllDayTimes,
  createDragState,
  updateDragState,
} from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import { MONTH_VIEW_DRAG_CONFIG } from '../internal_packages/main-calendar/lib/core/calendar-drag-types';
import { pinTimezone } from './pin-timezone';
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
  pinTimezone('America/Chicago');

  // Local midnights, computed inside each test: the pin isn't active in this describe body.
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;

  it('snaps an inclusive end-of-day end to the next midnight', function () {
    expect(snapAllDayTimes(day(2026, 6, 22) + 9 * 3600, day(2026, 6, 23) - 1)).toEqual({
      start: day(2026, 6, 22),
      end: day(2026, 6, 23),
    });
  });

  it('leaves an already-exclusive end unchanged, so repeated drags do not grow the event', function () {
    expect(snapAllDayTimes(day(2026, 6, 22), day(2026, 6, 23))).toEqual({
      start: day(2026, 6, 22),
      end: day(2026, 6, 23),
    });
    const once = snapAllDayTimes(day(2026, 6, 22), day(2026, 6, 23) - 1);
    expect(snapAllDayTimes(once.start, once.end)).toEqual(once);
  });

  it('gives a degenerate end a full day rather than zero length', function () {
    expect(snapAllDayTimes(day(2026, 6, 22), day(2026, 6, 22))).toEqual({
      start: day(2026, 6, 22),
      end: day(2026, 6, 23),
    });
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
    [
      day(2026, 6, 22) - 1,
      day(2026, 6, 22),
      day(2026, 6, 22) + 1,
      day(2026, 6, 23) - 1,
      day(2026, 6, 23),
    ].forEach((end) => {
      const snapped = snapAllDayTimes(day(2026, 6, 22), end);
      expect(snapped.end).toBeGreaterThan(snapped.start);
    });
  });
});

describe('updateDragState with day snapping', function () {
  // Pinned so the spring-forward case is real on a UTC runner
  pinTimezone('America/Chicago');

  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;

  // Drags an all-day event's edge and returns the resulting preview range.
  function dragEdge(
    start: number,
    end: number,
    mode: 'resize-start' | 'resize-end',
    mouseTime: number
  ) {
    const event = makeOccurrence({ isAllDay: true, start, end });
    const cursor = mode === 'resize-start' ? 'ew-resize' : 'ew-resize';
    const state = createDragState(event, { mode, cursor }, mouseTime, 0, 0, MONTH_VIEW_DRAG_CONFIG);
    // Move far enough to clear the drag threshold
    const dragged = updateDragState(
      state,
      mouseTime,
      100,
      100,
      'month-cell',
      MONTH_VIEW_DRAG_CONFIG
    );
    return { start: dragged.previewStart, end: dragged.previewEnd };
  }

  it('keeps preview ends on midnight when resizing on a spring-forward day', function () {
    // A calendar day is 82800s on Mar 8 2026, so a seconds-based floor lands at 23:00
    // of the previous day and previews an extra day.
    expect(
      dragEdge(day(2026, 3, 8), day(2026, 3, 9), 'resize-end', day(2026, 3, 8) + 3600)
    ).toEqual({ start: day(2026, 3, 8), end: day(2026, 3, 9) });
    expect(
      dragEdge(day(2026, 3, 8), day(2026, 3, 9), 'resize-start', day(2026, 3, 8) + 3600)
    ).toEqual({ start: day(2026, 3, 8), end: day(2026, 3, 9) });
  });

  it('never previews less than one whole day', function () {
    // resize-end dragged back before the start
    expect(
      dragEdge(day(2026, 8, 14), day(2026, 8, 15), 'resize-end', day(2026, 8, 12) + 3600)
    ).toEqual({ start: day(2026, 8, 14), end: day(2026, 8, 15) });
    // resize-start dragged past the end
    expect(
      dragEdge(day(2026, 8, 14), day(2026, 8, 15), 'resize-start', day(2026, 8, 20) + 3600)
    ).toEqual({ start: day(2026, 8, 14), end: day(2026, 8, 15) });
  });

  it('extends a multi-day span to the day the cursor is in', function () {
    expect(
      dragEdge(day(2026, 8, 14), day(2026, 8, 16), 'resize-end', day(2026, 8, 18) + 3600)
    ).toEqual({ start: day(2026, 8, 14), end: day(2026, 8, 19) });
  });
});
