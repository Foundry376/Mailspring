import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const occurrence = {
  id: 'e1-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Planning',
  isAllDay: false,
  isMine: true,
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
