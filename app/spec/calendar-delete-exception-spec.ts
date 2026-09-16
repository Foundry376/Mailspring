import { Actions, DatabaseStore, DestroyEventTask, SyncbackEventTask } from 'mailspring-exports';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

// A daily series whose 2 March occurrence has been moved to 08:00. Both rows the sync engine
// creates from this file share the one resource.
const MASTER_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:series@test',
  'DTSTART:20260301T060000Z',
  'DTEND:20260301T070000Z',
  'RRULE:FREQ=DAILY;COUNT=10',
  'SUMMARY:Daily Standup',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series@test',
  'RECURRENCE-ID:20260302T060000Z',
  'DTSTART:20260302T080000Z',
  'DTEND:20260302T090000Z',
  'SUMMARY:Daily Standup',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const MASTER_START = Date.UTC(2026, 2, 1, 6, 0, 0) / 1000;
const MOVED_START = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000;

const master = () =>
  new MailspringEvent({
    id: 'master-row',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'series@test',
    recurrenceId: '',
    ics: MASTER_ICS,
    recurrenceStart: MASTER_START,
    recurrenceEnd: MASTER_START + 3600,
  } as any);

const exceptionRow = (recurrenceId: string) =>
  new MailspringEvent({
    id: 'exception-row',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'series@test',
    recurrenceId,
    ics: MASTER_ICS,
    recurrenceStart: MOVED_START,
    recurrenceEnd: MOVED_START + 3600,
  } as any);

const occurrence: TimedOccurrence = {
  id: 'exception-row-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Daily Standup',
  location: '',
  description: '',
  isAllDay: false,
  isCancelled: false,
  isPending: false,
  isException: true,
  isRecurring: false,
  organizer: null,
  attendees: [],
  start: MOVED_START,
  end: MOVED_START + 3600,
} as TimedOccurrence;

describe('deleting a moved occurrence from the calendar', function () {
  let queued: any[];
  let calendar: any;

  function stubRows(exception: MailspringEvent, masterRow: MailspringEvent | null) {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(exception));
    spyOn(DatabaseStore, 'findBy').andReturn(Promise.resolve(masterRow));
  }

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(AppEnv, 'showErrorDialog');
    // _deleteEvent reads nothing from the rendered tree, so the component need not be mounted.
    calendar = new MailspringCalendar({} as any);
  });

  it('edits the master instead of destroying the resource the rows share', async function () {
    stubRows(exceptionRow('20260302T060000Z'), master());

    await calendar._deleteEvent(occurrence);

    expect(queued.length).toBe(1);
    expect(queued[0] instanceof SyncbackEventTask).toBe(true);
    expect(queued.some((t) => t instanceof DestroyEventTask)).toBe(false);
    const written = queued[0].event;
    expect(written.id).toBe('master-row');
    expect((written.ics.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
    expect(written.ics).toContain('EXDATE:20260302T060000Z');
    expect(written.ics).toContain('RRULE:FREQ=DAILY;COUNT=10');
  });

  it('refuses when the master does not contain the occurrence, rather than deleting', async function () {
    stubRows(exceptionRow('20991231T060000Z'), master());

    await calendar._deleteEvent(occurrence);

    expect(queued.length).toBe(0);
    expect(AppEnv.showErrorDialog).toHaveBeenCalled();
  });
});
