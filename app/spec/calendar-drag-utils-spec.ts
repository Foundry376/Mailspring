// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  hasEnded,
  canDragEvent,
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
  } as EventOccurrence;
}

describe('hasEnded', function () {
  it('returns true for an end time in the past', function () {
    expect(hasEnded(Date.now() / 1000 - HOUR)).toBe(true);
  });

  it('returns false for an end time in the future', function () {
    expect(hasEnded(Date.now() / 1000 + HOUR)).toBe(false);
  });
});

describe('canDragEvent', function () {
  it('allows dragging an upcoming event', function () {
    expect(canDragEvent(makeOccurrence())).toBe(true);
  });

  it('blocks dragging an event that has already ended', function () {
    const nowUnix = Date.now() / 1000;
    const past = makeOccurrence({ start: nowUnix - 2 * HOUR, end: nowUnix - HOUR });
    expect(canDragEvent(past)).toBe(false);
  });

  it('allows dragging an in-progress event, since only the end time being past locks it', function () {
    const nowUnix = Date.now() / 1000;
    const inProgress = makeOccurrence({ start: nowUnix - HOUR, end: nowUnix + HOUR });
    expect(canDragEvent(inProgress)).toBe(true);
  });

  it('blocks dragging an event in a read-only calendar', function () {
    expect(canDragEvent(makeOccurrence(), true)).toBe(false);
  });

  it('blocks dragging a cancelled event', function () {
    expect(canDragEvent(makeOccurrence({ isCancelled: true }))).toBe(false);
  });

  it('blocks an all-day event only once its day is over', function () {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartUnix = startOfToday.getTime() / 1000;

    const today = makeOccurrence({
      isAllDay: true,
      start: todayStartUnix,
      end: todayStartUnix + 24 * HOUR - 1,
    });
    expect(canDragEvent(today)).toBe(true);

    const yesterday = makeOccurrence({
      isAllDay: true,
      start: todayStartUnix - 24 * HOUR,
      end: todayStartUnix - 1,
    });
    expect(canDragEvent(yesterday)).toBe(false);
  });
});
