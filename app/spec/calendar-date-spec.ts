import {
  CalendarDate,
  calendarDateOf,
  unixDayStart,
  unixDayEndExclusive,
  addCalendarDays,
  calendarDaysBetween,
  calendarDaySpan,
  parseICSDate,
  formatICSDate,
  formatCalendarDate,
  parseCalendarDate,
} from '../src/calendar-date';

/** Fixtures read as dates, not epoch-day integers — a failure says 2026-06-21, not 20627 */
const d = (iso: string): CalendarDate => parseCalendarDate(iso);

/** A local instant on the given date, at the given time of day */
const at = (iso: string, hour = 0, minute = 0): number => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day, hour, minute).getTime() / 1000;
};

describe('calendarDateOf', function () {
  // The property the whole design rests on: the date is read off the instant's components,
  // never computed from a boundary, so the time of day cannot change the answer. Each of
  // these times of day is one we've actually seen in production for an all-day event.
  it('gives the same date whatever the time of day', function () {
    const expected = d('2026-06-21');
    expect(calendarDateOf(at('2026-06-21', 0, 0))).toBe(expected); // local midnight
    expect(calendarDateOf(at('2026-06-21', 1, 0))).toBe(expected); // the engine's mktime slop
    expect(calendarDateOf(at('2026-06-21', 12, 30))).toBe(expected);
    expect(calendarDateOf(at('2026-06-21', 23, 0))).toBe(expected); // moment's gap resolution
    expect(calendarDateOf(at('2026-06-21', 23, 59))).toBe(expected);
  });

  it('does not bleed into the neighbouring days', function () {
    expect(calendarDateOf(at('2026-06-20', 23, 59))).toBe(d('2026-06-20'));
    expect(calendarDateOf(at('2026-06-22', 0, 0))).toBe(d('2026-06-22'));
  });

  it('reads dates across month, year and leap boundaries', function () {
    expect(calendarDateOf(at('2026-06-30', 13, 0))).toBe(d('2026-06-30'));
    expect(calendarDateOf(at('2026-12-31', 13, 0))).toBe(d('2026-12-31'));
    expect(calendarDateOf(at('2028-02-29', 13, 0))).toBe(d('2028-02-29'));
  });
});

// These pass an explicit zone, so they discriminate under CI's UTC — a host-zone read can't.
// Verified boundary values, not guesses: 2026-06-21T02:00Z is still the 20th in Chicago.
describe('calendarDateOf with an explicit zone', function () {
  const INSTANT = Date.UTC(2026, 5, 21, 2, 0) / 1000;

  it('reads the date in the zone it is given, not the host zone', function () {
    expect(calendarDateOf(INSTANT, 'UTC')).toBe(d('2026-06-21'));
    expect(calendarDateOf(INSTANT, 'America/Chicago')).toBe(d('2026-06-20'));
    expect(calendarDateOf(INSTANT, 'Asia/Tokyo')).toBe(d('2026-06-21'));
  });

  it('stays on one date for every hour of a 23-hour day', function () {
    // Mar 8 2026 is the US spring-forward day: 23 local hours, not 24
    for (let hour = 6; hour < 29; hour++) {
      const instant = Date.UTC(2026, 2, 8, hour) / 1000;
      expect(calendarDateOf(instant, 'America/Chicago')).toBe(d('2026-03-08'));
    }
    expect(calendarDateOf(Date.UTC(2026, 2, 8, 29) / 1000, 'America/Chicago')).toBe(
      d('2026-03-09')
    );
  });

  it('handles a zone whose local midnight does not exist', function () {
    // Santiago springs forward at 24:00 on the 5th, so the 6th begins at 01:00 = 04:00Z
    expect(calendarDateOf(Date.UTC(2026, 8, 6, 3) / 1000, 'America/Santiago')).toBe(
      d('2026-09-05')
    );
    expect(calendarDateOf(Date.UTC(2026, 8, 6, 4) / 1000, 'America/Santiago')).toBe(
      d('2026-09-06')
    );
  });

  it('handles an offset that is not a whole hour', function () {
    // Kathmandu is +05:45, so 18:20Z is 00:05 the next day
    expect(calendarDateOf(Date.UTC(2026, 5, 20, 18, 20) / 1000, 'Asia/Kathmandu')).toBe(
      d('2026-06-21')
    );
    expect(calendarDateOf(Date.UTC(2026, 5, 20, 18, 10) / 1000, 'Asia/Kathmandu')).toBe(
      d('2026-06-20')
    );
  });

  it('reuses one formatter per zone rather than building one per call', function () {
    // Guards the cache: 12x slower uncached, and this is called per occurrence on load
    const first = calendarDateOf(INSTANT, 'Europe/Berlin');
    for (let i = 0; i < 100; i++) {
      expect(calendarDateOf(INSTANT, 'Europe/Berlin')).toBe(first);
    }
  });
});

describe('unixDayStart', function () {
  it('lands on the date it was given, whatever that day starts at', function () {
    // Not asserted as a wall clock: where local midnight doesn't exist the day starts at
    // 01:00, and that instant is still the correct start of the date.
    ['2026-06-21', '2026-03-08', '2026-11-01', '2026-09-06'].forEach((iso) => {
      expect(calendarDateOf(unixDayStart(d(iso)))).toBe(d(iso));
    });
  });

  it('round-trips any instant through its date', function () {
    const start = unixDayStart(calendarDateOf(at('2026-06-21', 17, 45)));
    expect(calendarDateOf(start)).toBe(d('2026-06-21'));
  });
});

describe('unixDayEndExclusive', function () {
  // month-view.tsx and agenda-view.tsx filter on `start < dayEnd && end > dayStart`, which
  // needs the exclusive boundary: the covered day lights up and the next one must not.
  it('satisfies the overlap test for exactly the days covered', function () {
    const end = unixDayEndExclusive(d('2026-06-21')); // one-day event on the 21st
    expect(end > unixDayStart(d('2026-06-21'))).toBe(true);
    expect(end > unixDayStart(d('2026-06-22'))).toBe(false);
  });

  it('is the next day-start', function () {
    expect(unixDayEndExclusive(d('2026-06-21'))).toBe(unixDayStart(d('2026-06-22')));
  });

  it('holds across a transition day, where the span is not 86400 seconds', function () {
    ['2026-03-08', '2026-11-01', '2026-09-06'].forEach((iso) => {
      const next = addCalendarDays(d(iso), 1);
      expect(unixDayEndExclusive(d(iso))).toBe(unixDayStart(next));
      expect(unixDayEndExclusive(d(iso)) > unixDayStart(d(iso))).toBe(true);
    });
  });
});

describe('addCalendarDays', function () {
  it('shifts whole days in either direction', function () {
    expect(addCalendarDays(d('2026-06-21'), 1)).toBe(d('2026-06-22'));
    expect(addCalendarDays(d('2026-06-21'), -1)).toBe(d('2026-06-20'));
    expect(addCalendarDays(d('2026-06-21'), 0)).toBe(d('2026-06-21'));
  });

  it('crosses month, year and leap boundaries', function () {
    expect(addCalendarDays(d('2026-06-30'), 1)).toBe(d('2026-07-01'));
    expect(addCalendarDays(d('2026-12-31'), 1)).toBe(d('2027-01-01'));
    expect(addCalendarDays(d('2028-02-28'), 1)).toBe(d('2028-02-29'));
  });

  // The bug class this type exists to remove: a DST transition inside the range used to make
  // a "day" 23 or 25 hours and shift the answer. Dates have no hours to get wrong.
  it('is unaffected by DST transitions inside the range', function () {
    expect(addCalendarDays(d('2026-03-07'), 2)).toBe(d('2026-03-09'));
    expect(addCalendarDays(d('2026-10-31'), 3)).toBe(d('2026-11-03'));
    expect(addCalendarDays(d('2026-09-05'), 2)).toBe(d('2026-09-07'));
  });
});

describe('calendarDaysBetween', function () {
  it('counts whole days, signed', function () {
    expect(calendarDaysBetween(d('2026-06-21'), d('2026-06-24'))).toBe(3);
    expect(calendarDaysBetween(d('2026-06-24'), d('2026-06-21'))).toBe(-3);
    expect(calendarDaysBetween(d('2026-06-21'), d('2026-06-21'))).toBe(0);
  });

  it('counts across a DST transition without a fractional residue', function () {
    expect(calendarDaysBetween(d('2026-03-07'), d('2026-03-09'))).toBe(2);
    expect(calendarDaysBetween(d('2026-09-05'), d('2026-09-07'))).toBe(2);
  });

  it('round-trips with addCalendarDays', function () {
    [-30, -1, 0, 1, 45, 400].forEach((days) => {
      const from = d('2026-03-07');
      expect(calendarDaysBetween(from, addCalendarDays(from, days))).toBe(days);
    });
  });
});

describe('calendarDaySpan', function () {
  it('counts a single-day event as one day', function () {
    expect(calendarDaySpan(d('2026-06-21'), d('2026-06-21'))).toBe(1);
  });

  it('counts an inclusive multi-day range', function () {
    expect(calendarDaySpan(d('2026-06-21'), d('2026-06-23'))).toBe(3);
  });
});

describe('ICS date encoding', function () {
  it('parses the DATE form', function () {
    expect(parseICSDate('20260621')).toBe(d('2026-06-21'));
    expect(parseICSDate('20270101')).toBe(d('2027-01-01'));
  });

  it('formats the DATE form, zero-padded', function () {
    expect(formatICSDate(d('2026-06-21'))).toBe('20260621');
    expect(formatICSDate(d('2026-01-05'))).toBe('20260105');
  });

  it('round-trips through the wire format', function () {
    ['20260621', '20260101', '20261231', '20280229'].forEach((wire) => {
      expect(formatICSDate(parseICSDate(wire))).toBe(wire);
    });
  });

  // The value is a plain number at runtime, so a spec asserting the wrong day would otherwise
  // read as "expected 20627, got 20628". These keep failures legible.
  it('round-trips through the readable form', function () {
    ['2026-06-21', '2026-01-05', '2026-12-31', '2028-02-29'].forEach((iso) => {
      expect(formatCalendarDate(parseCalendarDate(iso))).toBe(iso);
    });
  });
});
