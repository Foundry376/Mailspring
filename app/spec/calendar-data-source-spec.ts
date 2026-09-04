// Import the function under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import { Event as MailspringEvent } from '../src/flux/models/event';
import {
  occurrencesForEvents,
  eventCoversDate,
  occurrenceStartUnix,
  occurrenceEndUnix,
  isEventSelected,
  EventOccurrence,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
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
      { id: 'exc-1', recurrenceId: '20260622', recurrenceStart: new Date(2026, 5, 22).getTime() / 1000 } as any
    );
    const occs = occurrencesForEvents([master, exception], {
      startUnix: new Date(2026, 0, 1).getTime() / 1000,
      endUnix: new Date(2027, 0, 1).getTime() / 1000,
    });
    expect(occs.some((o) => o.id === 'exc-1-e0')).toBe(true);
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
  const occ = (id: string) => ({ id } as EventOccurrence);

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
  // ical-expander steps forward from DTSTART with no way to seek, so the iteration cap bounds
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
