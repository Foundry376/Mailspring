import {
  AccountStore,
  Actions,
  Calendar,
  CalendarUtils,
  DatabaseStore,
  DestroyEventTask,
  SyncbackEventTask,
} from 'mailspring-exports';
import { dialog } from '@electron/remote';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { deleteEvents } from '../internal_packages/main-calendar/lib/core/recurring-event-actions';
import {
  AllDayOccurrence,
  TimedOccurrence,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { calendarDateFromUnix, dayStartUnix, parseCalendarDate } from '../src/calendar-date';

// A daily series organized by someone else, with this account as a guest, whose 2 March
// occurrence has been moved to 08:00 inside the same file.
const SERIES_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:series@test',
  'DTSTART:20260301T060000Z',
  'DTEND:20260301T070000Z',
  'RRULE:FREQ=DAILY;COUNT=10',
  'SUMMARY:Daily Standup',
  'ORGANIZER:mailto:organizer@test',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:organizer@test',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@test',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series@test',
  'RECURRENCE-ID:20260302T060000Z',
  'DTSTART:20260302T080000Z',
  'DTEND:20260302T090000Z',
  'SUMMARY:Daily Standup',
  'ORGANIZER:mailto:organizer@test',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:organizer@test',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@test',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const DAY = 86400;
const SERIES_START = Date.UTC(2026, 2, 1, 6, 0, 0) / 1000;
const MOVED_START = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000;

// A daily all-day series whose 2 March date has been moved to 5 March inside the same file.
const ALL_DAY_SERIES_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:series@test',
  'DTSTART;VALUE=DATE:20260301',
  'DTEND;VALUE=DATE:20260302',
  'RRULE:FREQ=DAILY;COUNT=10',
  'SUMMARY:Offsite',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series@test',
  'RECURRENCE-ID;VALUE=DATE:20260302',
  'DTSTART;VALUE=DATE:20260305',
  'DTEND;VALUE=DATE:20260306',
  'SUMMARY:Offsite',
  'DTSTAMP:20260101T000000Z',
  'SEQUENCE:0',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

let masterIcs = SERIES_ICS;

const masterRow = () =>
  new MailspringEvent({
    id: 'master-row',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'series@test',
    recurrenceId: '',
    ics: masterIcs,
    recurrenceStart: SERIES_START,
    recurrenceEnd: SERIES_START + 10 * DAY,
  } as any);

const exceptionRow = () =>
  new MailspringEvent({
    id: 'exception-row',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'series@test',
    recurrenceId: '20260302T060000Z',
    ics: SERIES_ICS,
    recurrenceStart: MOVED_START,
    recurrenceEnd: MOVED_START + 3600,
  } as any);

const ORGANIZER = { email: 'organizer@test', name: '' };
const GUESTS = [
  { email: 'organizer@test', partstat: 'ACCEPTED' },
  { email: 'me@test', partstat: 'ACCEPTED' },
];

/** A plain date of the series, `day` days after its first. */
function seriesDate(day: number, isMine: boolean): TimedOccurrence {
  const start = SERIES_START + day * DAY;
  return {
    id: CalendarUtils.occurrenceId('master-row', start),
    accountId: 'a',
    calendarId: 'c',
    title: 'Daily Standup',
    location: '',
    description: '',
    startDate: calendarDateFromUnix(start),
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isMine,
    isException: false,
    isRecurring: true,
    organizer: isMine ? { email: 'me@test', name: '' } : ORGANIZER,
    attendees: GUESTS,
    start,
    end: start + 3600,
  } as TimedOccurrence;
}

/** The moved 2 March date, as the master's own file draws it. */
const movedDateInMaster = (isMine: boolean): TimedOccurrence => ({
  ...seriesDate(1, isMine),
  id: CalendarUtils.occurrenceId('master-row', MOVED_START),
  isException: true,
  recurrenceIdStart: SERIES_START + DAY,
  start: MOVED_START,
  end: MOVED_START + 3600,
});

/** The moved 2 March date, as its own exception row draws it. */
const movedDateRow = (isMine: boolean): TimedOccurrence => ({
  ...movedDateInMaster(isMine),
  id: 'exception-row-e0',
});

const THIS_OCCURRENCE = 0;
const ALL_OCCURRENCES = 1;

describe('deleting from the calendar', function () {
  let queued: any[];
  let provider: string;
  let choice: number;

  beforeEach(function () {
    queued = [];
    masterIcs = SERIES_ICS;
    provider = 'gmail';
    choice = THIS_OCCURRENCE;
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(dialog, 'showMessageBoxSync').andCallFake(() => choice);
    spyOn(AppEnv, 'showErrorDialog');
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === 'me@test' ? ({ id: 'a' } as any) : null
    );
    spyOn(AccountStore, 'accountForId').andCallFake(() => ({ id: 'a', provider }) as any);
    spyOn(DatabaseStore, 'find').andCallFake((klass: any, id: string) => {
      if (klass === Calendar) return Promise.resolve({ id, readOnly: false } as any);
      return Promise.resolve(id === 'exception-row' ? exceptionRow() : masterRow());
    });
    spyOn(DatabaseStore, 'findBy').andReturn(Promise.resolve(masterRow()));
  });

  const sentKinds = () =>
    queued.map((t) =>
      t instanceof DestroyEventTask ? 'destroy' : t.rsvp ? `answer ${t.rsvp.status}` : 'update'
    );

  describe('as a guest', function () {
    it('on Google, declines a whole series before deleting it, so the organizer is told', async function () {
      choice = ALL_OCCURRENCES;
      await deleteEvents([seriesDate(3, false)]);

      expect(sentKinds()).toEqual(['answer DECLINED', 'destroy']);
      expect(queued[0].event.ics).toContain('PARTSTAT=DECLINED');
      expect(queued[1].events[0].id).toBe('master-row');
    });

    it('on Outlook, only deletes: the sync engine declines it there', async function () {
      provider = 'office365';
      choice = ALL_OCCURRENCES;
      await deleteEvents([seriesDate(3, false)]);

      expect(sentKinds()).toEqual(['destroy']);
    });

    it('on Google, takes one date out of the series without answering or deleting', async function () {
      await deleteEvents([seriesDate(3, false)]);

      expect(sentKinds()).toEqual(['update']);
      expect(queued[0].event.ics).toContain('EXDATE:20260304T060000Z');
    });
  });

  describe('as the organizer', function () {
    it('deletes the whole series for All occurrences, without answering', async function () {
      choice = ALL_OCCURRENCES;
      await deleteEvents([seriesDate(3, true)]);

      expect(sentKinds()).toEqual(['destroy']);
      expect(queued[0].events[0].id).toBe('master-row');
    });

    it('deletes the series, not the moved date’s own row, for All occurrences', async function () {
      choice = ALL_OCCURRENCES;
      await deleteEvents([movedDateRow(true)]);

      expect(sentKinds()).toEqual(['destroy']);
      expect(queued[0].events[0].id).toBe('master-row');
    });

    it('takes two selected dates of one series out in one write', async function () {
      await deleteEvents([seriesDate(3, true), seriesDate(5, true)]);

      expect(sentKinds()).toEqual(['update']);
      expect(queued[0].event.ics).toContain('20260304T060000Z');
      expect(queued[0].event.ics).toContain('20260306T060000Z');
    });

    it('cancels a date moved inside the series’ file at its original slot', async function () {
      await deleteEvents([movedDateInMaster(true)]);

      expect(sentKinds()).toEqual(['update']);
      const { ics } = queued[0].event;
      expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
      expect(ics).toContain('EXDATE:20260302T060000Z');
      expect(ics).not.toContain('20260302T080000Z');
    });

    it('cancels an all-day date moved inside the series’ file at its original date', async function () {
      masterIcs = ALL_DAY_SERIES_ICS;
      const moved: AllDayOccurrence = {
        ...seriesDate(4, true),
        isAllDay: true,
        isException: true,
        startDate: parseCalendarDate('2026-03-05'),
        endDate: parseCalendarDate('2026-03-05'),
        recurrenceIdStart: dayStartUnix(parseCalendarDate('2026-03-02')),
      } as any;
      await deleteEvents([moved]);

      expect(sentKinds()).toEqual(['update']);
      const { ics } = queued[0].event;
      expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
      expect(ics).toMatch(/EXDATE;VALUE=DATE:20260302/);
      expect(ics).not.toContain('20260305');
    });
  });

  it('sends nothing when the dialog is cancelled', async function () {
    choice = 2;
    await deleteEvents([seriesDate(3, false)]);

    expect(queued).toEqual([]);
  });
});
