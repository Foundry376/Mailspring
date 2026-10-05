import {
  AccountStore,
  Actions,
  DatabaseStore,
  Event,
  EventRSVPTask,
  SyncbackEventTask,
} from 'mailspring-exports';
import { Calendar } from '../src/flux/models/calendar';
import {
  occurrenceRecurrenceId,
  openProposeNewTimePopover,
  proposeNewTimeForCalendarEvent,
  respondToCalendarEvent,
} from '../internal_packages/main-calendar/lib/core/calendar-rsvp';
import { parseCalendarDate } from '../src/calendar-date';

const ME = 'brian@example.com';
const START = Date.UTC(2026, 2, 10, 14) / 1000;

const SERIES_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'BEGIN:VEVENT',
  'UID:series@test',
  'DTSTART:20260303T140000Z',
  'DTEND:20260303T150000Z',
  'RRULE:FREQ=WEEKLY',
  'SUMMARY:Design Review',
  'DTSTAMP:20260101T000000Z',
  'ORGANIZER;CN=Ada:mailto:ada@example.com',
  'ATTENDEE;CN=Ada;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:ada@example.com',
  `ATTENDEE;CN=Me;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${ME}`,
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const ALL_DAY_ICS = SERIES_ICS.replace(
  'DTSTART:20260303T140000Z',
  'DTSTART;VALUE=DATE:20260303'
).replace('DTEND:20260303T150000Z', 'DTEND;VALUE=DATE:20260304');

function occurrence(overrides: any = {}) {
  return {
    id: 'event-1-e1773151200',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: 'Design Review',
    isAllDay: false,
    start: START,
    end: START + 3600,
    startDate: parseCalendarDate('2026-03-10'),
    endDate: parseCalendarDate('2026-03-10'),
    isRecurring: true,
    isException: false,
    organizer: { email: 'ada@example.com' },
    isMine: false,
    attendees: [
      { email: 'ada@example.com', name: 'Ada', partstat: 'ACCEPTED' },
      { email: ME, name: 'Me', partstat: 'NEEDS-ACTION' },
    ],
    ...overrides,
  } as any;
}

const lines = (ics: string) => ics.replace(/\r\n[ \t]/g, '').split(/\r?\n/);

describe('occurrenceRecurrenceId', function () {
  it('is null for an event that does not repeat', function () {
    expect(occurrenceRecurrenceId(occurrence({ isRecurring: false }))).toBe(null);
  });

  it('names a regular occurrence by its start', function () {
    expect(occurrenceRecurrenceId(occurrence()).toString()).toBe('2026-03-10T14:00:00Z');
  });

  it('names a moved occurrence by where it was, not where it is', function () {
    const moved = occurrence({ isException: true, recurrenceIdStart: START - 86400 });
    expect(occurrenceRecurrenceId(moved).toString()).toBe('2026-03-09T14:00:00Z');
  });

  it('names an all-day occurrence by its date', function () {
    const allDay = occurrence({ isAllDay: true, start: undefined, end: undefined });
    expect(occurrenceRecurrenceId(allDay).toString()).toBe('2026-03-10');
  });
});

describe('answering and countering from the calendar', function () {
  let queued: any[];
  let event: Event;
  let calendar: Calendar;
  let dialog: jasmine.Spy;

  beforeEach(function () {
    queued = [];
    event = new Event({
      id: 'event-1',
      accountId: 'acct-1',
      calendarId: 'cal-1',
      icsuid: 'series@test',
      ics: SERIES_ICS,
    } as any);
    calendar = new Calendar({
      id: 'cal-1',
      accountId: 'acct-1',
      name: ME,
      ownership: 'mine',
    } as any);
    spyOn(DatabaseStore, 'find').andCallFake((klass: any) =>
      Promise.resolve(klass === Event ? event : calendar)
    );
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email.toLowerCase() === ME ? { id: 'acct-1', emailAddress: ME } : null
    );
    spyOn(AccountStore, 'accountForId').andReturn({ id: 'acct-1', emailAddress: ME });
    spyOn(AppEnv, 'showErrorDialog');
    // The recurring-event question; 0 = this occurrence, 1 = all occurrences, 2 = cancel.
    dialog = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync').andReturn(1);
  });

  describe('proposeNewTimeForCalendarEvent', function () {
    const proposal = {
      start: new Date('2026-03-10T16:00:00Z'),
      end: new Date('2026-03-10T17:00:00Z'),
      comment: 'Clashes with standup',
    };

    it('sends a COUNTER to the organizer naming the occurrence', async function () {
      await proposeNewTimeForCalendarEvent(occurrence(), proposal);
      const task = queued[0] as EventRSVPTask;
      expect(task instanceof EventRSVPTask).toBe(true);
      expect(task.method).toBe('COUNTER');
      expect(task.toJSON().to).toBe('ada@example.com');
      expect(lines(task.ics)).toContain('RECURRENCE-ID:20260310T140000Z');
      expect(lines(task.ics)).toContain('DTSTART:20260310T160000Z');
      expect(lines(task.ics)).not.toContain('RRULE:FREQ=WEEKLY');
      expect(task.comment).toBe('Clashes with standup');
    });

    it('keeps an all-day occurrence on dates', async function () {
      event.ics = ALL_DAY_ICS;
      await proposeNewTimeForCalendarEvent(occurrence({ isAllDay: true }), {
        start: new Date(2026, 2, 12),
        end: new Date(2026, 2, 13),
        comment: '',
      });
      const written = lines((queued[0] as EventRSVPTask).ics);
      expect(written).toContain('RECURRENCE-ID;VALUE=DATE:20260310');
      expect(written).toContain('DTSTART;VALUE=DATE:20260312');
      expect(written).toContain('DTEND;VALUE=DATE:20260313');
    });

    it('explains instead of sending when we are not a guest', async function () {
      event.ics = SERIES_ICS.replace(`mailto:${ME}`, 'mailto:bo@example.com');
      await proposeNewTimeForCalendarEvent(occurrence(), proposal);
      expect(queued.length).toBe(0);
      expect((AppEnv.showErrorDialog as jasmine.Spy).mostRecentCall.args[0]).toContain(
        'guest list'
      );
    });
  });

  describe('openProposeNewTimePopover', function () {
    it('opens the picker on the occurrence, dates only for an all-day one', function () {
      const openPopover = spyOn(Actions, 'openPopover');
      openProposeNewTimePopover(occurrence());
      let element = openPopover.mostRecentCall.args[0];
      expect(element.props.start).toBe(START);
      expect(element.props.end).toBe(START + 3600);
      expect(element.props.isAllDay).toBe(false);

      openProposeNewTimePopover(occurrence({ isAllDay: true, start: undefined, end: undefined }));
      element = openPopover.mostRecentCall.args[0];
      expect(element.props.isAllDay).toBe(true);
      expect(element.props.end - element.props.start).toBe(86400);
    });
  });

  describe('respondToCalendarEvent', function () {
    const myLines = (ics: string) =>
      lines(ics).filter((l) => l.startsWith('ATTENDEE') && l.includes(ME));
    const veventsOf = (ics: string) =>
      ics
        .replace(/\r\n[ \t]/g, '')
        .split('BEGIN:VEVENT')
        .slice(1);

    it('writes our answer onto our copy and emails the organizer', async function () {
      await respondToCalendarEvent(occurrence(), 'ACCEPTED');
      const [write, reply] = queued as [SyncbackEventTask, EventRSVPTask];
      expect(write instanceof SyncbackEventTask).toBe(true);
      expect(lines(write.event.ics).find((l) => l.includes(ME))).toContain('PARTSTAT=ACCEPTED');
      expect(reply instanceof EventRSVPTask).toBe(true);
      expect(reply.toJSON().to).toBe('ada@example.com');
      expect(reply.icsRSVPStatus).toBe('ACCEPTED');
    });

    it('asks whether the answer is for this occurrence or the whole series', async function () {
      await respondToCalendarEvent(occurrence(), 'ACCEPTED');
      expect(dialog.callCount).toBe(1);
      const options = dialog.mostRecentCall.args[0];
      expect(options.buttons).toEqual(['This occurrence only', 'All occurrences', 'Cancel']);
      expect(options.message).toContain('Design Review');
      expect(options.detail).toContain('answer only this occurrence');
    });

    it('answers only the clicked occurrence when asked to, on our copy and in the reply', async function () {
      dialog.andReturn(0);
      await respondToCalendarEvent(occurrence(), 'ACCEPTED');
      const [write, reply] = queued as [SyncbackEventTask, EventRSVPTask];
      const [master, exception] = veventsOf(write.event.ics);
      expect(myLines(master)[0]).toContain('PARTSTAT=NEEDS-ACTION');
      expect(exception).toContain('RECURRENCE-ID:20260310T140000Z');
      expect(exception).toContain('DTSTART:20260310T140000Z');
      expect(exception).toContain('DTEND:20260310T150000Z');
      expect(exception).not.toContain('RRULE');
      expect(myLines(exception)[0]).toContain('PARTSTAT=ACCEPTED');
      // The REPLY is about that occurrence alone (RFC 5546 section 3.2.3).
      const replied = veventsOf(reply.ics);
      expect(replied.length).toBe(1);
      expect(replied[0]).toContain('RECURRENCE-ID:20260310T140000Z');
      expect(replied[0]).not.toContain('RRULE');
    });

    it('answers the whole series when asked to', async function () {
      dialog.andReturn(1);
      await respondToCalendarEvent(occurrence(), 'DECLINED');
      const [write, reply] = queued as [SyncbackEventTask, EventRSVPTask];
      expect(veventsOf(write.event.ics).length).toBe(1);
      expect(myLines(write.event.ics)[0]).toContain('PARTSTAT=DECLINED');
      expect(reply.ics).toContain('RRULE:FREQ=WEEKLY');
    });

    it('does nothing when the question is dismissed', async function () {
      dialog.andReturn(2);
      await respondToCalendarEvent(occurrence(), 'ACCEPTED');
      expect(queued.length).toBe(0);
    });

    it('does not ask about an event that does not repeat', async function () {
      event = new Event({
        id: 'event-1',
        accountId: 'acct-1',
        calendarId: 'cal-1',
        icsuid: 'series@test',
        ics: SERIES_ICS.replace('RRULE:FREQ=WEEKLY\r\n', ''),
      } as any);
      await respondToCalendarEvent(occurrence({ isRecurring: false }), 'ACCEPTED');
      expect(dialog.callCount).toBe(0);
      expect(queued.length).toBe(2);
    });

    it("only emails when the copy is on a calendar the server says is someone else's", async function () {
      calendar = new Calendar({
        id: 'cal-1',
        accountId: 'acct-1',
        name: 'Team',
        ownership: 'other',
      } as any);
      await respondToCalendarEvent(occurrence(), 'DECLINED');
      expect(queued.length).toBe(1);
      expect(queued[0] instanceof EventRSVPTask).toBe(true);
    });

    it('only emails when the calendar is read-only', async function () {
      calendar = new Calendar({
        id: 'cal-1',
        accountId: 'acct-1',
        name: ME,
        readOnly: true,
      } as any);
      await respondToCalendarEvent(occurrence(), 'TENTATIVE');
      expect(queued.length).toBe(1);
    });
  });
});
