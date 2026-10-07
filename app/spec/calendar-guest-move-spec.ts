import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { createDragState } from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import { DEFAULT_DRAG_CONFIG } from '../internal_packages/main-calendar/lib/core/calendar-drag-types';
import * as CalendarRsvp from '../internal_packages/main-calendar/lib/core/calendar-rsvp';

const START = Date.UTC(2026, 5, 23, 14, 0, 0) / 1000;

const guestMeeting: TimedOccurrence = {
  id: 'e1-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Planning',
  location: '',
  description: '',
  isAllDay: false,
  isCancelled: false,
  isPending: false,
  isMine: false,
  isException: false,
  isRecurring: false,
  organizer: { email: 'ada@example.com' },
  attendees: [],
  start: START,
  end: START + 3600,
} as TimedOccurrence;

// Dragging and the arrow keys share one rule: a guest cannot move a meeting, and is told so
// with the counter-proposal on offer. The component is driven unmounted, setState redirected.
describe('moving a meeting we do not organize', function () {
  let calendar: any;
  let offer: jasmine.Spy;

  beforeEach(function () {
    calendar = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.calendarsLoaded = true;
    calendar.state.readOnlyCalendarIds = new Set();
    offer = spyOn(CalendarRsvp, 'offerCounterInsteadOfMove');
  });

  it('turns a drag into the offer once it has clearly begun', function () {
    calendar.state.dragState = createDragState(
      guestMeeting,
      { mode: 'move' } as any,
      START,
      100,
      100,
      DEFAULT_DRAG_CONFIG
    );
    calendar._onCalendarMouseMove({ time: START + 900, x: 101, y: 101, containerType: 'day' });
    expect(offer).not.toHaveBeenCalled();

    calendar._onCalendarMouseMove({ time: START + 1800, x: 160, y: 160, containerType: 'day' });
    expect(offer).toHaveBeenCalledWith(guestMeeting);
    expect(calendar.state.dragState).toBe(null);
  });

  it('leaves a drag of our own meeting alone', function () {
    const ours = { ...guestMeeting, isMine: true };
    calendar.state.dragState = createDragState(
      ours,
      { mode: 'move' } as any,
      START,
      100,
      100,
      DEFAULT_DRAG_CONFIG
    );
    calendar._onCalendarMouseMove({ time: START + 1800, x: 160, y: 160, containerType: 'day' });
    expect(offer).not.toHaveBeenCalled();
    expect(calendar.state.dragState.isDragging).toBe(true);
  });

  it('answers an arrow key the same way', function () {
    calendar.state.selectedEvents = [guestMeeting];
    calendar._onMoveSelectedEvent('down', false);
    expect(offer).toHaveBeenCalledWith(guestMeeting);
  });

  it('says nothing for an arrow key on a read-only calendar', function () {
    calendar.state.readOnlyCalendarIds = new Set(['c']);
    calendar.state.selectedEvents = [guestMeeting];
    calendar._onMoveSelectedEvent('down', false);
    expect(offer).not.toHaveBeenCalled();
  });
});
