import { Calendar } from '../src/flux/models/calendar';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import * as CalendarDateUtils from '../src/calendar-date';

const START = Date.UTC(2026, 8, 22, 13, 0, 0) / 1000;

// Stretched past a day in the grid and dropped there.
const held = {
  id: 'offsite-e0',
  accountId: 'acct-1',
  calendarId: 'cal-1',
  title: 'Offsite',
  location: '',
  description: '',
  isAllDay: false,
  isMine: true,
  isCancelled: false,
  isPending: false,
  isException: false,
  isRecurring: false,
  organizer: null,
  attendees: [],
  start: START,
  end: START + 2 * 86400,
  startDate: CalendarDateUtils.calendarDateFromUnix(START),
  endDate: CalendarDateUtils.calendarDateFromUnix(START + 2 * 86400),
} as TimedOccurrence;

const pressAt = (target: HTMLElement) =>
  ({
    time: START,
    x: 10,
    y: 10,
    containerType: 'day-column',
    mouseEvent: { button: 0, target, clientX: 10, clientY: 10 },
  }) as any;

describe('an event held in the grid', function () {
  let cal: any;

  beforeEach(function () {
    cal = new MailspringCalendar({} as any);
    cal.state = {
      ...cal.state,
      calendarsLoaded: true,
      calendars: [new Calendar({ id: 'cal-1', accountId: 'acct-1', name: 'Mine' } as any)],
      disabledCalendars: [],
      heldInGridEventId: 'offsite',
    };
    cal.setState = (next: any) =>
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
  });

  it('is released by a press on the grid around it', function () {
    cal._onCalendarMouseDown(pressAt(document.createElement('div')));
    expect(cal.state.heldInGridEventId).toBe(null);
  });

  it('stays held through a press on itself', function () {
    cal._onEventDragStart(held, {} as any, { mode: 'move' } as any);
    cal._onCalendarMouseDown(pressAt(document.createElement('div')));
    expect(cal.state.heldInGridEventId).toBe('offsite');
  });

  it('is released by opening a new event', function () {
    cal._openNewEvent({ startUnix: START, endUnix: START + 3600, isAllDay: false });
    expect(cal.state.newEvent).not.toBe(null);
    expect(cal.state.heldInGridEventId).toBe(null);
  });
});
