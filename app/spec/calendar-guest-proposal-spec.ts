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
  ICSEventHelpers,
  SyncbackEventTask,
  TaskQueue,
} from 'mailspring-exports';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import {
  TimedOccurrence,
  occurrencesForEvents,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { editableFields } from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import {
  occurrenceRecurrenceId,
  proposedTimesFor,
} from '../internal_packages/main-calendar/lib/core/calendar-rsvp';
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

const dragOf = (times: { start: number; end: number }, previewIsAllDay: boolean) => ({
  event: invitation,
  mode: 'move',
  previewStart: times.start,
  previewEnd: times.end,
  previewIsAllDay,
});

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
      guestCopy: true,
      edits: [],
      proposal: { comment: '' },
      times,
    });
  });

  it('sends nothing on Discard or Esc', function () {
    const change = { eventId: 'e1', slot: START, edits: [], proposal: { comment: '' }, times };
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

  it('sends one COUNTER for the occurrence with the comment, writing nothing to our copy', async function () {
    const calendar = calendarWith([invitation]);
    calendar.state.unsentChange = {
      eventId: 'e1',
      slot: START,
      edits: [],
      proposal: { comment: '  Can we do later?  ' },
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

  it('moves a drag into a proposal, writing nothing', async function () {
    const calendar = calendarWith([invitation]);
    await calendar._persistDragChange(dragOf(times, false));

    expect(queued).toEqual([]);
    expect(calendar.state.unsentChange.times).toEqual(times);
    expect(calendar.state.unsentChange.proposal).toEqual({ comment: '' });
  });

  it('drops a drag across the all-day row, writing nothing', async function () {
    const calendar = calendarWith([invitation]);
    await calendar._persistDragChange(dragOf(times, true));

    expect(queued).toEqual([]);
    expect(calendar.state.unsentChange).toBeFalsy();
  });

  it('leaves a Show as waiting for its scope out of a drag', async function () {
    const calendar = calendarWith([invitation]);
    const showAs = {
      eventId: 'e1',
      slot: START,
      guestCopy: true,
      edits: [{ property: 'transp', value: 'TRANSPARENT' }],
    };
    calendar.state.unsentChange = showAs;
    await calendar._persistDragChange(dragOf(times, false));

    expect(queued).toEqual([]);
    expect(calendar.state.unsentChange).toBe(showAs);
  });
});

describe("a guest's Show as", function () {
  let queued: any[];
  let onUnsentChange: jasmine.Spy;
  let ics: string;
  const showAs = { property: 'transp', value: 'TRANSPARENT' };

  const veventsOf = (written: string) =>
    written
      .split('BEGIN:VEVENT')
      .slice(1)
      .map((v) => lines(v));
  const writtenIcs = () => (queued[0] as SyncbackEventTask).event.ics;
  const withMovedOccurrence = (series: string) =>
    series.replace(
      'END:VCALENDAR',
      [
        'BEGIN:VEVENT',
        'UID:interview@test',
        `RECURRENCE-ID:${stamp(START)}`,
        `DTSTART:${stamp(START + HOUR)}`,
        `DTEND:${stamp(START + 2 * HOUR)}`,
        'SUMMARY:Interview',
        'SEQUENCE:2',
        'DTSTAMP:20261001T000000Z',
        'ORGANIZER:mailto:alex@example.com',
        `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${ME}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
    );
  const moved = occurrenceOf('alex@example.com', ME, {
    id: CalendarUtils.occurrenceId('e1', START + HOUR),
    isException: true,
    recurrenceIdStart: START,
    start: START + HOUR,
    end: START + 2 * HOUR,
  });

  beforeEach(function () {
    queued = [];
    ics = seriesIcs('alex@example.com', ME);
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === ME ? { id: 'a', emailAddress: ME } : null
    );
    spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(rowWith(ics)));
    onUnsentChange = jasmine.createSpy('onUnsentChange');
  });

  it('waits for a scope on an occurrence of a series, separate from any proposal', function () {
    panelFor(invitation, onUnsentChange)._saveProperty(showAs);

    expect(queued).toEqual([]);
    const change = onUnsentChange.mostRecentCall.args[0];
    expect(change.edits).toEqual([showAs]);
    expect(change.proposal).toBeUndefined();
  });

  it('writes this occurrence alone, keeping every SEQUENCE', async function () {
    await calendarWith([invitation])._writeChange(
      { eventId: 'e1', slot: START, guestCopy: true, edits: [showAs] },
      'this-occurrence'
    );

    const [master, exception] = veventsOf(writtenIcs());
    expect(master).not.toContain('TRANSP:TRANSPARENT');
    expect(exception).toContain('TRANSP:TRANSPARENT');
    expect(exception).toContain(`RECURRENCE-ID:${stamp(START)}`);
    expect(master).toContain('SEQUENCE:2');
    expect(exception).toContain('SEQUENCE:2');
  });

  it('writes every occurrence, keeping the SEQUENCE', async function () {
    await calendarWith([invitation])._writeChange(
      { eventId: 'e1', slot: START, guestCopy: true, edits: [showAs] },
      'all-occurrences'
    );

    const vevents = veventsOf(writtenIcs());
    expect(vevents.length).toBe(1);
    expect(vevents[0]).toContain('TRANSP:TRANSPARENT');
    expect(vevents[0]).toContain('SEQUENCE:2');
  });

  it('saves straight to an occurrence the organizer moved', async function () {
    ics = withMovedOccurrence(ics);
    const panel = panelFor(moved, onUnsentChange);
    panel._saveProperty(showAs);
    await panel._saving;

    expect(onUnsentChange).not.toHaveBeenCalled();
    const [master, exception] = veventsOf(writtenIcs());
    expect(master).not.toContain('TRANSP:TRANSPARENT');
    expect(exception).toContain('TRANSP:TRANSPARENT');
    expect(exception).toContain(`DTSTART:${stamp(START + HOUR)}`);
    expect(exception).toContain('SEQUENCE:2');
  });

  it('saves straight to a one-off invitation', async function () {
    ics = ics.replace('RRULE:FREQ=WEEKLY\r\n', '');
    const oneOff = occurrenceOf('alex@example.com', ME, { isRecurring: false });
    const panel = panelFor(oneOff, onUnsentChange);
    panel._saveProperty(showAs);
    await panel._saving;

    expect(onUnsentChange).not.toHaveBeenCalled();
    expect(lines(writtenIcs())).toContain('TRANSP:TRANSPARENT');
    expect(lines(writtenIcs())).toContain('SEQUENCE:2');
  });

  it('keeps the SEQUENCE when the panel has moved on before the save runs', async function () {
    await calendarWith([])._writeChange(
      { eventId: 'e1', slot: START, guestCopy: true, edits: [showAs] },
      'this-occurrence'
    );

    veventsOf(writtenIcs()).forEach((vevent) => expect(vevent).toContain('SEQUENCE:2'));
  });

  it("isn't offered on a copy on someone else's calendar", function () {
    const panel = panelFor(invitation, onUnsentChange);
    expect(panel._canSetShowAs()).toBe(true);
    panel.props = { ...panel.props, calendar: { ownership: 'other' } };
    expect(panel._canSetShowAs()).toBe(false);
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

  it("keeps each guest's latest proposal for this occurrence, with its comment", async function () {
    counter('jordan@example.com', 100, { start: START + HOUR });
    counter('jordan@example.com', 200, { comment: 'Later works better' });
    counter('jordan@example.com', 150, { start: START + 3 * HOUR });

    expect(await proposedTimesFor(ours)).toEqual([
      {
        from: { email: 'jordan@example.com', name: 'jordan@example.com' },
        start: START + 2 * HOUR,
        end: START + 3 * HOUR,
        isAllDay: false,
        comment: 'Later works better',
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

  it('skips a proposal written without its times, keeping the others', async function () {
    counter('jordan@example.com', 100);
    counter('jordan@example.com', 200);
    contents.set('f-m1', contents.get('f-m1').replace(/DT(START|END):.*\r\n/g, ''));

    expect((await proposedTimesFor(ours)).length).toBe(1);
  });

  describe('reading back what createCounterProposal sends', function () {
    const wrap = (...vevent: string[]) =>
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Test//Test//EN',
        'BEGIN:VEVENT',
        'UID:interview@test',
        ...vevent,
        'SUMMARY:Interview',
        'SEQUENCE:1',
        'DTSTAMP:20261001T000000Z',
        `ORGANIZER:mailto:${ME}`,
        `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${ME}`,
        'ATTENDEE;PARTSTAT=ACCEPTED:mailto:jordan@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const zoned = (start: string, end: string) => [
      `DTSTART;TZID=America/New_York:${start}`,
      `DTEND;TZID=America/New_York:${end}`,
    ];
    const allDay = ['DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261104'];
    const WEEKLY = 'RRULE:FREQ=WEEKLY;COUNT=4';
    const timedSeries = [...zoned('20261103T100000', '20261103T110000'), WEEKLY];

    const cases: [string, string][] = [
      ['a zoned one-off', wrap(...zoned('20261110T100000', '20261110T110000'))],
      ['an all-day one-off', wrap(...allDay)],
      ['an occurrence of a zoned series', wrap(...timedSeries)],
      ['an occurrence of an all-day series', wrap(...allDay, WEEKLY)],
      [
        'an occurrence the organizer moved',
        wrap(...timedSeries).replace(
          'END:VCALENDAR',
          [
            'BEGIN:VEVENT',
            'UID:interview@test',
            'RECURRENCE-ID;TZID=America/New_York:20261110T100000',
            ...zoned('20261110T140000', '20261110T150000'),
            'SUMMARY:Interview',
            'SEQUENCE:3',
            'DTSTAMP:20261001T000000Z',
            `ORGANIZER:mailto:${ME}`,
            'ATTENDEE;PARTSTAT=ACCEPTED:mailto:jordan@example.com',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\r\n')
        ),
      ],
    ];

    cases.forEach(([name, source]) => {
      it(`for ${name}`, async function () {
        ics = source;
        const range = {
          startUnix: Date.UTC(2026, 10, 1) / 1000,
          endUnix: Date.UTC(2026, 11, 1) / 1000,
        };
        const expanded = occurrencesForEvents([rowWith(source)], range);
        const target = {
          ...(expanded.find((o) => o.isException) || expanded[expanded.length > 1 ? 1 : 0]),
          isMine: true,
        };
        const start = target.isAllDay
          ? new Date(2026, 10, 20)
          : new Date(Date.UTC(2026, 10, 20, 18));
        const end = target.isAllDay ? new Date(2026, 10, 21) : new Date(Date.UTC(2026, 10, 20, 19));
        files.push(
          new File({ id: 'sent', accountId: 'a', filename: 'invite.ics', messageId: 'm' })
        );
        messages.push({
          id: 'm',
          from: [{ email: 'jordan@example.com', name: '' }],
          date: new Date(),
        });
        contents.set(
          'sent',
          ICSEventHelpers.createCounterProposal(source, {
            email: 'jordan@example.com',
            start,
            end,
            comment: 'Later works better',
            recurrenceId: occurrenceRecurrenceId(target),
          })
        );

        const [proposal] = await proposedTimesFor(target);
        expect(proposal.start).toBe(start.getTime() / 1000);
        expect(proposal.end).toBe(end.getTime() / 1000);
        expect(proposal.isAllDay).toBe(!!target.isAllDay);
        expect(proposal.comment).toBe('Later works better');
      });
    });
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
      comment: '',
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
