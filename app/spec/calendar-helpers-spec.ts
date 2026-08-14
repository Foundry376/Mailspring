// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import {
  inclusiveAllDayEnd,
  exclusiveAllDayEnd,
  addCalendarDays,
  calendarDaysBetween,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';

/** Local midnight, as unix seconds — all-day times are built from local date components */
function localDay(year: number, month1Indexed: number, day: number): number {
  return new Date(year, month1Indexed - 1, day).getTime() / 1000;
}

describe('inclusiveAllDayEnd', function () {
  it('maps a stored exclusive end back to the last day covered', function () {
    // Stored as June 22 (exclusive); the event actually covers June 21
    expect(inclusiveAllDayEnd(localDay(2026, 6, 22))).toBe(localDay(2026, 6, 21));
  });

  it('keeps a multi-day span pointing at its final day', function () {
    expect(inclusiveAllDayEnd(localDay(2026, 6, 23))).toBe(localDay(2026, 6, 22));
  });

  it('truncates a mid-day end to that same day, as the all-day toggle produces', function () {
    expect(inclusiveAllDayEnd(localDay(2026, 6, 22) + 11 * 3600)).toBe(localDay(2026, 6, 22));
  });

  it('crosses month and year boundaries', function () {
    expect(inclusiveAllDayEnd(localDay(2026, 7, 1))).toBe(localDay(2026, 6, 30));
    expect(inclusiveAllDayEnd(localDay(2027, 1, 1))).toBe(localDay(2026, 12, 31));
  });
});

describe('exclusiveAllDayEnd', function () {
  it('turns a picked day into the midnight after it', function () {
    expect(exclusiveAllDayEnd(localDay(2026, 6, 21))).toBe(localDay(2026, 6, 22));
  });

  it('crosses month and year boundaries', function () {
    expect(exclusiveAllDayEnd(localDay(2026, 6, 30))).toBe(localDay(2026, 7, 1));
    expect(exclusiveAllDayEnd(localDay(2026, 12, 31))).toBe(localDay(2027, 1, 1));
  });

  it('round-trips with inclusiveAllDayEnd', function () {
    [
      localDay(2026, 6, 22),
      localDay(2026, 6, 23),
      localDay(2026, 7, 1),
      localDay(2027, 1, 1),
    ].forEach((storedEnd) => {
      expect(exclusiveAllDayEnd(inclusiveAllDayEnd(storedEnd))).toBe(storedEnd);
    });
  });

  it('is stable when a picked day is re-picked', function () {
    const picked = localDay(2026, 6, 21);
    expect(inclusiveAllDayEnd(exclusiveAllDayEnd(picked))).toBe(picked);
  });
});

// These exercise DST transitions using 2026 US dates: March 8 is a 23-hour day and
// November 1 a 25-hour day. In a zone without DST they still pass, just vacuously —
// the specs cannot set TZ at runtime.
describe('addCalendarDays', function () {
  it('lands on the next calendar day across a spring-forward transition', function () {
    expect(addCalendarDays(localDay(2026, 3, 7), 1)).toBe(localDay(2026, 3, 8));
    expect(addCalendarDays(localDay(2026, 3, 7), 2)).toBe(localDay(2026, 3, 9));
  });

  it('lands on the next calendar day across a fall-back transition', function () {
    expect(addCalendarDays(localDay(2026, 11, 1), 1)).toBe(localDay(2026, 11, 2));
    expect(addCalendarDays(localDay(2026, 10, 31), 3)).toBe(localDay(2026, 11, 3));
  });

  it('shifts backwards', function () {
    expect(addCalendarDays(localDay(2026, 3, 9), -2)).toBe(localDay(2026, 3, 7));
  });

  it('crosses month and year boundaries', function () {
    expect(addCalendarDays(localDay(2026, 6, 30), 1)).toBe(localDay(2026, 7, 1));
    expect(addCalendarDays(localDay(2026, 12, 31), 1)).toBe(localDay(2027, 1, 1));
  });
});

describe('calendarDaysBetween', function () {
  it('counts whole days regardless of how long the day was', function () {
    expect(calendarDaysBetween(localDay(2026, 3, 7), localDay(2026, 3, 9))).toBe(2);
    expect(calendarDaysBetween(localDay(2026, 11, 1), localDay(2026, 11, 3))).toBe(2);
  });

  it('is zero for the same day and negative going backwards', function () {
    expect(calendarDaysBetween(localDay(2026, 3, 8), localDay(2026, 3, 8))).toBe(0);
    expect(calendarDaysBetween(localDay(2026, 3, 9), localDay(2026, 3, 7))).toBe(-2);
  });

  it('round-trips with addCalendarDays', function () {
    [-3, -1, 0, 1, 5, 40].forEach((days) => {
      const from = localDay(2026, 3, 7);
      expect(calendarDaysBetween(from, addCalendarDays(from, days))).toBe(days);
    });
  });
});

describe('shifting an all-day range', function () {
  // The bug this guards: shifting the end by 86400 seconds instead of a calendar day
  // left it off midnight on a 23- or 25-hour day, and the event gained or lost a day.
  function shiftAllDay(start: number, end: number, newStart: number) {
    const days = calendarDaysBetween(start, newStart);
    return exclusiveAllDayEnd(addCalendarDays(inclusiveAllDayEnd(end), days));
  }

  it('keeps a one-day event one day long across spring-forward', function () {
    const shifted = shiftAllDay(localDay(2026, 3, 7), localDay(2026, 3, 8), localDay(2026, 3, 8));
    expect(shifted).toBe(localDay(2026, 3, 9));
  });

  it('keeps a three-day event three days long across fall-back', function () {
    const shifted = shiftAllDay(
      localDay(2026, 10, 30),
      localDay(2026, 11, 2),
      localDay(2026, 11, 1)
    );
    expect(calendarDaysBetween(localDay(2026, 11, 1), shifted)).toBe(3);
  });
});
