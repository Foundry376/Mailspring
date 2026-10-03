import { Event, ICSEventHelpers } from 'mailspring-exports';

const { findConflicts, upcomingOccurrence } = ICSEventHelpers;

const ACCOUNT_ID = 'acct-1';
const ADDRESSES = ['brian@example.com'];

/** 2026-03-02 is a Monday. All fixtures are UTC so the assertions read as wall-clock. */
const unix = (iso: string) => Math.round(new Date(iso).getTime() / 1000);

let uidCounter = 0;

function eventWith({
  summary = 'Busy',
  start = '20260302T140000Z',
  end = '20260302T150000Z',
  rrule = '',
  transp = '',
  status = '',
  attendees = '',
  uid = `uid-${(uidCounter += 1)}@test`,
  recurrenceId = '',
  extra = '',
}: Partial<{
  summary: string;
  start: string;
  end: string;
  rrule: string;
  transp: string;
  status: string;
  attendees: string;
  uid: string;
  recurrenceId: string;
  extra: string;
}> = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    'DTSTAMP:20260101T000000Z',
    rrule && `RRULE:${rrule}`,
    transp && `TRANSP:${transp}`,
    status && `STATUS:${status}`,
    attendees,
    extra,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return new Event({
    id: `event-${uid}`,
    accountId: ACCOUNT_ID,
    calendarId: 'cal-1',
    icsuid: uid,
    recurrenceId,
    ics: lines.join('\r\n'),
  } as any);
}

/** An all-day event needs DATE-valued DTSTART/DTEND rather than timestamps. */
function allDayEvent(summary: string, startDate: string, endDate: string) {
  const uid = `allday-${(uidCounter += 1)}@test`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${summary}`,
    'DTSTAMP:20260101T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return new Event({
    id: `event-${uid}`,
    accountId: ACCOUNT_ID,
    calendarId: 'cal-1',
    icsuid: uid,
    recurrenceId: '',
    ics,
  } as any);
}

const WINDOW = { start: unix('2026-03-02T14:30:00Z'), end: unix('2026-03-02T15:30:00Z') };

function find(events: Event[], overrides = {}) {
  return findConflicts({ events, addresses: ADDRESSES, ...WINDOW, ...overrides });
}

describe('findConflicts', function () {
  it('reports an event that overlaps the window', function () {
    const conflicts = find([eventWith({ summary: 'Standup' })]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].title).toBe('Standup');
    expect(conflicts[0].start).toBe(unix('2026-03-02T14:00:00Z'));
  });

  it('ignores an event that ends exactly when the window starts', function () {
    const conflicts = find([eventWith({ start: '20260302T133000Z', end: '20260302T143000Z' })]);
    expect(conflicts.length).toBe(0);
  });

  it('ignores an event that starts exactly when the window ends', function () {
    const conflicts = find([eventWith({ start: '20260302T153000Z', end: '20260302T163000Z' })]);
    expect(conflicts.length).toBe(0);
  });

  it('reports an event entirely inside the window', function () {
    expect(find([eventWith({ start: '20260302T144500Z', end: '20260302T150000Z' })]).length).toBe(
      1
    );
  });

  it('reports an event that swallows the window', function () {
    expect(find([eventWith({ start: '20260302T120000Z', end: '20260302T180000Z' })]).length).toBe(
      1
    );
  });

  it('ignores an event marked free rather than busy', function () {
    expect(find([eventWith({ transp: 'TRANSPARENT' })]).length).toBe(0);
  });

  it('ignores a cancelled event', function () {
    expect(find([eventWith({ status: 'CANCELLED' })]).length).toBe(0);
  });

  it('ignores a meeting this account has declined', function () {
    const declined = eventWith({
      attendees: 'ATTENDEE;PARTSTAT=DECLINED:mailto:brian@example.com',
    });
    expect(find([declined]).length).toBe(0);
  });

  it('still reports a meeting this account has accepted', function () {
    const accepted = eventWith({
      attendees: 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:brian@example.com',
    });
    expect(find([accepted]).length).toBe(1);
  });

  it('still reports a meeting this account has not answered', function () {
    const pending = eventWith({
      attendees: 'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
    });
    expect(find([pending]).length).toBe(1);
  });

  it("ignores someone else's declined status", function () {
    const other = eventWith({
      attendees: 'ATTENDEE;PARTSTAT=DECLINED:mailto:someone@example.com',
    });
    expect(find([other]).length).toBe(1);
  });

  it('excludes the event being checked, by UID', function () {
    const self = eventWith({ uid: 'the-invite@test' });
    expect(find([self], { excludeIcsuid: 'the-invite@test' }).length).toBe(0);
  });

  it('ignores an all-day event, so a vacation day does not clash with every meeting', function () {
    expect(find([allDayEvent('Vacation', '20260302', '20260303')]).length).toBe(0);
  });

  describe('recurring series', function () {
    const weekly = () =>
      eventWith({
        summary: 'Weekly Sync',
        start: '20260223T140000Z', // the Monday before the window
        end: '20260223T150000Z',
        rrule: 'FREQ=WEEKLY;COUNT=10',
      });

    it('reports only the occurrence that falls in the window', function () {
      const conflicts = find([weekly()]);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].start).toBe(unix('2026-03-02T14:00:00Z'));
    });

    it('reports nothing on a week the series does not reach', function () {
      const conflicts = find([weekly()], {
        start: unix('2026-03-03T14:30:00Z'),
        end: unix('2026-03-03T15:30:00Z'),
      });
      expect(conflicts.length).toBe(0);
    });

    it('respects an excluded occurrence', function () {
      const withExdate = eventWith({
        summary: 'Weekly Sync',
        start: '20260223T140000Z',
        end: '20260223T150000Z',
        rrule: 'FREQ=WEEKLY;COUNT=10',
        extra: 'EXDATE:20260302T140000Z',
      });
      expect(find([withExdate]).length).toBe(0);
    });

    it('does not double-report when an exception row is stored alongside the master', function () {
      const master = eventWith({
        uid: 'series@test',
        summary: 'Weekly Sync',
        start: '20260223T140000Z',
        end: '20260223T150000Z',
        rrule: 'FREQ=WEEKLY;COUNT=10',
      });
      const exceptionRow = eventWith({
        uid: 'series@test',
        summary: 'Weekly Sync',
        start: '20260302T140000Z',
        end: '20260302T150000Z',
        recurrenceId: '20260302T140000Z',
      });
      exceptionRow.id = 'event-series-exception';
      expect(find([master, exceptionRow]).length).toBe(1);
    });
  });

  it('sorts results by start time', function () {
    const later = eventWith({
      summary: 'Later',
      start: '20260302T151500Z',
      end: '20260302T160000Z',
    });
    const earlier = eventWith({
      summary: 'Earlier',
      start: '20260302T140000Z',
      end: '20260302T150000Z',
    });
    expect(find([later, earlier]).map((c) => c.title)).toEqual(['Earlier', 'Later']);
  });

  it('survives an unparseable calendar entry', function () {
    const broken = new Event({
      id: 'event-broken',
      accountId: ACCOUNT_ID,
      calendarId: 'cal-1',
      icsuid: 'broken@test',
      recurrenceId: '',
      ics: 'this is not a calendar',
    } as any);
    expect(find([broken, eventWith({ summary: 'Standup' })]).map((c) => c.title)).toEqual([
      'Standup',
    ]);
  });

  it('returns nothing for an empty or inverted window', function () {
    const events = [eventWith()];
    expect(find(events, { start: WINDOW.end, end: WINDOW.start }).length).toBe(0);
    expect(find(events, { start: WINDOW.start, end: WINDOW.start }).length).toBe(0);
  });
});

describe('upcomingOccurrence', function () {
  const NOW = new Date('2026-10-04T12:00:00Z'); // a Sunday
  const ics = (lines: string[]) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:series@test',
      ...lines,
      'SUMMARY:Standup',
      'DTSTAMP:20260101T000000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  const weekly = ics([
    'DTSTART:20260731T140000Z', // a Friday; the next Friday from NOW is Oct 9
    'DTEND:20260731T143000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=FR',
  ]);

  it('is the event itself when it does not repeat, whether ahead or behind', function () {
    const ahead = upcomingOccurrence(
      ics(['DTSTART:20261105T140000Z', 'DTEND:20261105T150000Z']),
      NOW
    );
    expect(ahead.start.toISOString()).toBe('2026-11-05T14:00:00.000Z');
    expect(ahead.recurrenceId).toBe(null);
    const behind = upcomingOccurrence(
      ics(['DTSTART:20260105T140000Z', 'DTEND:20260105T150000Z']),
      NOW
    );
    expect(behind.start.toISOString()).toBe('2026-01-05T14:00:00.000Z');
  });

  it('is the next occurrence of a series that began months ago', function () {
    const next = upcomingOccurrence(weekly, NOW);
    expect(next.start.toISOString()).toBe('2026-10-09T14:00:00.000Z');
    expect(next.end.toISOString()).toBe('2026-10-09T14:30:00.000Z');
    expect(next.recurrenceId.toString()).toBe('2026-10-09T14:00:00Z');
    expect(next.isAllDay).toBe(false);
  });

  it('is the occurrence in progress when one is', function () {
    const during = new Date('2026-10-09T14:10:00Z');
    expect(upcomingOccurrence(weekly, during).start.toISOString()).toBe('2026-10-09T14:00:00.000Z');
  });

  it('skips an occurrence the series excludes', function () {
    const skipped = weekly.replace('RRULE:', 'EXDATE:20261009T140000Z\r\nRRULE:');
    expect(upcomingOccurrence(skipped, NOW).start.toISOString()).toBe('2026-10-16T14:00:00.000Z');
  });

  it('takes a moved occurrence at its new time, named by its original one', function () {
    const moved = weekly.replace(
      'END:VEVENT',
      [
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:series@test',
        'RECURRENCE-ID:20261009T140000Z',
        'DTSTART:20261008T090000Z',
        'DTEND:20261008T093000Z',
        'SUMMARY:Standup (moved)',
        'DTSTAMP:20260101T000000Z',
        'END:VEVENT',
      ].join('\r\n')
    );
    const next = upcomingOccurrence(moved, NOW);
    expect(next.start.toISOString()).toBe('2026-10-08T09:00:00.000Z');
    expect(next.recurrenceId.toString()).toBe('2026-10-09T14:00:00Z');
  });

  it('does not let an occurrence moved later jump the queue', function () {
    const movedLater = weekly.replace(
      'END:VEVENT',
      [
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:series@test',
        'RECURRENCE-ID:20261009T140000Z',
        'DTSTART:20261020T140000Z',
        'DTEND:20261020T143000Z',
        'SUMMARY:Standup (moved)',
        'DTSTAMP:20260101T000000Z',
        'END:VEVENT',
      ].join('\r\n')
    );
    expect(upcomingOccurrence(movedLater, NOW).start.toISOString()).toBe(
      '2026-10-16T14:00:00.000Z'
    );
  });

  it('is null once a series is over', function () {
    const ended = weekly.replace(
      'RRULE:FREQ=WEEKLY;BYDAY=FR',
      'RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=3'
    );
    expect(upcomingOccurrence(ended, NOW)).toBe(null);
  });

  it('keeps an all-day series on dates', function () {
    const allDay = ics([
      'DTSTART;VALUE=DATE:20260731',
      'DTEND;VALUE=DATE:20260801',
      'RRULE:FREQ=WEEKLY;BYDAY=FR',
    ]);
    const next = upcomingOccurrence(allDay, NOW);
    expect(next.isAllDay).toBe(true);
    expect(next.recurrenceId.toString()).toBe('2026-10-09');
  });
});
