// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import moment from 'moment-timezone';
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
    expect(addCalendarDays(localDay(2026, 6, 24), -2)).toBe(localDay(2026, 6, 22));
  });

  it('crosses month and year boundaries', function () {
    expect(addCalendarDays(localDay(2026, 6, 30), 1)).toBe(localDay(2026, 7, 1));
    expect(addCalendarDays(localDay(2026, 12, 31), 1)).toBe(localDay(2027, 1, 1));
  });
});

describe('calendarDaysBetween', function () {
  it('is zero for the same day and negative going backwards', function () {
    expect(calendarDaysBetween(localDay(2026, 6, 22), localDay(2026, 6, 22))).toBe(0);
    expect(calendarDaysBetween(localDay(2026, 6, 24), localDay(2026, 6, 22))).toBe(-2);
  });

  it('round-trips with addCalendarDays', function () {
    [-3, -1, 0, 1, 5, 40].forEach((days) => {
      const from = localDay(2026, 6, 22);
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

  // Shrinking a one-day event returns its own end untouched, so a caller must treat that as
  // a no-op. _applyKeyboardEventChange relies on this; that guard has no test of its own.
  it('returns the end unchanged when a one-day event is shrunk', function () {
    const start = localDay(2026, 6, 22);
    const end = localDay(2026, 6, 23);
    expect(clampEnd(start, addCalendarDays(end, -1), true)).toBe(end);
    // a longer span really does shrink
    expect(clampEnd(start, addCalendarDays(localDay(2026, 6, 25), -1), true)).toBe(
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

// Calendar-day arithmetic only differs from a naive +86400 on a DST transition day, so these
// pin the zone rather than relying on the machine's. moment-timezone augments the same moment
// instance calendar-helpers imports, so setDefault reaches the code under test; fixtures use
// an explicit zone so every assertion holds under CI's UTC too.
describe('calendar-day arithmetic across DST transitions', function () {
  afterEach(function () {
    moment.tz.setDefault(); // back to the machine's zone, or the rest of the suite inherits this
  });

  /** Start of a calendar day in `zone`, whatever wall clock that instant carries */
  const dayStart = (zone: string, iso: string) => moment.tz(iso, zone).unix();

  describe('where the transition is at 2am', function () {
    const ZONE = 'America/Chicago';

    it('advances to the next day-start across spring-forward, where +86400 overshoots', function () {
      moment.tz.setDefault(ZONE);
      const mar8 = dayStart(ZONE, '2026-03-08');
      expect(addCalendarDays(mar8, 1)).toBe(dayStart(ZONE, '2026-03-09'));
      expect(addCalendarDays(mar8, 1) - mar8).toBe(23 * 3600);
    });

    it('advances to the next day-start across fall-back, where +86400 undershoots', function () {
      moment.tz.setDefault(ZONE);
      const nov1 = dayStart(ZONE, '2026-11-01');
      expect(addCalendarDays(nov1, 1)).toBe(dayStart(ZONE, '2026-11-02'));
      expect(addCalendarDays(nov1, 1) - nov1).toBe(25 * 3600);
    });

    it('gives a 23-hour day a full exclusive end', function () {
      moment.tz.setDefault(ZONE);
      expect(exclusiveAllDayEnd(dayStart(ZONE, '2026-03-08'))).toBe(dayStart(ZONE, '2026-03-09'));
      expect(inclusiveAllDayEnd(dayStart(ZONE, '2026-03-09'))).toBe(dayStart(ZONE, '2026-03-08'));
    });

    it('keeps a multi-day span the same number of days across a transition', function () {
      moment.tz.setDefault(ZONE);
      // Mar 6 -> Mar 8 exclusive covers 2 days; move the start to Mar 7, spanning the transition
      const start = dayStart(ZONE, '2026-03-06');
      const end = dayStart(ZONE, '2026-03-08');
      const newStart = dayStart(ZONE, '2026-03-07');
      expect(shiftEndWithStart(start, end, newStart, true)).toBe(dayStart(ZONE, '2026-03-09'));
    });

    it('floors an all-day end to a whole calendar day, not 86400 seconds', function () {
      moment.tz.setDefault(ZONE);
      const mar8 = dayStart(ZONE, '2026-03-08');
      expect(clampEnd(mar8, mar8, true)).toBe(dayStart(ZONE, '2026-03-09'));
    });
  });

  describe('where the transition is at midnight', function () {
    // Santiago springs forward at 24:00, so 2026-09-06 has no 00:00 and startOf('day')
    // normalizes to 01:00 — the case that leaves a fractional day-diff.
    const ZONE = 'America/Santiago';

    it('returns whole days when an endpoint is the transition day', function () {
      moment.tz.setDefault(ZONE);
      const sep6 = dayStart(ZONE, '2026-09-06');
      expect(calendarDaysBetween(sep6, addCalendarDays(sep6, 5))).toBe(5);
      expect(calendarDaysBetween(sep6, addCalendarDays(sep6, -5))).toBe(-5);
      expect(calendarDaysBetween(sep6, addCalendarDays(sep6, 1))).toBe(1);
    });

    // These compare calendar days, not instants. Where midnight doesn't exist the day starts
    // at 01:00, and addCalendarDays carries that wall clock, so a round trip can shift by an
    // hour within the same day. Both encode the same DATE, so only the day is contractual.
    it('round-trips inclusive and exclusive ends onto the same day', function () {
      moment.tz.setDefault(ZONE);
      const sep6 = dayStart(ZONE, '2026-09-06');
      [-1, 0, 1].forEach((offset) => {
        const start = addCalendarDays(sep6, offset);
        const roundTripped = inclusiveAllDayEnd(exclusiveAllDayEnd(start));
        expect(calendarDaysBetween(start, roundTripped)).toBe(0);
      });
    });

    it('carries an end with its start without losing or gaining a day', function () {
      moment.tz.setDefault(ZONE);
      const start = dayStart(ZONE, '2026-09-04');
      const end = exclusiveAllDayEnd(start); // one-day event
      const newStart = dayStart(ZONE, '2026-09-06'); // the transition day
      const moved = shiftEndWithStart(start, end, newStart, true);
      // Still exactly one day long, and still the day after the new start
      expect(calendarDaysBetween(newStart, moved)).toBe(1);
      expect(calendarDaysBetween(newStart, inclusiveAllDayEnd(moved))).toBe(0);
    });

    // The only input shape where `add` before `startOf` differs from the reverse: the day
    // BEFORE a missing midnight. Truncating first lands on the transition day at 23:00,
    // still inside the previous day, which collapses a one-day event to zero length.
    it('takes the next day-start when the following midnight does not exist', function () {
      moment.tz.setDefault(ZONE);
      expect(exclusiveAllDayEnd(dayStart(ZONE, '2026-09-05'))).toBe(dayStart(ZONE, '2026-09-06'));
    });

    it('spans the transition day itself without dropping it', function () {
      moment.tz.setDefault(ZONE);
      const start = dayStart(ZONE, '2026-09-05');
      const end = exclusiveAllDayEnd(addCalendarDays(start, 2)); // covers 5th, 6th, 7th
      expect(calendarDaysBetween(start, inclusiveAllDayEnd(end))).toBe(2);
    });
  });
});
