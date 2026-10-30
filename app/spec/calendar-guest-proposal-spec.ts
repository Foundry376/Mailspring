import fs from 'fs';
import {
  AccountStore,
  Actions,
  AttachmentStore,
  CalendarUtils,
  DatabaseStore,
  Event,
  EventRSVPTask,
  File,
  SyncbackEventTask,
  TaskQueue,
} from 'mailspring-exports';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { editableFields } from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { proposedTimesFor } from '../internal_packages/main-calendar/lib/core/calendar-rsvp';
import * as UnsentChangeDialog from '../internal_packages/main-calendar/lib/core/unsent-change-dialog';

const HOUR = 3600;
// The series' second occurrence, a week after its first.
const SERIES_START = Date.UTC(2026, 10, 3, 15) / 1000;
const START = SERIES_START + 7 * 24 * HOUR;
const ME = 'you@example.com';

const stamp = (unix: number) =>
  new Date(unix * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const lines = (ics: string) => ics.replace(/\r\n[ \t]/g, '').split(/\r?\n/);

function seriesIcs(organizer: string, guest: string) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:interview@test',
    `DTSTART:${stamp(SERIES_START)}`,
    `DTEND:${stamp(SERIES_START + HOUR)}`,
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:Interview',
    'SEQUENCE:2',
    'DTSTAMP:20261001T000000Z',
    `ORGANIZER:mailto:${organizer}`,
    `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${organizer}`,
    `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${guest}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

const rowWith = (ics: string) =>
  new Event({
    id: 'e1',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'interview@test',
    ics,
    recurrenceStart: SERIES_START,
    recurrenceEnd: SERIES_START + HOUR,
  } as any);

function occurrenceOf(organizer: string, guest: string, overrides = {}): TimedOccurrence {
  return {
    id: CalendarUtils.occurrenceId('e1', START),
    accountId: 'a',
    calendarId: 'c',
    title: 'Interview',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: true,
    isMine: organizer === ME,
    organizer: { email: organizer },
    attendees: [
      { email: organizer, name: '', partstat: 'ACCEPTED' },
      { email: guest, name: '', partstat: 'ACCEPTED' },
    ],
    start: START,
    end: START + HOUR,
    ...overrides,
  } as TimedOccurrence;
}

// Invited by Alex; we're a guest.
const invitation = occurrenceOf('alex@example.com', ME);
// Ours, with Jordan invited.
const ours = occurrenceOf(ME, 'jordan@example.com');

function calendarWith(selected: TimedOccurrence[]) {
  const calendar: any = new MailspringCalendar({} as any);
  calendar.setState = (update: object | ((state: object) => object | null)) =>
    Object.assign(calendar.state, typeof update === 'function' ? update(calendar.state) : update);
  calendar.state.selectedEvents = selected;
  calendar.state.calendarsLoaded = true;
  calendar.state.readOnlyCalendarIds = new Set();
  calendar.state.view = CalendarView.WEEK;
  return calendar;
}

function panelFor(event: TimedOccurrence, onUnsentChange: jasmine.Spy) {
  const panel: any = new EventPanel({
    event,
    isCalendarReadOnly: false,
    onBack: () => {},
    unsentChange: null,
    onUnsentChange,
    onSendUnsentChange: () => {},
    onSaveChange: (change) => calendarWith([event])._writeChange(change),
  });
  panel.setState = (update: object) => Object.assign(panel.state, update);
  return panel;
}

describe('editableFields', function () {
  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === ME ? { id: 'a', emailAddress: ME } : null
    );
  });

  const fields = (event: TimedOccurrence, readOnly = false) =>
    [...editableFields(event, readOnly)].sort();

  it('gives the organizer every field', function () {
    expect(fields(ours)).toEqual(
      ['allDay', 'location', 'notes', 'repeat', 'showAs', 'times', 'title'].sort()
    );
  });

  it('gives a guest the time, as a proposal, and their own Show as', function () {
    expect(fields(invitation)).toEqual(['showAs', 'times']);
  });

  it('gives nothing on a read-only calendar', function () {
    expect(fields(ours, true)).toEqual([]);
    expect(fields(invitation, true)).toEqual([]);
  });

  it('gives a guest nothing once the meeting is cancelled', function () {
    expect(fields({ ...invitation, isCancelled: true })).toEqual([]);
  });

  it("gives nothing on someone else's meeting we're not invited to", function () {
    expect(fields(occurrenceOf('alex@example.com', 'jordan@example.com'))).toEqual([]);
  });
});

describe("a guest's proposal", function () {
  let queued: any[];
  let onUnsentChange: jasmine.Spy;
  const times = { start: START + 2 * HOUR, end: START + 3 * HOUR, isAllDay: false };

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === ME ? { id: 'a', emailAddress: ME } : null
    );
    spyOn(DatabaseStore, 'find').andCallFake(() =>
      Promise.resolve(rowWith(seriesIcs('alex@example.com', ME)))
    );
    onUnsentChange = jasmine.createSpy('onUnsentChange');
  });

  it('holds a time change as a proposal for this occurrence, sending nothing', async function () {
    const panel = panelFor(invitation, onUnsentChange);
    panel._changeTimes(times);
    panel._saveTimes();
    await panel._saving;

    expect(queued).toEqual([]);
    expect(onUnsentChange).toHaveBeenCalledWith({
      eventId: 'e1',
      slot: START,
      edits: [],
      proposal: { note: '' },
      times,
    });
  });

  it('sends nothing on Discard or Esc', function () {
    const change = { eventId: 'e1', slot: START, edits: [], proposal: { note: '' }, times };
    spyOn(UnsentChangeDialog, 'showUnsentChangeDialog').andReturn('discard');

    const leaving = calendarWith([invitation]);
    leaving.state.unsentChange = change;
    expect(leaving._mayLeave([])).toBe(true);

    const escaping = calendarWith([invitation]);
    escaping.state.unsentChange = change;
    escaping._onEscape();

    expect(leaving.state.unsentChange).toBe(null);
    expect(escaping.state.unsentChange).toBe(null);
    expect(queued).toEqual([]);
  });

  it('sends one COUNTER for the occurrence with the note, writing nothing to our copy', async function () {
    const calendar = calendarWith([invitation]);
    calendar.state.unsentChange = {
      eventId: 'e1',
      slot: START,
      edits: [],
      proposal: { note: '  Can we do later?  ' },
      times,
    };
    await calendar._sendUnsentChange();

    expect(queued.length).toBe(1);
    const task = queued[0] as EventRSVPTask;
    expect(task instanceof EventRSVPTask).toBe(true);
    expect(task.method).toBe('COUNTER');
    expect(task.toJSON().to).toBe('alex@example.com');
    expect(task.comment).toBe('Can we do later?');
    expect(lines(task.ics)).toContain(`RECURRENCE-ID:${stamp(START)}`);
    expect(lines(task.ics)).toContain(`DTSTART:${stamp(times.start)}`);
    expect(lines(task.ics)).toContain(`DTEND:${stamp(times.end)}`);
    expect(calendar.state.unsentChange).toBe(null);
  });

  it('saves their own Show as to their copy, keeping the SEQUENCE', async function () {
    const panel = panelFor(invitation, onUnsentChange);
    panel._saveProperty({ property: 'transp', value: 'TRANSPARENT' });
    await panel._saving;

    expect(onUnsentChange).not.toHaveBeenCalled();
    expect(queued.length).toBe(1);
    const written = lines((queued[0] as SyncbackEventTask).event.ics);
    expect(written).toContain('TRANSP:TRANSPARENT');
    expect(written.filter((l) => l.startsWith('SEQUENCE'))).toEqual(['SEQUENCE:2']);
  });
});

describe('proposedTimesFor', function () {
  const files: File[] = [];
  const messages: any[] = [];
  const contents = new Map<string, string>();
  let ics: string;

  function counter(
    from: string,
    date: number,
    { start = START + 2 * HOUR, recurrenceId = START, sequence = 2, comment = '' } = {}
  ) {
    const id = `m${messages.length}`;
    files.push(new File({ id: `f-${id}`, accountId: 'a', filename: 'invite.ics', messageId: id }));
    messages.push({ id, from: [{ email: from, name: '' }], date: new Date(date * 1000) });
    contents.set(
      `f-${id}`,
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:COUNTER',
        'BEGIN:VEVENT',
        'UID:interview@test',
        `RECURRENCE-ID:${stamp(recurrenceId)}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(start + HOUR)}`,
        `SEQUENCE:${sequence}`,
        'DTSTAMP:20261001T000000Z',
        ...(comment ? [`COMMENT:${comment}`] : []),
        `ATTENDEE;PARTSTAT=TENTATIVE:mailto:${from}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
    );
  }

  beforeEach(function () {
    files.length = 0;
    messages.length = 0;
    contents.clear();
    ics = seriesIcs(ME, 'jordan@example.com');
    spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(rowWith(ics)));
    spyOn(DatabaseStore, 'findAll').andCallFake((klass: any) => ({
      where: () => Promise.resolve(klass === File ? files : messages),
    }));
    spyOn(AttachmentStore, 'resolvePathForFile').andCallFake((file: File) =>
      Promise.resolve(file.id)
    );
    spyOn(fs.promises, 'readFile').andCallFake((path: string) =>
      Promise.resolve(contents.get(path))
    );
  });

  it("keeps each guest's latest proposal for this occurrence, with its note", async function () {
    counter('jordan@example.com', 100, { start: START + HOUR });
    counter('jordan@example.com', 200, { comment: 'Later works better' });
    counter('jordan@example.com', 150, { start: START + 3 * HOUR });

    expect(await proposedTimesFor(ours)).toEqual([
      {
        from: { email: 'jordan@example.com', name: 'jordan@example.com' },
        start: START + 2 * HOUR,
        end: START + 3 * HOUR,
        isAllDay: false,
        note: 'Later works better',
      },
    ]);
  });

  it('ignores a proposal the event has changed since', async function () {
    counter('jordan@example.com', 100, { sequence: 1 });
    expect(await proposedTimesFor(ours)).toEqual([]);
  });

  it("ignores a proposal from someone who isn't a guest", async function () {
    counter('alex@example.com', 100);
    expect(await proposedTimesFor(ours)).toEqual([]);
  });

  it('ignores a proposal for another occurrence of the series', async function () {
    counter('jordan@example.com', 100, { recurrenceId: SERIES_START });
    expect(await proposedTimesFor(ours)).toEqual([]);
  });

  it('ignores a proposal the event already has', async function () {
    counter('jordan@example.com', 100, { start: START });
    expect(await proposedTimesFor(ours)).toEqual([]);
  });
});

describe("accepting a guest's proposed time", function () {
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(DatabaseStore, 'find').andCallFake(() =>
      Promise.resolve(rowWith(seriesIcs(ME, 'jordan@example.com')))
    );
  });

  it('moves that occurrence on its own once sent', async function () {
    const onUnsentChange = jasmine.createSpy('onUnsentChange');
    const panel = panelFor(ours, onUnsentChange);
    const proposed = { start: START + 2 * HOUR, end: START + 3 * HOUR, isAllDay: false };
    panel._useProposedTime({
      from: { email: 'jordan@example.com', name: 'Jordan' },
      note: '',
      ...proposed,
    });
    expect(queued).toEqual([]);

    const change = onUnsentChange.mostRecentCall.args[0];
    await calendarWith([ours])._writeChange(change, 'this-occurrence');

    expect(queued.length).toBe(1);
    const vevents = (queued[0] as SyncbackEventTask).event.ics.split('BEGIN:VEVENT').slice(1);
    const exception = lines(vevents.find((v) => v.includes('RECURRENCE-ID')));
    expect(exception).toContain(`RECURRENCE-ID:${stamp(START)}`);
    expect(exception).toContain(`DTSTART:${stamp(proposed.start)}`);
    expect(exception).toContain(`DTEND:${stamp(proposed.end)}`);
  });
});
