// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import {
  inclusiveAllDayEnd,
  exclusiveAllDayEnd,
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
