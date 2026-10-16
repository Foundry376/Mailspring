import { Calendar, CalendarUtils, Event } from 'mailspring-exports';
import {
  resolveRSVPTarget,
  resolveAddTo,
  planRSVPWrite,
  mayBeAddedToCalendar,
  conflictCalendarIds,
} from '../lib/rsvp-target';

const ACCOUNT_ID = 'acct-1';
const ADDRESSES = ['brian@example.com', 'b.alias@example.com'];
const UID = 'meeting-uid@example.com';

function calendar({
  id,
  name,
  readOnly = false,
  ownership = '',
}: {
  id: string;
  name: string;
  readOnly?: boolean;
  /** What DAV:owner said: 'mine', 'other', or '' when the server didn't answer. */
  ownership?: 'mine' | 'other' | '';
}) {
  return new Calendar({ id, accountId: ACCOUNT_ID, name, readOnly, ownership } as any);
}

function event({
  id,
  calendarId,
  recurrenceId = '',
}: {
  id: string;
  calendarId: string;
  recurrenceId?: string;
}) {
  return new Event({
    id,
    accountId: ACCOUNT_ID,
    calendarId,
    icsuid: UID,
    recurrenceId,
    ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
  } as any);
}

const MINE = calendar({ id: 'cal-mine', name: 'brian@example.com' });
const ROOM = calendar({ id: 'cal-room', name: '(Conference room) Boardroom' });
const SHARED = calendar({ id: 'cal-shared', name: 'US On Call' });
const HOLIDAYS = calendar({ id: 'cal-holidays', name: 'Holidays', readOnly: true });

describe('resolveRSVPTarget', function () {
  it('picks our own calendar when the meeting is also on a room calendar', function () {
    const mine = event({ id: 'e-mine', calendarId: MINE.id });
    const { target, problem } = resolveRSVPTarget({
      events: [event({ id: 'e-room', calendarId: ROOM.id }), mine],
      calendars: [MINE, ROOM],
      addresses: ADDRESSES,
    });
    expect(problem).toBe(undefined);
    expect(target.event.id).toBe('e-mine');
    expect(target.calendar.id).toBe(MINE.id);
  });

  it("picks our own calendar when the meeting is also on a colleague's shared calendar", function () {
    const { target } = resolveRSVPTarget({
      events: [
        event({ id: 'e-shared', calendarId: SHARED.id }),
        event({ id: 'e-mine', calendarId: MINE.id }),
      ],
      calendars: [SHARED, MINE],
      addresses: ADDRESSES,
    });
    expect(target.calendar.id).toBe(MINE.id);
  });

  it('recognises our calendar by an alias as well as the primary address', function () {
    const aliasCal = calendar({ id: 'cal-alias', name: 'b.alias@example.com' });
    const { target } = resolveRSVPTarget({
      events: [
        event({ id: 'e-room', calendarId: ROOM.id }),
        event({ id: 'e-alias', calendarId: aliasCal.id }),
      ],
      calendars: [ROOM, aliasCal],
      addresses: ADDRESSES,
    });
    expect(target.calendar.id).toBe(aliasCal.id);
  });

  it('takes the only writable copy when none of the calendars is named for us', function () {
    const { target } = resolveRSVPTarget({
      events: [event({ id: 'e-shared', calendarId: SHARED.id })],
      calendars: [SHARED, HOLIDAYS],
      addresses: ADDRESSES,
    });
    expect(target.calendar.id).toBe(SHARED.id);
  });

  it('refuses to guess between two writable calendars that are not ours', function () {
    const { target, problem } = resolveRSVPTarget({
      events: [
        event({ id: 'e-room', calendarId: ROOM.id }),
        event({ id: 'e-shared', calendarId: SHARED.id }),
      ],
      calendars: [ROOM, SHARED],
      addresses: ADDRESSES,
    });
    expect(target).toBe(null);
    expect(problem).toBe('ambiguous');
  });

  it('reports read-only when the only copy is on a calendar we cannot write', function () {
    const { target, problem } = resolveRSVPTarget({
      events: [event({ id: 'e-hol', calendarId: HOLIDAYS.id })],
      calendars: [HOLIDAYS],
      addresses: ADDRESSES,
    });
    expect(target).toBe(null);
    expect(problem).toBe('read-only');
  });

  it('reports not-on-a-calendar when the invitation has not synced anywhere', function () {
    const { target, problem } = resolveRSVPTarget({
      events: [],
      calendars: [MINE],
      addresses: ADDRESSES,
    });
    expect(target).toBe(null);
    expect(problem).toBe('not-on-a-calendar');
  });

  it('ignores a copy whose calendar the account does not have', function () {
    const { target, problem } = resolveRSVPTarget({
      events: [event({ id: 'e-orphan', calendarId: 'cal-that-went-away' })],
      calendars: [MINE],
      addresses: ADDRESSES,
    });
    expect(target).toBe(null);
    expect(problem).toBe('read-only');
  });

  describe('recurring series', function () {
    it('answers the master rather than a modified occurrence', function () {
      const { target } = resolveRSVPTarget({
        events: [
          event({ id: 'e-exception', calendarId: MINE.id, recurrenceId: '20260315T140000Z' }),
          event({ id: 'e-master', calendarId: MINE.id }),
        ],
        calendars: [MINE],
        addresses: ADDRESSES,
      });
      expect(target.event.id).toBe('e-master');
    });

    it('declines when only a modified occurrence has synced', function () {
      const { target, problem } = resolveRSVPTarget({
        events: [
          event({ id: 'e-exception', calendarId: MINE.id, recurrenceId: '20260315T140000Z' }),
        ],
        calendars: [MINE],
        addresses: ADDRESSES,
      });
      expect(target).toBe(null);
      expect(problem).toBe('not-on-a-calendar');
    });
  });

  it('prefers our own calendar even when it sorts last', function () {
    const { target } = resolveRSVPTarget({
      events: [
        event({ id: 'e-room', calendarId: ROOM.id }),
        event({ id: 'e-shared', calendarId: SHARED.id }),
        event({ id: 'e-mine', calendarId: MINE.id }),
      ],
      calendars: [ROOM, SHARED, MINE],
      addresses: ADDRESSES,
    });
    expect(target.calendar.id).toBe(MINE.id);
  });
});

const NOT_ON_A_CALENDAR = resolveRSVPTarget({ events: [], calendars: [], addresses: ADDRESSES });
const ORGANIZER = 'mailto:ada@example.com';

describe('resolveAddTo', function () {
  const addTo = (calendars, over: any = {}) =>
    resolveAddTo({
      rsvp: NOT_ON_A_CALENDAR,
      calendars,
      addresses: ADDRESSES,
      organizerUri: ORGANIZER,
      ...over,
    });

  it('preselects the calendar named for the account and offers the writable ones', function () {
    const { choices, addTo: chosen } = addTo([ROOM, SHARED, MINE, HOLIDAYS]);
    expect(chosen.id).toBe(MINE.id);
    expect(choices.map((c) => c.id)).toEqual([ROOM.id, SHARED.id, MINE.id]);
  });

  it('matches on an alias too', function () {
    const aliasCal = calendar({ id: 'cal-alias', name: 'b.alias@example.com' });
    expect(addTo([ROOM, aliasCal]).addTo.id).toBe(aliasCal.id);
  });

  it("offers neither a read-only calendar nor one the server says is someone else's", function () {
    const theirs = calendar({ id: 'cal-theirs', name: 'brian@example.com', ownership: 'other' });
    const { choices, addTo: chosen } = addTo([theirs, HOLIDAYS, SHARED]);
    expect(choices.map((c) => c.id)).toEqual([SHARED.id]);
    expect(chosen.id).toBe(SHARED.id);
  });

  it('preselects a calendar the server says is ours over one named after us', function () {
    const plain = calendar({ id: 'cal-plain', name: 'Calendar', ownership: 'mine' });
    const named = calendar({ id: 'cal-named', name: 'brian@example.com', ownership: 'other' });
    expect(addTo([named, plain]).addTo.id).toBe('cal-plain');
  });

  it('preselects the first of several calendars the server says are ours', function () {
    const work = calendar({ id: 'cal-work', name: 'Work', ownership: 'mine' });
    const home = calendar({ id: 'cal-home', name: 'Home', ownership: 'mine' });
    expect(addTo([SHARED, work, home]).addTo.id).toBe('cal-work');
  });

  it('keeps the calendar the user picked while it is still offered', function () {
    expect(addTo([MINE, SHARED], { current: SHARED }).addTo.id).toBe(SHARED.id);
    expect(addTo([MINE, SHARED], { current: HOLIDAYS }).addTo.id).toBe(MINE.id);
  });

  it('offers nothing when every calendar is read-only or nobody has any', function () {
    expect(addTo([HOLIDAYS])).toBe(null);
    expect(addTo([])).toBe(null);
  });

  it('offers nothing once a copy of the event exists', function () {
    const rsvp = resolveRSVPTarget({
      events: [event({ id: 'e-mine', calendarId: MINE.id })],
      calendars: [MINE],
      addresses: ADDRESSES,
    });
    expect(addTo([MINE], { rsvp })).toBe(null);
  });

  it('offers nothing for an invitation that names us as the organizer', function () {
    expect(addTo([MINE], { organizerUri: 'mailto:brian@example.com' })).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Calendar ownership. A calendar's display name is text its owner chooses, so it can't be
// the only thing that decides where a reply gets written. DAV:owner is the server's answer
// and overrides it in both directions.
// ---------------------------------------------------------------------------

describe('resolveRSVPTarget with server-reported ownership', function () {
  const shared = (over: any = {}) =>
    calendar({ id: 'cal-shared', name: 'Team', ownership: 'other', ...over });

  it("refuses a calendar the server says is someone else's, even named after us", function () {
    // The attack this exists to stop: share a writable calendar, name it after the
    // recipient's own address, and collect the replies they meant for their own copy.
    const impostor = calendar({
      id: 'cal-impostor',
      name: 'brian@example.com',
      ownership: 'other',
    });
    const resolution = resolveRSVPTarget({
      events: [event({ id: 'e1', calendarId: 'cal-impostor' })],
      calendars: [impostor],
      addresses: ADDRESSES,
    });
    expect(resolution.target).toBe(null);
    // Reported as somebody else's rather than as ambiguous: there is nothing ambiguous
    // about it, and the UI says so instead of blaming the user's calendar layout.
    expect(resolution.problem).toBe('not-ours');
  });

  it('accepts a calendar the server says is ours, whatever it is called', function () {
    // A default calendar named "Calendar" or "Kalender" is still ours; the name heuristic
    // alone cannot find it.
    const mine = calendar({ id: 'cal-plain', name: 'Calendar', ownership: 'mine' });
    const resolution = resolveRSVPTarget({
      events: [event({ id: 'e1', calendarId: 'cal-plain' })],
      calendars: [mine],
      addresses: ADDRESSES,
    });
    expect(resolution.target && resolution.target.calendar.id).toBe('cal-plain');
  });

  it("never falls back to a foreign calendar just because it's the only writable one", function () {
    const resolution = resolveRSVPTarget({
      events: [event({ id: 'e1', calendarId: 'cal-shared' })],
      calendars: [shared()],
      addresses: ADDRESSES,
    });
    expect(resolution.target).toBe(null);
    expect(resolution.problem).toBe('not-ours');
  });

  it('still uses the name when the server reports no ownership at all', function () {
    // Servers may omit DAV:owner; that must not make every calendar unusable.
    const resolution = resolveRSVPTarget({
      events: [event({ id: 'e1', calendarId: 'cal-mine' })],
      calendars: [MINE],
      addresses: ADDRESSES,
    });
    expect(resolution.target && resolution.target.calendar.id).toBe('cal-mine');
  });
});

// ---------------------------------------------------------------------------
// Storing an emailed invitation. Anyone can send a message; a stored event naming us as
// ORGANIZER makes our own server mail a REQUEST to every ATTENDEE the sender chose.
// ---------------------------------------------------------------------------

describe('mayBeAddedToCalendar', function () {
  it('stores an invitation organized by someone else', function () {
    expect(mayBeAddedToCalendar('mailto:ada@example.com', ADDRESSES)).toBe(true);
  });

  it('refuses one that names us as the organizer', function () {
    expect(mayBeAddedToCalendar('mailto:brian@example.com', ADDRESSES)).toBe(false);
  });

  it('refuses one that names an alias of ours as the organizer', function () {
    expect(mayBeAddedToCalendar('mailto:b.alias@example.com', ADDRESSES)).toBe(false);
  });

  it('is not fooled by capitalisation or a bare address', function () {
    expect(mayBeAddedToCalendar('MAILTO:BRIAN@EXAMPLE.COM', ADDRESSES)).toBe(false);
    expect(mayBeAddedToCalendar('brian@example.com', ADDRESSES)).toBe(false);
  });

  it('refuses an event that names no organizer, which is not a scheduled event', function () {
    expect(mayBeAddedToCalendar('', ADDRESSES)).toBe(false);
    expect(mayBeAddedToCalendar(null as any, ADDRESSES)).toBe(false);
  });
});

describe('planRSVPWrite', function () {
  const INVITE_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:meeting-uid@example.com',
    'DTSTART:20260301T140000Z',
    'DTEND:20260301T150000Z',
    'SUMMARY:Kickoff',
    'DTSTAMP:20260101T000000Z',
    'ORGANIZER;CN=Ada:mailto:ada@example.com',
    'ATTENDEE;CN=Ada;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:ada@example.com',
    'ATTENDEE;CN=Brian;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const inviteEvent = CalendarUtils.parseICSString(INVITE_ICS).event;
  const synced = new Event({
    id: 'e-mine',
    accountId: ACCOUNT_ID,
    calendarId: MINE.id,
    icsuid: UID,
    ics: INVITE_ICS.replace('METHOD:REQUEST\r\n', ''),
  } as any);
  const plan = (over: any = {}) =>
    planRSVPWrite({
      rsvp: NOT_ON_A_CALENDAR,
      addTo: MINE,
      status: 'ACCEPTED',
      myEmail: 'brian@example.com',
      inviteIcs: INVITE_ICS,
      inviteEvent,
      accountId: ACCOUNT_ID,
      ...over,
    });
  const myLine = (ics: string) =>
    ics.split(/\r?\n/).find((l) => l.startsWith('ATTENDEE') && l.includes('brian@'));

  it('records the answer on our synced copy and leaves the invitation alone', function () {
    const rsvp = resolveRSVPTarget({ events: [synced], calendars: [MINE], addresses: ADDRESSES });
    const write = plan({ rsvp, status: 'DECLINED' });
    if (write.kind !== 'update') throw new Error(`expected an update, got ${write.kind}`);
    expect(write.event.id).toBe('e-mine');
    expect(write.answer.email).toBe('brian@example.com');
    expect(write.answer.status).toBe('DECLINED');
    expect(write.answer.occurrenceIcs).toBeUndefined();
    expect(write.event).not.toBe(synced);
    expect(myLine(write.event.ics)).toContain('PARTSTAT=DECLINED');
    expect(myLine(synced.ics)).toContain('PARTSTAT=NEEDS-ACTION');
  });

  it('writes nothing when our copy no longer lists us', function () {
    const withoutMe = synced.clone();
    withoutMe.ics = synced.ics.replace(/ATTENDEE[^\r\n]*brian@example.com\r\n/, '');
    const rsvp = resolveRSVPTarget({
      events: [withoutMe],
      calendars: [MINE],
      addresses: ADDRESSES,
    });
    expect(plan({ rsvp })).toBe(null);
  });

  it('adds an accepted invitation to the chosen calendar, answered and without its METHOD', function () {
    const write = plan();
    if (write.kind !== 'create') throw new Error(`expected a create, got ${write.kind}`);
    expect(write.calendar.id).toBe(MINE.id);
    expect(write.event.calendarId).toBe(MINE.id);
    expect(write.event.icsuid).toBe('meeting-uid@example.com');
    expect(write.event.recurrenceStart).toBe(Date.UTC(2026, 2, 1, 14) / 1000);
    expect(write.event.recurrenceEnd).toBe(Date.UTC(2026, 2, 1, 15) / 1000);
    expect(write.event.ics).not.toContain('METHOD');
    expect(myLine(write.event.ics)).toContain('PARTSTAT=ACCEPTED');
    expect(myLine(write.event.ics)).not.toContain('RSVP=TRUE');
  });

  it('adds a tentative one too', function () {
    expect(plan({ status: 'TENTATIVE' }).kind).toBe('create');
  });

  it('does not add a declined invitation', function () {
    expect(plan({ status: 'DECLINED' })).toBe(null);
  });

  it('adds nothing when no calendar was offered', function () {
    expect(plan({ addTo: undefined })).toBe(null);
  });

  it('adds nothing when the copies are on calendars we cannot answer on', function () {
    const rsvp = resolveRSVPTarget({
      events: [event({ id: 'e-h', calendarId: HOLIDAYS.id })],
      calendars: [HOLIDAYS],
      addresses: ADDRESSES,
    });
    expect(rsvp.problem).toBe('read-only');
    expect(plan({ rsvp })).toBe(null);
  });

  it('adds nothing when the invitation does not list us', function () {
    expect(plan({ myEmail: 'nobody@example.com' })).toBe(null);
  });

  it('writes nothing before the calendar copies have loaded', function () {
    expect(plan({ rsvp: undefined })).toBe(null);
  });

  describe('for an invitation to one occurrence of a series', function () {
    // The emailed VEVENT names the 15 Sep occurrence; our copy holds the series and that week.
    const occurrence = (summary: string, dtstart: string) => [
      'BEGIN:VEVENT',
      'UID:meeting-uid@example.com',
      'RECURRENCE-ID:20260915T140000Z',
      `DTSTART:${dtstart}`,
      'DTEND:20260915T161500Z',
      `SUMMARY:${summary}`,
      'DTSTAMP:20260101T000000Z',
      'ORGANIZER;CN=Ada:mailto:ada@example.com',
      'ATTENDEE;CN=Ada;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:ada@example.com',
      'ATTENDEE;CN=Brian;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
      'END:VEVENT',
    ];
    const SERIES_MASTER = [
      'BEGIN:VEVENT',
      'UID:meeting-uid@example.com',
      'DTSTART:20250923T140000Z',
      'DTEND:20250923T141500Z',
      'RRULE:FREQ=WEEKLY',
      'SUMMARY:Huddle',
      'DTSTAMP:20260101T000000Z',
      'ORGANIZER;CN=Ada:mailto:ada@example.com',
      'ATTENDEE;CN=Ada;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:ada@example.com',
      'ATTENDEE;CN=Brian;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
      'END:VEVENT',
    ];
    const vcalendar = (...vevents: string[][]) =>
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Test//Test//EN',
        ...vevents.flat(),
        'END:VCALENDAR',
      ].join('\r\n');
    const OCCURRENCE_INVITE = vcalendar(
      ['METHOD:REQUEST'],
      occurrence('Huddle', '20260915T150000Z')
    );
    const occurrenceEvent = CalendarUtils.parseICSString(OCCURRENCE_INVITE).event;
    const copyWith = (...vevents: string[][]) =>
      new Event({
        id: 'e-mine',
        accountId: ACCOUNT_ID,
        calendarId: MINE.id,
        icsuid: UID,
        ics: vcalendar(SERIES_MASTER, ...vevents),
      } as any);
    // Unfolded first: ical.js folds a long ATTENDEE line at 75 columns (RFC 5545 section 3.1).
    const myLines = (ics: string) =>
      ics
        .replace(/\r\n[ \t]/g, '')
        .split(/\r?\n/)
        .filter((l) => l.startsWith('ATTENDEE') && l.includes('brian@'));
    const planOccurrence = (copy: Event) =>
      plan({
        rsvp: resolveRSVPTarget({ events: [copy], calendars: [MINE], addresses: ADDRESSES }),
        inviteIcs: OCCURRENCE_INVITE,
        inviteEvent: occurrenceEvent,
      });

    it("answers on that occurrence's VEVENT of our copy, and leaves the series as it was", function () {
      const write = planOccurrence(copyWith(occurrence('Huddle (as synced)', '20260915T160000Z')));
      if (write.kind !== 'update') throw new Error(`expected an update, got ${write.kind}`);
      expect(write.answer.occurrenceIcs).toBe(OCCURRENCE_INVITE);
      const [master, synced] = write.event.ics
        .replace(/\r\n[ \t]/g, '')
        .split('BEGIN:VEVENT')
        .slice(1);
      expect(myLines(master)).toEqual([
        'ATTENDEE;CN=Brian;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
      ]);
      expect(synced).toContain('DTSTART:20260915T160000Z');
      expect(myLines(synced)[0]).toContain('PARTSTAT=ACCEPTED');
      expect(myLines(synced)[0]).not.toContain('RSVP=TRUE');
    });

    it('stores the emailed occurrence as an exception when our copy has none for it', function () {
      const write = planOccurrence(copyWith());
      expect(write.kind).toBe('update');
      const vevents = write.event.ics
        .replace(/\r\n[ \t]/g, '')
        .split('BEGIN:VEVENT')
        .slice(1);
      expect(vevents.length).toBe(2);
      expect(myLines(vevents[0])[0]).toContain('PARTSTAT=NEEDS-ACTION');
      expect(vevents[1]).toContain('RECURRENCE-ID:20260915T140000Z');
      expect(vevents[1]).toContain('DTSTART:20260915T150000Z');
      expect(myLines(vevents[1])[0]).toContain('PARTSTAT=ACCEPTED');
      expect(write.event.ics).not.toContain('METHOD');
    });
  });
});

describe('conflictCalendarIds', function () {
  const theirs = calendar({ id: 'cal-theirs', name: 'Team', ownership: 'other' });

  it("counts writable calendars that are shown and not someone else's", function () {
    expect(conflictCalendarIds([MINE, SHARED, HOLIDAYS, theirs], [])).toEqual([MINE.id, SHARED.id]);
  });

  it('leaves out a calendar switched off in the sidebar', function () {
    expect(conflictCalendarIds([MINE, SHARED], [SHARED.id])).toEqual([MINE.id]);
  });

  it('leaves out a read-only feed', function () {
    expect(conflictCalendarIds([HOLIDAYS], [])).toEqual([]);
  });

  it("leaves out a calendar the server says is someone else's", function () {
    expect(conflictCalendarIds([theirs], [])).toEqual([]);
  });
});
