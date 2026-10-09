import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { DEFAULT_DRAG_CONFIG } from '../internal_packages/main-calendar/lib/core/calendar-drag-types';
import * as CalendarDateUtils from '../src/calendar-date';
import * as CalendarRsvp from '../internal_packages/main-calendar/lib/core/calendar-rsvp';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

const START = Date.UTC(2026, 8, 22, 13, 0, 0) / 1000;

const occurrence = {
  id: 'standup-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Standup',
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
  end: START + 1800,
  startDate: CalendarDateUtils.calendarDateFromUnix(START),
  endDate: CalendarDateUtils.calendarDateFromUnix(START),
} as TimedOccurrence;

// The grid's hit-test result for a pointer at (x, y) over the event's own slot.
const at = (x: number, y: number) =>
  ({
    time: START,
    x,
    y,
    containerType: 'day-column',
    mouseEvent: { button: 0, clientX: x, clientY: y },
  }) as any;

describe('pressing an event', function () {
  let cal: any;
  let renders: number;

  beforeEach(function () {
    cal = new MailspringCalendar({} as any);
    renders = 0;
    cal.setState = (next: any) => {
      renders++;
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
    };
    cal.state = { ...cal.state, calendarsLoaded: true };
    spyOn(cal, '_persistDragChange');
    // The press lands on the event first, then bubbles to the grid with its position.
    cal._onEventDragStart(occurrence, {} as any, { mode: 'move' } as any);
    cal._onCalendarMouseDown(at(10, 10));
  });

  it('writes nothing to state until the pointer has travelled the drag threshold', function () {
    expect(cal.state.dragState).toBe(null);
    expect(renders).toBe(0);
    cal._onCalendarMouseMove(at(10, 10 + DEFAULT_DRAG_CONFIG.dragThreshold - 1));
    expect(cal.state.dragState).toBe(null);
    expect(renders).toBe(0);
  });

  it('becomes a drag of that event once the pointer travels', function () {
    cal._onCalendarMouseMove(at(10, 10 + DEFAULT_DRAG_CONFIG.dragThreshold + 1));
    expect(cal.state.dragState).not.toBe(null);
    expect(cal.state.dragState.event).toBe(occurrence);
    expect(cal.state.dragState.isDragging).toBe(true);
    expect(cal._pendingDragState).toBe(null);
  });

  it('stays a click when the pointer slips 2px off a month bar onto the cell below', function () {
    // Same pointer, two containers: inside the bar it reads y=10; in the cell under it, y=52.
    const over = (container: { x: number; y: number }, clientY: number) =>
      ({
        ...at(container.x, container.y),
        mouseEvent: { button: 0, clientX: 400, clientY },
      }) as any;
    cal = new MailspringCalendar({} as any);
    cal.setState = (next: any) => Object.assign(cal.state, next);
    cal.state = { ...cal.state, calendarsLoaded: true, view: CalendarView.MONTH };
    cal._onEventDragStart(occurrence, {} as any, { mode: 'move' } as any);
    cal._onCalendarMouseDown(over({ x: 10, y: 10 }, 300));
    cal._onCalendarMouseMove(over({ x: 10, y: 52 }, 302));
    expect(cal.state.dragState).toBe(null);
  });

  it('is a click when released without travelling: no state written, nothing persisted', function () {
    cal._onCalendarMouseUp(at(10, 10));
    expect(renders).toBe(0);
    expect(cal.state.dragState).toBe(null);
    expect(cal._pendingDragState).toBe(null);
    expect(cal._persistDragChange).not.toHaveBeenCalled();
  });

  it('does not come back as a drag on a later move once released', function () {
    cal._onCalendarMouseUp(at(10, 10));
    cal._onCalendarMouseMove(at(10, 200));
    expect(cal.state.dragState).toBe(null);
  });

  it('is dropped by a view change made while the button is held', function () {
    spyOn(AppEnv.config, 'set');
    cal.onChangeView(CalendarView.DAY);
    cal._onCalendarMouseMove(at(10, 200));
    expect(cal.state.dragState).toBe(null);
  });
});

describe("pressing a meeting we don't organize", function () {
  it('offers the counter once it travels, and a later move does not offer it again', function () {
    const offer = spyOn(CalendarRsvp, 'offerCounterInsteadOfMove');
    const guestMeeting = { ...occurrence, isMine: false, organizer: { email: 'ada@example.com' } };
    const cal: any = new MailspringCalendar({} as any);
    cal.setState = (next: any) => Object.assign(cal.state, next);
    cal.state = { ...cal.state, calendarsLoaded: true, readOnlyCalendarIds: new Set() };
    cal._onEventDragStart(guestMeeting, {} as any, { mode: 'move' } as any);
    cal._onCalendarMouseDown(at(10, 10));

    cal._onCalendarMouseMove(at(10, 10 + DEFAULT_DRAG_CONFIG.dragThreshold + 1));
    cal._onCalendarMouseMove(at(10, 200));
    expect(offer.calls.length).toBe(1);
    expect(cal.state.dragState).toBe(null);
  });
});
