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

describe('double-clicking a calendar event', function () {
  it('opens its editor, not the card', function () {
    const calendar: any = new MailspringCalendar({} as any);
    const open = spyOn(calendar, '_openEventPopover');
    calendar._onEventDoubleClick(occurrence);
    expect(open).toHaveBeenCalledWith(occurrence, true);
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
    spyOn(calendar, '_openEventPopover');
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

  it('is Edit Event, and opens the editor, for a meeting we organize', function () {
    const calendar = calendarWith([]);
    const menu = menuFor(calendar, occurrence);
    expect(openItem(menu).label).toBe('Edit Event...');
    openItem(menu).click();
    expect(calendar._openEventPopover).toHaveBeenCalledWith(occurrence, true);
  });

  it("is View Event, and keeps the card, for somebody else's meeting", function () {
    const calendar = calendarWith([]);
    const theirs = { ...occurrence, isMine: false } as TimedOccurrence;
    const menu = menuFor(calendar, theirs);
    expect(openItem(menu).label).toBe('View Event');
    openItem(menu).click();
    expect(calendar._openEventPopover).toHaveBeenCalledWith(theirs, false);
  });

  it('keeps the card on a read-only calendar, even for our own event', function () {
    const calendar = calendarWith(['c']);
    const menu = menuFor(calendar, occurrence);
    expect(openItem(menu).label).toBe('View Event');
    openItem(menu).click();
    expect(calendar._openEventPopover).toHaveBeenCalledWith(occurrence, false);
  });
});
