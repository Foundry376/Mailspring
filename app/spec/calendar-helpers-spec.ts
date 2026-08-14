// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import {
  inclusiveAllDayEnd,
  exclusiveAllDayEnd,
  addCalendarDays,
  calendarDaysBetween,
  shiftEndWithStart,
  clampEnd,
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

describe('addCalendarDays', function () {
  it('shifts backwards', function () {
    expect(addCalendarDays(localDay(2026, 3, 9), -2)).toBe(localDay(2026, 3, 7));
  });

  it('crosses month and year boundaries', function () {
    expect(addCalendarDays(localDay(2026, 6, 30), 1)).toBe(localDay(2026, 7, 1));
    expect(addCalendarDays(localDay(2026, 12, 31), 1)).toBe(localDay(2027, 1, 1));
  });
});

describe('calendarDaysBetween', function () {
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

const MIN_EVENT = 900;

describe('shiftEndWithStart', function () {
  it('preserves a timed duration', function () {
    const start = localDay(2026, 6, 22) + 10 * 3600;
    const end = start + 3600;
    expect(shiftEndWithStart(start, end, start + 7200, false)).toBe(end + 7200);
  });

  it('keeps a one-day all-day event one day long', function () {
    expect(
      shiftEndWithStart(localDay(2026, 6, 22), localDay(2026, 6, 23), localDay(2026, 6, 25), true)
    ).toBe(localDay(2026, 6, 26));
  });

  it('keeps a multi-day all-day span intact', function () {
    expect(
      shiftEndWithStart(localDay(2026, 6, 20), localDay(2026, 6, 23), localDay(2026, 6, 27), true)
    ).toBe(localDay(2026, 6, 30));
  });

  it('is a no-op when the start does not move', function () {
    const start = localDay(2026, 6, 22);
    expect(shiftEndWithStart(start, localDay(2026, 6, 23), start, true)).toBe(
      localDay(2026, 6, 23)
    );
  });
});

describe('clampEnd', function () {
  it('leaves a valid end alone', function () {
    const start = localDay(2026, 6, 22);
    expect(clampEnd(start, start + 3600, false)).toBe(start + 3600);
    expect(clampEnd(start, localDay(2026, 6, 25), true)).toBe(localDay(2026, 6, 25));
  });

  it('floors a timed end at the minimum duration', function () {
    const start = localDay(2026, 6, 22) + 10 * 3600;
    expect(clampEnd(start, start - 7200, false)).toBe(start + MIN_EVENT);
    expect(clampEnd(start, start, false)).toBe(start + MIN_EVENT);
  });

  it('floors an all-day end at one whole day', function () {
    const start = localDay(2026, 6, 22);
    expect(clampEnd(start, localDay(2026, 6, 20), true)).toBe(localDay(2026, 6, 23));
    expect(clampEnd(start, start, true)).toBe(localDay(2026, 6, 23));
  });

  it('floors an all-day end at one day even when the start is mid-day', function () {
    // the all-day toggle leaves the original wall-clock start in place
    expect(clampEnd(localDay(2026, 6, 22) + 10 * 3600, localDay(2026, 6, 21), true)).toBe(
      localDay(2026, 6, 23)
    );
  });

  it('never returns an end at or before the start', function () {
    const start = localDay(2026, 6, 22);
    [start - 86400, start - 1, start, start + 1].forEach((proposed) => {
      expect(clampEnd(start, proposed, false)).toBeGreaterThan(start);
      expect(clampEnd(start, proposed, true)).toBeGreaterThan(start);
    });
  });
});
