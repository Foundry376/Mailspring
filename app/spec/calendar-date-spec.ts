import {
  CalendarDate,
  calendarDateFromUnix,
  dayStartUnix,
  nextDayStartUnix,
  addCalendarDays,
  calendarDaysBetween,
  formatCalendarDate,
  parseCalendarDate,
  secondsIntoDay,
  secondsIntoDayUnix,
  firstOccurrenceUnix,
  sameOffsetOccurrenceUnix,
} from '../src/calendar-date';

/** Fixtures read as dates, not epoch-day integers — a failure says 2026-06-21, not 20627 */
const d = (iso: string): CalendarDate => parseCalendarDate(iso);

/** A local instant on the given date, at the given time of day */
const at = (iso: string, hour = 0, minute = 0, second = 0): number => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day, hour, minute, second).getTime() / 1000;
};

// Literals, not round-trips: every other assertion here compares the module against itself,
// so a consistently wrong epoch origin would survive all of them.
describe('the epoch-day encoding', function () {
  it('counts days from 1970-01-01', function () {
    expect(parseCalendarDate('1970-01-01')).toBe(0 as CalendarDate);
    expect(parseCalendarDate('1970-01-02')).toBe(1 as CalendarDate);
    expect(parseCalendarDate('1969-12-31')).toBe(-1 as CalendarDate);
    expect(parseCalendarDate('2026-06-21')).toBe(20625 as CalendarDate);
  });

  it('reads an instant onto the same integer', function () {
    expect(calendarDateFromUnix(Date.UTC(2026, 5, 21, 12) / 1000, 'UTC')).toBe(
      20625 as CalendarDate
    );
  });
});

describe('calendarDateFromUnix', function () {
  // The property the whole design rests on: the date is read off the instant's components,
  // never computed from a boundary, so the time of day cannot change the answer. Each of
  // these times of day is one we've actually seen in production for an all-day event.
  it('gives the same date whatever the time of day', function () {
    const expected = d('2026-06-21');
    expect(calendarDateFromUnix(at('2026-06-21', 0, 0))).toBe(expected); // local midnight
    expect(calendarDateFromUnix(at('2026-06-21', 1, 0))).toBe(expected); // the engine's mktime slop
    expect(calendarDateFromUnix(at('2026-06-21', 12, 30))).toBe(expected);
    expect(calendarDateFromUnix(at('2026-06-21', 23, 0))).toBe(expected); // moment's gap resolution
    expect(calendarDateFromUnix(at('2026-06-21', 23, 59))).toBe(expected);
  });

  it('does not bleed into the neighbouring days', function () {
    expect(calendarDateFromUnix(at('2026-06-20', 23, 59))).toBe(d('2026-06-20'));
    expect(calendarDateFromUnix(at('2026-06-22', 0, 0))).toBe(d('2026-06-22'));
  });
});

// These pass an explicit zone, so they discriminate under CI's UTC — a host-zone read can't.
// Verified boundary values, not guesses: 2026-06-21T02:00Z is still the 20th in Chicago.
describe('calendarDateFromUnix with an explicit zone', function () {
  const INSTANT = Date.UTC(2026, 5, 21, 2, 0) / 1000;

  it('reads the date in the zone it is given, not the host zone', function () {
    expect(calendarDateFromUnix(INSTANT, 'UTC')).toBe(d('2026-06-21'));
    expect(calendarDateFromUnix(INSTANT, 'America/Chicago')).toBe(d('2026-06-20'));
    expect(calendarDateFromUnix(INSTANT, 'Asia/Tokyo')).toBe(d('2026-06-21'));
  });

  it('stays on one date for every hour of a 23-hour day', function () {
    // Mar 8 2026 is the US spring-forward day: 23 local hours, not 24
    for (let hour = 6; hour < 29; hour++) {
      const instant = Date.UTC(2026, 2, 8, hour) / 1000;
      expect(calendarDateFromUnix(instant, 'America/Chicago')).toBe(d('2026-03-08'));
    }
    expect(calendarDateFromUnix(Date.UTC(2026, 2, 8, 29) / 1000, 'America/Chicago')).toBe(
      d('2026-03-09')
    );
  });

  it('handles a zone whose local midnight does not exist', function () {
    // Santiago springs forward at 24:00 on the 5th, so the 6th begins at 01:00 = 04:00Z
    expect(calendarDateFromUnix(Date.UTC(2026, 8, 6, 3) / 1000, 'America/Santiago')).toBe(
      d('2026-09-05')
    );
    expect(calendarDateFromUnix(Date.UTC(2026, 8, 6, 4) / 1000, 'America/Santiago')).toBe(
      d('2026-09-06')
    );
  });

  it('handles an offset that is not a whole hour', function () {
    // Kathmandu is +05:45, so 18:20Z is 00:05 the next day
    expect(calendarDateFromUnix(Date.UTC(2026, 5, 20, 18, 20) / 1000, 'Asia/Kathmandu')).toBe(
      d('2026-06-21')
    );
    expect(calendarDateFromUnix(Date.UTC(2026, 5, 20, 18, 10) / 1000, 'Asia/Kathmandu')).toBe(
      d('2026-06-20')
    );
  });

  it('builds one formatter per zone, not one per call', function () {
    const real = Intl.DateTimeFormat;
    let built = 0;
    (Intl as any).DateTimeFormat = function (...args: any[]) {
      built += 1;
      return new (real as any)(...args);
    };
    try {
      // A zone no earlier spec has touched, since the cache outlives each spec
      for (let i = 0; i < 5; i++) calendarDateFromUnix(INSTANT, 'Europe/Oslo');
    } finally {
      (Intl as any).DateTimeFormat = real;
    }
    expect(built).toBe(1);
  });
});

describe('dayStartUnix', function () {
  it('lands on the date it was given, whatever that day starts at', function () {
    // Not asserted as a wall clock: where local midnight doesn't exist the day starts at
    // 01:00, and that instant is still the correct start of the date.
    ['2026-06-21', '2026-03-08', '2026-11-01', '2026-09-06'].forEach((iso) => {
      expect(calendarDateFromUnix(dayStartUnix(d(iso)))).toBe(d(iso));
    });
  });

  it('round-trips any instant through its date', function () {
    const start = dayStartUnix(calendarDateFromUnix(at('2026-06-21', 17, 45)));
    expect(calendarDateFromUnix(start)).toBe(d('2026-06-21'));
  });
});

describe('nextDayStartUnix', function () {
  // The exclusive boundary a stored or serialized end needs: one day's worth past the last
  // covered day, and not two.
  it('satisfies the overlap test for exactly the days covered', function () {
    const end = nextDayStartUnix(d('2026-06-21')); // one-day event on the 21st
    expect(end > dayStartUnix(d('2026-06-21'))).toBe(true);
    expect(end > dayStartUnix(d('2026-06-22'))).toBe(false);
  });

  it('is the next day-start', function () {
    expect(nextDayStartUnix(d('2026-06-21'))).toBe(dayStartUnix(d('2026-06-22')));
  });

  it('holds across a transition day, where the span is not 86400 seconds', function () {
    ['2026-03-08', '2026-11-01', '2026-09-06'].forEach((iso) => {
      const next = addCalendarDays(d(iso), 1);
      expect(nextDayStartUnix(d(iso))).toBe(dayStartUnix(next));
      expect(nextDayStartUnix(d(iso)) > dayStartUnix(d(iso))).toBe(true);
    });
  });
});

// Host-zone reads, so these discriminate only on the pinned Chicago runner. UTC literals are
// used where a fixture built through the Date constructor would resolve a gap or a repeat the
// same way the code does.
const ORDINARY_DAY = '2026-06-21';
const FALL_BACK_DAY = '2025-11-02'; // 25 hours in Chicago
const SPRING_FORWARD_DAY = '2026-03-08'; // 23 hours in Chicago
const SAMPLE_DAYS = [ORDINARY_DAY, FALL_BACK_DAY, SPRING_FORWARD_DAY];

describe('secondsIntoDay', function () {
  it('reads the wall clock, not elapsed time, on a transition day', function () {
    expect(secondsIntoDay(at(ORDINARY_DAY, 10, 30))).toBe(37800);
    expect(secondsIntoDay(at(FALL_BACK_DAY, 10, 30))).toBe(37800); // 41400s after midnight
    expect(secondsIntoDay(at(SPRING_FORWARD_DAY, 10, 30))).toBe(37800); // 34200s after midnight
  });

  it('is 0 at midnight and 86399 at the last second', function () {
    expect(secondsIntoDay(at(ORDINARY_DAY))).toBe(0);
    expect(secondsIntoDay(at(ORDINARY_DAY, 23, 59, 59))).toBe(86399);
  });
});

describe('secondsIntoDayUnix', function () {
  it('inverts secondsIntoDay on ordinary and transition days alike', function () {
    SAMPLE_DAYS.forEach((iso) => {
      expect(secondsIntoDayUnix(d(iso), 37800)).toBe(at(iso, 10, 30));
      expect(secondsIntoDay(secondsIntoDayUnix(d(iso), 37800))).toBe(37800);
    });
  });

  it('resolves a time inside the spring-forward gap forward', function () {
    // 02:30 does not exist on 2026-03-08 in Chicago; the clock goes 01:59 -> 03:00.
    expect(secondsIntoDayUnix(d(SPRING_FORWARD_DAY), 9000)).toBe(
      Date.UTC(2026, 2, 8, 8, 30) / 1000
    );
  });

  it('picks the first occurrence of a fall-back repeated hour', function () {
    // 01:30 happens twice on 2025-11-02 in Chicago: 06:30Z (CDT) and 07:30Z (CST).
    expect(secondsIntoDayUnix(d(FALL_BACK_DAY), 5400)).toBe(Date.UTC(2025, 10, 2, 6, 30) / 1000);
  });

  it('lands 86400 on the next day-start, whatever the day length', function () {
    SAMPLE_DAYS.forEach((iso) => {
      expect(secondsIntoDayUnix(d(iso), 86400)).toBe(nextDayStartUnix(d(iso)));
    });
  });
});

describe('firstOccurrenceUnix', function () {
  const cdt130 = Date.UTC(2025, 10, 2, 6, 30) / 1000;
  const cst130 = Date.UTC(2025, 10, 2, 7, 30) / 1000;

  it('is the instant itself outside a repeated hour', function () {
    [
      at(ORDINARY_DAY, 10, 30),
      at(FALL_BACK_DAY, 10, 30),
      at(SPRING_FORWARD_DAY, 3, 30),
      cdt130,
    ].forEach((unix) => expect(firstOccurrenceUnix(unix)).toBe(unix));
  });

  it('is an hour earlier inside the second occurrence of a repeated hour', function () {
    expect(firstOccurrenceUnix(cst130)).toBe(cdt130);
  });
});

describe('sameOffsetOccurrenceUnix', function () {
  const cdt130 = Date.UTC(2025, 10, 2, 6, 30) / 1000;
  const cst130 = Date.UTC(2025, 10, 2, 7, 30) / 1000;
  const cst330 = Date.UTC(2025, 10, 2, 9, 30) / 1000;

  it("resolves a repeated reading to the reference's side of the transition", function () {
    expect(sameOffsetOccurrenceUnix(cdt130, cst130)).toBe(cst130);
    expect(sameOffsetOccurrenceUnix(cst130, cdt130)).toBe(cdt130);
    expect(sameOffsetOccurrenceUnix(cdt130, cst330)).toBe(cst130); // 3:30 CST is on the CST side
  });

  it('is decided by side, not distance', function () {
    // 1:00 CST as reference, 1:30 CDT as instant: the CDT and CST 1:30s are equally far, and a
    // nearest-instant rule would keep CDT — 30 real minutes EARLIER than the gesture.
    const cst100 = Date.UTC(2025, 10, 2, 7, 0) / 1000;
    expect(sameOffsetOccurrenceUnix(cdt130, cst100)).toBe(cst130);
    expect(sameOffsetOccurrenceUnix(cst130, cst100 - 2 * 3600)).toBe(cdt130); // 11:00 PM CDT reference
  });

  it('keeps an instant whose reading happens once', function () {
    const ten = at(FALL_BACK_DAY, 10, 30);
    expect(sameOffsetOccurrenceUnix(ten, ten - 5 * 3600)).toBe(ten);
    const gapEdge = at(SPRING_FORWARD_DAY, 3, 30); // 2:30 does not exist; 3:30 happens once
    expect(sameOffsetOccurrenceUnix(gapEdge, gapEdge - 3600)).toBe(gapEdge);
  });

  it('keeps the instant when it is already on the reference side', function () {
    expect(sameOffsetOccurrenceUnix(cdt130, cdt130 - 600)).toBe(cdt130);
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

  it('crosses dates that a timestamp shift would have gotten wrong', function () {
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

  it('counts across dates a timestamp diff would have made fractional', function () {
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

describe('the readable form', function () {
  // The value is a plain number at runtime, so a spec asserting the wrong day would otherwise
  // read as "expected 20627, got 20628". These keep failures legible.
  it('round-trips through the readable form', function () {
    ['2026-06-21', '2026-01-05', '2026-12-31', '2028-02-29'].forEach((iso) => {
      expect(formatCalendarDate(parseCalendarDate(iso))).toBe(iso);
    });
  });
});
