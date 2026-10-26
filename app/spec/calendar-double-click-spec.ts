import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarEventContextMenu } from '../internal_packages/main-calendar/lib/core/calendar-event-context-menu';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const occurrence = {
  id: 'e1-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Planning',
  isAllDay: false,
  isMine: true,
  organizer: null,
  attendees: [],
  start: 1_782_000_000,
  end: 1_782_003_600,
} as TimedOccurrence;
// The panel edits a one-off event without guests itself; the editor is for the rest.
const weekly = { ...occurrence, isRecurring: true } as TimedOccurrence;

describe('double-clicking a calendar event', function () {
  function loadedCalendar() {
    const calendar: any = new MailspringCalendar({} as any);
    calendar.state = { ...calendar.state, calendarsLoaded: true };
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    spyOn(calendar, '_openEventEditor');
    return calendar;
  }

  it('opens the editor for a repeating event we may change', function () {
    const calendar = loadedCalendar();
    calendar._onEventDoubleClick(weekly);
    expect(calendar._openEventEditor).toHaveBeenCalledWith(weekly);
  });

  it('edits a one-off event without guests in the panel instead', function () {
    const calendar = loadedCalendar();
    calendar._onEventDoubleClick(occurrence);
    expect(calendar._openEventEditor).not.toHaveBeenCalled();
    expect(calendar.state.selectedEvents).toEqual([occurrence]);
  });

  it("leaves somebody else's meeting to the panel the click opened", function () {
    const calendar = loadedCalendar();
    calendar._onEventDoubleClick({ ...occurrence, isMine: false });
    expect(calendar._openEventEditor).not.toHaveBeenCalled();
  });
});

describe("the context menu's open item", function () {
  function calendarWith(readOnlyCalendarIds: string[]) {
    const calendar: any = new MailspringCalendar({} as any);
    calendar.state = {
      ...calendar.state,
      calendarsLoaded: true,
      readOnlyCalendarIds: new Set(readOnlyCalendarIds),
      selectedEvents: [occurrence],
    };
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    spyOn(calendar, '_openEventEditor');
    return calendar;
  }

  // The menu built for the occurrence; it decides the open item's label from readOnly and isMine.
  function menuFor(calendar: any, occ: TimedOccurrence) {
    const display = spyOn(CalendarEventContextMenu.prototype, 'displayMenu');
    calendar._onEventContextMenu(occ);
    return display.mostRecentCall.object as CalendarEventContextMenu;
  }
  const openItem = (menu: CalendarEventContextMenu) =>
    menu.template()[0] as { label: string; click: () => void };

  it('is Edit Event, and opens the editor, for a repeating meeting we organize', function () {
    const calendar = calendarWith([]);
    const menu = menuFor(calendar, weekly);
    expect(openItem(menu).label).toBe('Edit Event...');
    openItem(menu).click();
    expect(calendar._openEventEditor).toHaveBeenCalledWith(weekly);
  });

  it("is View Event, and shows it in the panel, for somebody else's meeting", function () {
    const calendar = calendarWith([]);
    const theirs = { ...occurrence, isMine: false } as TimedOccurrence;
    const menu = menuFor(calendar, theirs);
    expect(openItem(menu).label).toBe('View Event');
    openItem(menu).click();
    expect(calendar._openEventEditor).not.toHaveBeenCalled();
  });

  it('shows it in the panel on a read-only calendar, even for our own event', function () {
    const calendar = calendarWith(['c']);
    const menu = menuFor(calendar, occurrence);
    expect(openItem(menu).label).toBe('View Event');
    openItem(menu).click();
    expect(calendar._openEventEditor).not.toHaveBeenCalled();
  });
});
