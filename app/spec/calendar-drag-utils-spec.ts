// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  isPastDate,
  canMoveEvent,
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
