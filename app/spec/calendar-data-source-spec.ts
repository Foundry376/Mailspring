// Import the function under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import { Event as MailspringEvent } from '../src/flux/models/event';
import { Calendar } from '../src/flux/models/calendar';
import {
  calendarAddress,
  ownCalendarAddresses,
  occurrencesForEvents,
  eventCoversDate,
  occurrenceStartUnix,
  occurrenceEndUnix,
  isEventSelected,
  focusedEventInfoForEvents,
  focusedOccurrenceForIcsuid,
  inAllDayRow,
  EventOccurrence,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { DatabaseStore } from 'mailspring-exports';
import { formatCalendarDate, parseCalendarDate } from '../src/calendar-date';

// All-day-ness comes from the ICS DATE type, never from duration.
function makeEvent(ics: string, overrides: Partial<MailspringEvent> = {}): MailspringEvent {
  return new MailspringEvent({
    id: 'event-1',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    icsuid: 'uid@test',
    ics,
    ...overrides,
  } as any);
}

function icsFor(dtstart: string, dtend: string, extra = ''): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:uid@test',
    dtstart,
    dtend,
    extra,
    'SUMMARY:Test Event',
    'DTSTAMP:20260101T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Expand across the whole of 2026 and return the occurrences found */
function expand(event: MailspringEvent) {
  return occurrencesForEvents([event], {
    startUnix: new Date(2026, 0, 1).getTime() / 1000,
    endUnix: new Date(2027, 0, 1).getTime() / 1000,
  });
}

describe('occurrencesForEvents isAllDay classification', function () {
  it('treats a DATE-valued event as all-day on an ordinary day', function () {
    const [occ] = expand(
      makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260623'))
    );
    expect(occ.isAllDay).toBe(true);
  });

  it('does not treat a long timed event as all-day', function () {
    const [occ] = expand(makeEvent(icsFor('DTSTART:20260622T090000Z', 'DTEND:20260623T170000Z')));
    expect(occurrenceEndUnix(occ) - occurrenceStartUnix(occ)).toBeGreaterThan(86400);
    expect(occ.isAllDay).toBe(false);
  });

  it('does not treat a short timed event as all-day', function () {
    const [occ] = expand(makeEvent(icsFor('DTSTART:20260622T140000Z', 'DTEND:20260622T150000Z')));
    expect(occ.isAllDay).toBe(false);
  });

  it('classifies every occurrence of a recurring all-day series', function () {
    const occurrences = expand(
      makeEvent(
        icsFor(
          'DTSTART;VALUE=DATE:20260301',
          'DTEND;VALUE=DATE:20260302',
          'RRULE:FREQ=WEEKLY;COUNT=4'
        )
      )
    );
    expect(occurrences.length).toBe(4);
    occurrences.forEach((occ) => expect(occ.isAllDay).toBe(true));
  });
});

describe('occurrencesForEvents covered dates', function () {
  // Asserted as ISO strings so a failure reads 2026-06-22, not an epoch-day integer
  const covered = (occ: { startDate: any; endDate: any }) => [
    formatCalendarDate(occ.startDate),
    formatCalendarDate(occ.endDate),
  ];

  describe('for all-day events', function () {
    it('gives a one-day event the same start and end date', function () {
      const [occ] = expand(
        makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260623'))
      );
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-22']);
    });

    it('converts the exclusive DTEND to the last day covered', function () {
      const [occ] = expand(
        makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260625'))
      );
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-24']);
    });

    it('defaults a missing DTEND to a single day', function () {
      const ics = icsFor('DTSTART;VALUE=DATE:20260622', '');
      const [occ] = expand(makeEvent(ics));
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-22']);
    });

    it('reads a spring-forward day as one day', function () {
      const [occ] = expand(
        makeEvent(icsFor('DTSTART;VALUE=DATE:20260308', 'DTEND;VALUE=DATE:20260309'))
      );
      expect(covered(occ)).toEqual(['2026-03-08', '2026-03-08']);
    });

    // A DTEND equal to DTSTART is malformed but common from real servers; without the floor
    // the exclusive-to-inclusive conversion would put endDate a day before startDate.
    it('floors a zero-length span at the start day', function () {
      const [occ] = expand(
        makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260622'))
      );
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-22']);
    });

    it('covers only the start day when a timed event ends at midnight', function () {
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(
          dt.getDate()
        ).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}0000`;
      const [occ] = expand(
        makeEvent(
          icsFor(
            `DTSTART:${fmt(new Date(2026, 5, 22, 22))}`,
            `DTEND:${fmt(new Date(2026, 5, 23, 0))}`
          )
        )
      );
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-22']);
    });

    it('carries the dates onto every occurrence of a series', function () {
      const occs = expand(
        makeEvent(
          icsFor(
            'DTSTART;VALUE=DATE:20260601',
            'DTEND;VALUE=DATE:20260602',
            'RRULE:FREQ=MONTHLY;COUNT=3'
          )
        )
      );
      expect(occs.map(covered)).toEqual([
        ['2026-06-01', '2026-06-01'],
        ['2026-07-01', '2026-07-01'],
        ['2026-08-01', '2026-08-01'],
      ]);
    });
  });

  describe('for timed events', function () {
    it('spans two dates when it crosses local midnight', function () {
      // 23:30 to 00:30 the next day, in the host zone
      const start = new Date(2026, 5, 22, 23, 30);
      const end = new Date(2026, 5, 23, 0, 30);
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(
          dt.getDate()
        ).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(
          dt.getMinutes()
        ).padStart(2, '0')}00`;
      const [occ] = expand(makeEvent(icsFor(`DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`)));
      expect(covered(occ)).toEqual(['2026-06-22', '2026-06-23']);
    });
  });
});

describe('occurrencesForEvents when expansion fails', function () {
  // The only path that derives dates from the denormalized columns rather than the ICS. The
  // sync engine writes those an hour late for any date inside DST (its mktime call asserts
  // standard time), so this is where subtracting a day rather than a second is load-bearing.
  it('takes the last covered day from the columns despite an hour of slop', function () {
    const startSlop = new Date(2026, 5, 22, 1, 0).getTime() / 1000; // 01:00, as the engine writes
    const endSlop = new Date(2026, 5, 23, 1, 0).getTime() / 1000; // exclusive, also 01:00
    const [occ] = expand(
      makeEvent('this is not valid ics', {
        recurrenceStart: startSlop,
        recurrenceEnd: endSlop,
      } as any)
    );
    expect(occ).toBeDefined();
    expect(occ.title).toBe('(Error expanding event)');
    expect(formatCalendarDate(occ.startDate)).toBe('2026-06-22');
    expect(formatCalendarDate(occ.endDate)).toBe('2026-06-22');
  });

  it('still surfaces a standalone exception when the master fails to expand with non-finite columns', function () {
    // The non-finite guard must skip only the phantom fallback push, not the whole UID
    // iteration: a master that throws AND lacks usable columns must not drop this UID's
    // separate exception records. Fails if the guard `continue`s the iteration instead.
    const master = makeEvent('this is not valid ics', {
      id: 'master-1',
      recurrenceStart: NaN,
      recurrenceEnd: NaN,
    } as any);
    const exception = makeEvent(
      icsFor(
        'DTSTART;VALUE=DATE:20260622',
        'DTEND;VALUE=DATE:20260623',
        'RECURRENCE-ID;VALUE=DATE:20260622'
      ),
      {
        id: 'exc-1',
        recurrenceId: '20260622',
        recurrenceStart: new Date(2026, 5, 22).getTime() / 1000,
      } as any
    );
    const occs = occurrencesForEvents([master, exception], {
      startUnix: new Date(2026, 0, 1).getTime() / 1000,
      endUnix: new Date(2027, 0, 1).getTime() / 1000,
    });
    expect(occs.some((o) => o.id === 'exc-1-e0')).toBe(true);
  });
});

describe('occurrencesForEvents with one meeting on several calendars', function () {
  const unix = (iso: string) => new Date(iso).getTime() / 1000;
  const june = { startUnix: unix('2026-06-01T00:00:00Z'), endUnix: unix('2026-07-01T00:00:00Z') };
  const weekly = icsFor('DTSTART:20260601T140000Z', 'DTEND:20260601T150000Z', 'RRULE:FREQ=WEEKLY');
  const movedICS = icsFor(
    'DTSTART:20260622T130000Z',
    'DTEND:20260622T140000Z',
    'RECURRENCE-ID:20260622T140000Z'
  );

  it("draws each calendar's copy of a one-off meeting", function () {
    const ics = icsFor('DTSTART:20260610T140000Z', 'DTEND:20260610T150000Z');
    const organizers = makeEvent(ics, { id: 'google-row' });
    const guests = makeEvent(ics, {
      id: 'outlook-row',
      accountId: 'account-2',
      calendarId: 'calendar-2',
    });
    const occs = occurrencesForEvents([organizers, guests], june);
    expect(occs.map((o) => [o.id, o.accountId, o.calendarId])).toEqual([
      [`google-row-e${unix('2026-06-10T14:00:00Z')}`, 'account-1', 'calendar-1'],
      [`outlook-row-e${unix('2026-06-10T14:00:00Z')}`, 'account-2', 'calendar-2'],
    ]);
  });

  describe('when some copies are on read-only calendars', function () {
    const holiday = icsFor('DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261112');
    const november = {
      startUnix: unix('2026-11-01T00:00:00Z'),
      endUnix: unix('2026-12-01T00:00:00Z'),
    };
    const copyOn = (ics: string, calendarId: string) =>
      makeEvent(ics, { id: `${calendarId}-row`, calendarId });

    it('draws a holiday subscribed from several accounts once', function () {
      const occs = occurrencesForEvents(
        [copyOn(holiday, 'holidays-1'), copyOn(holiday, 'holidays-2')],
        { ...november, readOnlyCalendarIds: new Set(['holidays-1', 'holidays-2']) }
      );
      expect(occs.map((o) => o.calendarId)).toEqual(['holidays-1']);
    });

    it('draws the same copy of a holiday whatever order its rows come in', function () {
      const readOnlyCalendarIds = new Set(['holidays-1', 'holidays-2']);
      const drawn = (calendarIds: string[]) =>
        occurrencesForEvents(
          calendarIds.map((c) => copyOn(holiday, c)),
          { ...november, readOnlyCalendarIds }
        ).map((o) => o.calendarId);
      expect(drawn(['holidays-2', 'holidays-1'])).toEqual(['holidays-1']);
      expect(drawn(['holidays-1', 'holidays-2'])).toEqual(['holidays-1']);
    });

    it('draws a meeting on our calendar rather than its read-only copy', function () {
      const ics = icsFor('DTSTART:20261110T140000Z', 'DTEND:20261110T150000Z');
      const occs = occurrencesForEvents(
        [copyOn(ics, 'colleague'), copyOn(ics, 'mine'), copyOn(ics, 'guest')],
        { ...november, readOnlyCalendarIds: new Set(['colleague']) }
      );
      expect(occs.map((o) => o.calendarId)).toEqual(['mine', 'guest']);
    });

    it('still draws a read-only copy that is the only one', function () {
      const occs = occurrencesForEvents([copyOn(holiday, 'holidays-1')], {
        ...november,
        readOnlyCalendarIds: new Set(['holidays-1']),
      });
      expect(occs.length).toBe(1);
    });
  });

  // The engine stores the whole resource on every row, so the moved occurrence sits inline too.
  const seriesWithMove = [
    ...weekly.split('\n').slice(0, -1),
    ...movedICS.split('\n').slice(3),
  ].join('\n');
  const MOVED = unix('2026-06-22T13:00:00Z');
  const startsOn = (occs: EventOccurrence[], calendarId: string) =>
    occs
      .filter((o) => o.calendarId === calendarId)
      .map(occurrenceStartUnix)
      .sort();

  it("draws each calendar's copy of a series, its moved occurrence once", function () {
    const rows = ['calendar-1', 'calendar-2'].flatMap((calendarId) => [
      makeEvent(seriesWithMove, {
        id: `${calendarId}-master`,
        calendarId,
        recurrenceStart: unix('2026-06-01T14:00:00Z'),
      }),
      makeEvent(seriesWithMove, {
        id: `${calendarId}-moved`,
        calendarId,
        recurrenceId: '20260622T140000Z',
        recurrenceStart: MOVED,
      }),
    ]);
    const occs = occurrencesForEvents(rows, june);
    const expected = [
      unix('2026-06-01T14:00:00Z'),
      unix('2026-06-08T14:00:00Z'),
      unix('2026-06-15T14:00:00Z'),
      MOVED,
      unix('2026-06-29T14:00:00Z'),
    ];
    expect(startsOn(occs, 'calendar-1')).toEqual(expected);
    expect(startsOn(occs, 'calendar-2')).toEqual(expected);
  });

  it("keeps a calendar's lone exception when another calendar's series draws that slot", function () {
    // Calendar 2 was invited to the one occurrence, so it holds that exception and no master.
    const series = makeEvent(seriesWithMove, {
      id: 'series',
      recurrenceStart: unix('2026-06-01T14:00:00Z'),
    });
    const lone = makeEvent(movedICS, {
      id: 'lone',
      calendarId: 'calendar-2',
      recurrenceId: '20260622T140000Z',
      recurrenceStart: MOVED,
    });
    const occs = occurrencesForEvents([series, lone], june);
    expect(occs.filter((o) => occurrenceStartUnix(o) === MOVED).map((o) => o.id)).toEqual([
      `series-e${MOVED}`,
      'lone-e0',
    ]);
  });
});

describe('occurrencesForEvents when an exception row and its master hold different copies', function () {
  // Google's shapes: a weekly series in the organizer's zone, overrides written in another, and
  // each VEVENT stamped with LAST-MODIFIED and an equal DTSTAMP.
  const unix = (iso: string) => new Date(iso).getTime() / 1000;
  const september = {
    startUnix: unix('2026-09-01T00:00:00Z'),
    endUnix: unix('2026-10-01T00:00:00Z'),
  };
  const calendar = (...vevents: string[][]) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN']
      .concat(...vevents, ['END:VCALENDAR'])
      .join('\r\n');
  const stamped = (stamp: string) => [`LAST-MODIFIED:${stamp}`, `DTSTAMP:${stamp}`];
  const vevent = (uid: string, lines: string[]) => [
    'BEGIN:VEVENT',
    ...lines,
    `UID:${uid}`,
    'SUMMARY:Weekly sync',
    'END:VEVENT',
  ];
  const UID = 'series_R20210921T143000@google.com';
  const weekly = (stamp: string, ...extra: string[]) =>
    vevent(UID, [
      'DTSTART;TZID=Europe/Vienna:20210921T163000',
      'DTEND;TZID=Europe/Vienna:20210921T173000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU',
      ...stamped(stamp),
      ...extra,
    ]);
  const override = (stamp: string, start: string, slot = '20260915T163000') =>
    vevent(UID, [
      `DTSTART;TZID=America/Indiana/Indianapolis:${start}`,
      'DURATION:PT1H',
      `RECURRENCE-ID;TZID=Europe/Vienna:${slot}`,
      ...stamped(stamp),
    ]);
  const rows = (masterIcs: string, exceptionIcs: string) => [
    makeEvent(masterIcs, {
      id: 'master',
      icsuid: UID,
      recurrenceStart: unix('2021-09-21T14:30:00Z'),
    }),
    makeEvent(exceptionIcs, {
      id: 'exception',
      icsuid: UID,
      recurrenceId: '20260915T163000',
      recurrenceStart: unix('2026-09-15T14:30:00Z'),
    }),
  ];
  const starts = (occs: EventOccurrence[]) => occs.map(occurrenceStartUnix).sort();
  const tuesdays = (...days: string[]) => days.map((d) => unix(`2026-09-${d}T14:30:00Z`));
  const EXDATE = 'EXDATE;TZID=Europe/Vienna:20260915T163000';

  beforeEach(function () {
    spyOn(console, 'error');
  });

  describe('when the master copy is later', function () {
    it('draws nothing for an occurrence it has since cancelled', function () {
      const occs = occurrencesForEvents(
        rows(
          calendar(weekly('20261027T151437Z', EXDATE)),
          calendar(weekly('20260908T145304Z'), override('20260908T145304Z', '20260915T103000'))
        ),
        september
      );
      expect(starts(occs)).toEqual(tuesdays('01', '08', '22', '29'));
      expect(console.error).not.toHaveBeenCalled();
    });

    it('draws an occurrence moved again only where it puts it, when only the override is newer', function () {
      // The master copy's series VEVENT predates the row's copy; its override doesn't.
      const occs = occurrencesForEvents(
        rows(
          calendar(weekly('20260901T080000Z'), override('20261001T080000Z', '20260916T090000')),
          calendar(weekly('20260920T080000Z'), override('20260920T080000Z', '20260915T090000'))
        ),
        september
      );
      expect(starts(occs)).toEqual(
        [...tuesdays('01', '08', '22', '29'), unix('2026-09-16T13:00:00Z')].sort()
      );
    });

    it('draws an occurrence split into a new series once, from the new series', function () {
      // "This and following" ends the old series with UNTIL and starts a new UID at the split.
      const NEW_UID = 'series_R20260915T143000@google.com';
      const [master, exception] = rows(
        calendar(
          weekly('20261013T223323Z').map((l) =>
            l.replace('BYDAY=TU', 'UNTIL=20260914T215959Z;BYDAY=TU')
          )
        ),
        calendar(weekly('20260923T084912Z'), override('20260923T084912Z', '20260915T090000'))
      );
      const split = makeEvent(
        calendar(
          vevent(NEW_UID, [
            'DTSTART;TZID=America/Indiana/Indianapolis:20260915T090000',
            'DTEND;TZID=America/Indiana/Indianapolis:20260915T100000',
            'RRULE:FREQ=WEEKLY;BYDAY=TU',
            ...stamped('20261013T223323Z'),
          ])
        ),
        { id: 'split', icsuid: NEW_UID, recurrenceStart: unix('2026-09-15T13:00:00Z') }
      );
      const occs = occurrencesForEvents([master, exception, split], september);
      expect(
        occs.filter((o) => occurrenceStartUnix(o) === unix('2026-09-15T13:00:00Z')).map((o) => o.id)
      ).toEqual([`split-e${unix('2026-09-15T13:00:00Z')}`]);
    });
  });

  it("draws an occurrence once, from the row's copy, when that copy is later", function () {
    const occs = occurrencesForEvents(
      rows(
        calendar(weekly('20260901T080000Z'), override('20260901T080000Z', '20260916T090000')),
        calendar(weekly('20260920T080000Z'), override('20260920T080000Z', '20260917T090000'))
      ),
      september
    );
    expect(starts(occs)).toEqual(
      [...tuesdays('01', '08', '22', '29'), unix('2026-09-17T13:00:00Z')].sort()
    );
    expect(occs.find((o) => occurrenceStartUnix(o) === unix('2026-09-17T13:00:00Z')).id).toBe(
      'exception-e0'
    );
  });

  it("draws the row's own copy when both copies carry the same stamp", function () {
    // Google can drop an occurrence without changing any LAST-MODIFIED, so neither copy is later.
    const occs = occurrencesForEvents(
      rows(
        calendar(weekly('20261013T223323Z', EXDATE)),
        calendar(weekly('20261013T223323Z'), override('20261013T223323Z', '20260915T103000'))
      ),
      september
    );
    expect(starts(occs)).toEqual(tuesdays('01', '08', '15', '22', '29'));
  });

  it("draws the row's own copy when either copy lacks a DTSTAMP", function () {
    const unstamped = (ics: string) => ics.replace(/\r\nDTSTAMP:[^\r]*/g, '');
    const master = calendar(weekly('20261027T151437Z', EXDATE));
    const exception = calendar(
      weekly('20260908T145304Z'),
      override('20260908T145304Z', '20260915T103000')
    );
    for (const [m, e] of [
      [unstamped(master), exception],
      [master, unstamped(exception)],
    ]) {
      expect(starts(occurrencesForEvents(rows(m, e), september))).toEqual(
        tuesdays('01', '08', '15', '22', '29')
      );
    }
  });

  it('draws an occurrence moved into the window from a later week, from its own row', function () {
    // The master's expansion stops at the first week past the window, before reaching it.
    const [master] = rows(
      calendar(
        weekly('20261001T080000Z'),
        override('20261001T080000Z', '20260930T090000', '20261013T163000')
      ),
      ''
    );
    const moved = makeEvent(
      calendar(
        weekly('20260920T080000Z'),
        override('20260920T080000Z', '20260928T090000', '20261013T163000')
      ),
      {
        id: 'moved',
        icsuid: UID,
        recurrenceId: '20261013T163000',
        recurrenceStart: unix('2026-09-28T13:00:00Z'),
      }
    );
    const occs = occurrencesForEvents([master, moved], september);
    expect(occs.filter((o) => o.id === 'moved-e0').map(occurrenceStartUnix)).toEqual([
      unix('2026-09-30T13:00:00Z'),
    ]);
  });

  it("draws a row whose copy doesn't name its RECURRENCE-ID from the copy's first VEVENT", function () {
    const [master, exception] = rows(
      calendar(weekly('20260901T080000Z')),
      calendar(override('20260920T080000Z', '20260916T090000', '20260916T163000'))
    );
    const occs = occurrencesForEvents([master, exception], september);
    expect(occs.filter((o) => o.id === 'exception-e0').map(occurrenceStartUnix)).toEqual([
      unix('2026-09-16T13:00:00Z'),
    ]);
  });

  it("logs a row whose copy won't parse and draws the rest of the series", function () {
    const occs = occurrencesForEvents(
      rows(calendar(weekly('20260901T080000Z')), 'this is not valid ics'),
      september
    );
    expect(starts(occs)).toEqual(tuesdays('01', '08', '15', '22', '29'));
    expect(console.error).toHaveBeenCalled();
  });
});

describe('eventCoversDate', function () {
  // What the month and agenda day cells filter on. Fed straight from occurrencesForEvents so
  // the fixtures are shapes the app actually produces.
  const only = (ics: string) => expand(makeEvent(ics))[0];
  const day = (iso: string) => parseCalendarDate(iso);

  it('covers each day of a multi-day all-day span and neither neighbour', function () {
    const occ = only(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260625'));
    expect(
      ['2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25'].map((iso) =>
        eventCoversDate(occ, day(iso))
      )
    ).toEqual([false, true, true, true, false]);
  });

  it('covers exactly one day for a one-day all-day event', function () {
    const occ = only(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260623'));
    expect(eventCoversDate(occ, day('2026-06-22'))).toBe(true);
    expect(eventCoversDate(occ, day('2026-06-23'))).toBe(false);
  });

  // The old timestamp filter compared `end > dayStart`, which the exclusive midnight made work
  // by luck. A timed event ending exactly at midnight must not light up the following cell.
  it('does not cover the next day for a timed event ending at midnight', function () {
    const fmt = (dt: Date) =>
      `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(
        dt.getDate()
      ).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}0000`;
    const occ = only(
      icsFor(`DTSTART:${fmt(new Date(2026, 5, 22, 22))}`, `DTEND:${fmt(new Date(2026, 5, 23, 0))}`)
    );
    expect(eventCoversDate(occ, day('2026-06-22'))).toBe(true);
    expect(eventCoversDate(occ, day('2026-06-23'))).toBe(false);
  });

  it('covers both days for a timed event that really crosses midnight', function () {
    const fmt = (dt: Date) =>
      `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(
        dt.getDate()
      ).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(
        dt.getMinutes()
      ).padStart(2, '0')}00`;
    const occ = only(
      icsFor(
        `DTSTART:${fmt(new Date(2026, 5, 22, 23, 30))}`,
        `DTEND:${fmt(new Date(2026, 5, 23, 0, 30))}`
      )
    );
    expect(eventCoversDate(occ, day('2026-06-22'))).toBe(true);
    expect(eventCoversDate(occ, day('2026-06-23'))).toBe(true);
  });

  it('covers the middle days of a multi-day span, not just the ends', function () {
    const occ = only(icsFor('DTSTART;VALUE=DATE:20260307', 'DTEND;VALUE=DATE:20260310'));
    expect(
      ['2026-03-07', '2026-03-08', '2026-03-09'].map((iso) => eventCoversDate(occ, day(iso)))
    ).toEqual([true, true, true]);
  });
});

describe('isEventSelected', function () {
  const occ = (id: string) => ({ id }) as EventOccurrence;

  it('matches by id even when the object identity differs', function () {
    // Selection is captured at click time; a data refresh gives the occurrence a fresh object,
    // so an identity check would drop the highlight. This is the week-view bug this guards.
    const selected = [occ('evt-1'), occ('evt-2')];
    expect(isEventSelected(selected, occ('evt-1'))).toBe(true);
  });

  it('does not match a different id', function () {
    expect(isEventSelected([occ('evt-1')], occ('evt-9'))).toBe(false);
  });

  it('is false for an empty selection', function () {
    expect(isEventSelected([], occ('evt-1'))).toBe(false);
  });
});

describe('occurrence id stability across query ranges', function () {
  it('gives a recurring occurrence the same id in a wide and a narrow range', function () {
    // idx-based ids differed per range (the Jun-20 occurrence is the 6th from Jun-15 in June but
    // the 3rd in the Jun 18-25 week), which broke selection/React keys when switching views.
    const event = makeEvent(
      icsFor('DTSTART:20260615T090000Z', 'DTEND:20260615T100000Z', 'RRULE:FREQ=DAILY')
    );
    const wide = occurrencesForEvents([event], {
      startUnix: new Date(2026, 5, 1).getTime() / 1000,
      endUnix: new Date(2026, 6, 1).getTime() / 1000,
    });
    const narrow = occurrencesForEvents([event], {
      startUnix: new Date(2026, 5, 18).getTime() / 1000,
      endUnix: new Date(2026, 5, 25).getTime() / 1000,
    });
    const onJun20 = (occs: any[]) =>
      occs.find((o) => formatCalendarDate(o.startDate) === '2026-06-20');
    const w = onJun20(wide);
    const n = onJun20(narrow);
    expect(w).toBeDefined();
    expect(n).toBeDefined();
    expect(w.id).toBe(n.id);
  });
});

describe('occurrencesForEvents on a long-running series', function () {
  // expandBetween steps forward from DTSTART with no way to seek, so the iteration cap bounds
  // how far back a series may begin rather than how much a window costs. At the fixed 100 a
  // weekly meeting that started in 2022 ran out around early 2024 and rendered nothing at all -
  // no error, no gap, just absent from the calendar.
  const weeklySince2022 = () =>
    makeEvent(
      icsFor('DTSTART:20220308T130000Z', 'DTEND:20220308T140000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TU'),
      { recurrenceStart: Date.UTC(2022, 2, 8, 13, 0, 0) / 1000 } as any
    );

  it('still reaches a week four years after the series began', function () {
    const occs = occurrencesForEvents([weeklySince2022()], {
      startUnix: Date.UTC(2026, 7, 30) / 1000,
      endUnix: Date.UTC(2026, 8, 6) / 1000,
    });
    expect(occs.length).toBe(1);
    expect(new Date(occurrenceStartUnix(occs[0]) * 1000).getUTCDate()).toBe(1);
  });

  it('expands a series that began this year the same way', function () {
    const recent = makeEvent(
      icsFor('DTSTART:20260804T130000Z', 'DTEND:20260804T140000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TU'),
      { recurrenceStart: Date.UTC(2026, 7, 4, 13, 0, 0) / 1000 } as any
    );
    const occs = occurrencesForEvents([recent], {
      startUnix: Date.UTC(2026, 7, 30) / 1000,
      endUnix: Date.UTC(2026, 8, 6) / 1000,
    });
    expect(occs.length).toBe(1);
  });
});

// The runner pins TZ to America/Chicago, where clocks go forward on 8 March 2026.
describe('inAllDayRow', function () {
  const at = (iso: string) => new Date(iso).getTime() / 1000;
  const timed = (start: string, end: string) =>
    ({ isAllDay: false, start: at(start), end: at(end) }) as EventOccurrence;

  it('takes all-day events, and timed ones of a day or more', function () {
    expect(inAllDayRow({ isAllDay: true } as EventOccurrence)).toBe(true);
    expect(inAllDayRow(timed('2026-03-02T15:00:00Z', '2026-03-03T15:00:00Z'))).toBe(true);
    expect(inAllDayRow(timed('2026-03-02T15:00:00Z', '2026-03-04T20:00:00Z'))).toBe(true);
  });

  it('leaves shorter timed ones in the grid, including one that crosses midnight', function () {
    expect(inAllDayRow(timed('2026-03-02T15:00:00Z', '2026-03-03T14:59:00Z'))).toBe(false);
    // 10 PM to 1 AM, local time.
    expect(inAllDayRow(timed('2026-03-03T04:00:00Z', '2026-03-03T07:00:00Z'))).toBe(false);
  });

  it('counts a day to the same clock time, so 9 AM to 9 AM over the clock change is one', function () {
    // 9 AM CST on Saturday to 9 AM CDT on Sunday: 23 hours.
    expect(inAllDayRow(timed('2026-03-07T15:00:00Z', '2026-03-08T14:00:00Z'))).toBe(true);
    expect(inAllDayRow(timed('2026-03-07T15:00:00Z', '2026-03-08T13:59:00Z'))).toBe(false);
  });
});

describe('focusedOccurrenceForIcsuid', function () {
  const unix = (iso: string) => new Date(iso).getTime() / 1000;
  const NOW = unix('2026-06-15T12:00:00Z');
  const REF = { icsuid: 'uid@test', accountId: 'account-1' };

  const stored = (event: MailspringEvent) =>
    spyOn(DatabaseStore, 'findAll').andReturn({ where: () => Promise.resolve([event]) } as any);

  it('returns the occurrence the focus lands on, for a timed event', async function () {
    stored(
      makeEvent(icsFor('DTSTART:20260622T140000Z', 'DTEND:20260622T150000Z'), {
        recurrenceStart: unix('2026-06-22T14:00:00Z'),
      })
    );
    const occurrence = await focusedOccurrenceForIcsuid(REF, [], NOW);
    expect(occurrence.id).toBe(`event-1-e${unix('2026-06-22T14:00:00Z')}`);
    expect(occurrenceStartUnix(occurrence)).toBe(unix('2026-06-22T14:00:00Z'));
  });

  it('returns the occurrence the focus lands on, for an all-day event', async function () {
    stored(makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260623')));
    const occurrence = await focusedOccurrenceForIcsuid(REF, [], NOW);
    expect(occurrence.isAllDay).toBe(true);
    expect(formatCalendarDate(occurrence.startDate)).toBe('2026-06-22');
  });
});

describe('focusedEventInfoForEvents', function () {
  const unix = (iso: string) => new Date(iso).getTime() / 1000;
  const NOW = unix('2026-06-15T12:00:00Z');
  const withStart = (ics: string, iso: string) => makeEvent(ics, { recurrenceStart: unix(iso) });

  it('focuses a one-off event that is still to come', function () {
    const event = withStart(
      icsFor('DTSTART:20260622T140000Z', 'DTEND:20260622T150000Z'),
      '2026-06-22T14:00:00Z'
    );
    expect(focusedEventInfoForEvents([event], NOW)).toEqual({
      id: `event-1-e${unix('2026-06-22T14:00:00Z')}`,
      start: unix('2026-06-22T14:00:00Z'),
    });
  });

  it('focuses the next occurrence of a series, not its first', function () {
    const series = withStart(
      icsFor('DTSTART:20260105T140000Z', 'DTEND:20260105T150000Z', 'RRULE:FREQ=WEEKLY'),
      '2026-01-05T14:00:00Z'
    );
    // Mondays at 14:00Z; NOW is Monday 15 June at noon, so that afternoon's is next.
    expect(focusedEventInfoForEvents([series], NOW).start).toBe(unix('2026-06-15T14:00:00Z'));
  });

  it('takes the nearest occurrence when it was moved earlier', function () {
    // Today's occurrence, moved an hour earlier. The engine stores the whole resource on each row.
    const ics = [
      ...icsFor('DTSTART:20260105T140000Z', 'DTEND:20260105T150000Z', 'RRULE:FREQ=WEEKLY')
        .split('\n')
        .slice(0, -1),
      ...icsFor(
        'DTSTART:20260615T130000Z',
        'DTEND:20260615T140000Z',
        'RECURRENCE-ID:20260615T140000Z'
      )
        .split('\n')
        .slice(3),
    ].join('\n');
    const series = withStart(ics, '2026-01-05T14:00:00Z');
    const moved = makeEvent(ics, {
      id: 'event-2',
      recurrenceId: '20260615T140000Z',
      recurrenceStart: unix('2026-06-15T13:00:00Z'),
    });
    expect(focusedEventInfoForEvents([series, moved], NOW)).toEqual({
      id: `event-1-e${unix('2026-06-15T13:00:00Z')}`,
      start: unix('2026-06-15T13:00:00Z'),
    });
  });

  describe('when the request names one occurrence of a series', function () {
    const WEEKLY = icsFor(
      'DTSTART:20260105T140000Z',
      'DTEND:20260105T150000Z',
      'RRULE:FREQ=WEEKLY'
    );
    const JUNE_22 = unix('2026-06-22T14:00:00Z');

    it('focuses that occurrence rather than the next one', function () {
      const series = withStart(WEEKLY, '2026-01-05T14:00:00Z');
      expect(focusedEventInfoForEvents([series], NOW, JUNE_22)).toEqual({
        id: `event-1-e${JUNE_22}`,
        start: JUNE_22,
      });
    });

    it('follows the occurrence to where it was moved', function () {
      const moved = [
        'BEGIN:VEVENT',
        'UID:uid@test',
        'RECURRENCE-ID:20260622T140000Z',
        'DTSTART:20260624T160000Z',
        'DTEND:20260624T170000Z',
        'SUMMARY:Test Event',
        'DTSTAMP:20260101T000000Z',
        'END:VEVENT',
      ].join('\n');
      const series = withStart(
        WEEKLY.replace('END:VCALENDAR', `${moved}\nEND:VCALENDAR`),
        '2026-01-05T14:00:00Z'
      );
      expect(focusedEventInfoForEvents([series], NOW, JUNE_22).start).toBe(
        unix('2026-06-24T16:00:00Z')
      );
    });

    it('falls back to the next occurrence when that one was cancelled', function () {
      // Daily, so the day after the cancelled one is within reach and must not be taken.
      const series = withStart(
        WEEKLY.replace('RRULE:FREQ=WEEKLY', 'RRULE:FREQ=DAILY\nEXDATE:20260622T140000Z'),
        '2026-01-05T14:00:00Z'
      );
      expect(focusedEventInfoForEvents([series], NOW, JUNE_22).start).toBe(
        unix('2026-06-15T14:00:00Z')
      );
    });

    it('still focuses an event whose calendar object will not parse', function () {
      const broken = makeEvent('this is not valid ics', {
        recurrenceStart: JUNE_22,
        recurrenceEnd: JUNE_22 + 3600,
      });
      expect(focusedEventInfoForEvents([broken], NOW, JUNE_22)).toEqual({
        id: 'event-1-e0',
        start: JUNE_22,
      });
    });

    it('has nothing to focus when the event is not on a calendar', function () {
      expect(focusedEventInfoForEvents([], NOW, JUNE_22)).toBe(null);
    });
  });

  it('falls back to the first occurrence once nothing is upcoming', function () {
    const ended = withStart(
      icsFor('DTSTART:20260105T140000Z', 'DTEND:20260105T150000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'),
      '2026-01-05T14:00:00Z'
    );
    expect(focusedEventInfoForEvents([ended], NOW).start).toBe(unix('2026-01-05T14:00:00Z'));
  });

  it('has nothing to focus when the event is not on a calendar', function () {
    expect(focusedEventInfoForEvents([], NOW)).toBe(null);
  });
});

describe('occurrencesForEvents and who organizes the event', function () {
  const GROUP_ADDRESS = 'abc123@group.calendar.google.com';
  const GROUP = `ORGANIZER;CN=Team:mailto:${GROUP_ADDRESS}`;
  const range = {
    startUnix: new Date(2026, 0, 1).getTime() / 1000,
    endUnix: new Date(2027, 0, 1).getTime() / 1000,
  };
  const only = (ics: string, ownCalendarAddresses = new Map<string, string>()) =>
    occurrencesForEvents([makeEvent(ics)], { ...range, ownCalendarAddresses })[0];
  const own = (id: string, address: string) => new Map([[id, address]]);

  it('is ours when nobody organizes it', function () {
    expect(only(icsFor('DTSTART:20260310T140000Z', 'DTEND:20260310T150000Z')).isMine).toBe(true);
  });

  it("is not ours when somebody else's address organizes it", function () {
    const ics = icsFor(
      'DTSTART:20260310T140000Z',
      'DTEND:20260310T150000Z',
      'ORGANIZER:mailto:ada@example.com'
    );
    expect(only(ics, own('calendar-1', 'me@example.com')).isMine).toBe(false);
  });

  it('is ours when the calendar it sits on organizes it and the server says that calendar is ours', function () {
    const ics = icsFor('DTSTART:20260310T140000Z', 'DTEND:20260310T150000Z', GROUP);
    expect(only(ics, own('calendar-1', GROUP_ADDRESS)).isMine).toBe(true);
    expect(only(ics, own('calendar-1', GROUP_ADDRESS.toUpperCase())).isMine).toBe(true);
  });

  it('is not ours when another group calendar organizes an invitation on our own calendar', function () {
    const ics = icsFor('DTSTART:20260310T140000Z', 'DTEND:20260310T150000Z', GROUP);
    expect(only(ics, own('calendar-1', 'me@example.com')).isMine).toBe(false);
  });

  it('is not ours when the calendar organizing it is shared into the account', function () {
    const ics = icsFor('DTSTART:20260310T140000Z', 'DTEND:20260310T150000Z', GROUP);
    expect(only(ics, own('some-other-calendar', GROUP_ADDRESS)).isMine).toBe(false);
    expect(only(ics).isMine).toBe(false);
  });
});

describe('ownCalendarAddresses', function () {
  const cal = (id: string, ownership: string, path: string) =>
    new Calendar({ id, accountId: 'account-1', name: id, ownership, path } as any);

  it('maps only the calendars the server says are ours, not ones it says nothing about', function () {
    const addresses = ownCalendarAddresses([
      cal('mine', 'mine', '/caldav/v2/c_1a2b%40group.calendar.google.com/events/'),
      cal('theirs', 'other', '/caldav/v2/c_3c4d%40group.calendar.google.com/events/'),
      cal('unknown', '', '/caldav/v2/c_5e6f%40group.calendar.google.com/events/'),
    ]);
    expect([...addresses]).toEqual([['mine', 'c_1a2b@group.calendar.google.com']]);
  });

  it("reads the calendar's own address out of its collection path", function () {
    expect(calendarAddress(cal('a', 'mine', '/caldav/v2/me%40example.com/events/'))).toBe(
      'me@example.com'
    );
    expect(
      calendarAddress(
        cal('b', 'mine', '/dav/calendars/user/me%40example.com/c_1a2b%40group.calendar.google.com/')
      )
    ).toBe('c_1a2b@group.calendar.google.com');
    expect(calendarAddress(cal('c', 'mine', '/remote.php/dav/calendars/me/personal/'))).toBe('');
    expect(calendarAddress(cal('d', 'mine', '/caldav/v2/%E0%A4%A/events/'))).toBe('');
    expect(calendarAddress(cal('e', 'mine', undefined))).toBe('');
  });
});

describe('occurrencesForEvents and Show As', function () {
  it('reads TRANSP:TRANSPARENT as free and TRANSP:OPAQUE as busy', function () {
    const at = (transp: string) =>
      expand(makeEvent(icsFor('DTSTART:20260301T140000Z', 'DTEND:20260301T150000Z', transp)))[0];
    expect(at('TRANSP:TRANSPARENT').isFree).toBe(true);
    expect(at('TRANSP:OPAQUE').isFree).toBe(false);
  });

  it("reads each occurrence's own TRANSP, so a busy exception of a free series is busy", function () {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'UID:uid@test',
      'DTSTART;VALUE=DATE:20260301',
      'DTEND;VALUE=DATE:20260302',
      'RRULE:FREQ=DAILY;COUNT=3',
      'TRANSP:TRANSPARENT',
      'SUMMARY:On call',
      'DTSTAMP:20260101T000000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:uid@test',
      'RECURRENCE-ID;VALUE=DATE:20260302',
      'DTSTART;VALUE=DATE:20260302',
      'DTEND;VALUE=DATE:20260303',
      'TRANSP:OPAQUE',
      'SUMMARY:On call (handover)',
      'DTSTAMP:20260101T000000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const freeByDay = new Map(
      expand(makeEvent(ics)).map((o) => [formatCalendarDate(o.startDate), o.isFree])
    );
    expect(freeByDay.get('2026-03-01')).toBe(true);
    expect(freeByDay.get('2026-03-02')).toBe(false);
    expect(freeByDay.get('2026-03-03')).toBe(true);
  });
});
