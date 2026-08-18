// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import moment from 'moment-timezone';
import {
  inclusiveAllDayEnd,
  shiftEndWithStart,
  clampEnd,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { shiftedDayStartUnix, calendarDateFromUnix, nextDayStartUnix } from '../src/calendar-date';

/** The stored exclusive end for a last-covered day, as the production callers now build it */
const exclusiveEnd = (lastDay: number) => nextDayStartUnix(calendarDateFromUnix(lastDay));

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

  // Shrinking a one-day event returns its own end untouched, so a caller must treat that as
  // a no-op. _applyKeyboardEventChange relies on this; that guard has no test of its own.
  it('returns the end unchanged when a one-day event is shrunk', function () {
    const start = localDay(2026, 6, 22);
    const end = localDay(2026, 6, 23);
    expect(clampEnd(start, shiftedDayStartUnix(end, -1), true)).toBe(end);
    // a longer span really does shrink
    expect(clampEnd(start, shiftedDayStartUnix(localDay(2026, 6, 25), -1), true)).toBe(
      localDay(2026, 6, 24)
    );
  });

  it('returns the end unchanged when a minimum-length timed event is shrunk', function () {
    const start = localDay(2026, 6, 22);
    const end = start + 900;
    expect(clampEnd(start, end - 900, false)).toBe(end);
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

// A moment.tz.setDefault-pinned DST block lived here. It's gone rather than patched: setDefault
// only reaches code still computing through moment, and the day math it covered now runs on
// epoch-day integers, which have no zone behaviour to pin. That coverage is in
// calendar-date-spec.ts, zone-independent by construction.
//
// inclusiveAllDayEnd is the last moment holdout, and it needed no pinned coverage: for an exact
// midnight its truncation is correct in every zone, transition days included. Its one bad input
// is an end an hour past midnight, which it cannot tell from the all-day toggle wall-clock ends
// - indistinguishable by construction, and unreachable while callers pass ical.js values.
