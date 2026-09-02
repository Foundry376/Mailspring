// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import {
  eventsGroupedByDay,
  exclusiveDayEnds,
} from '../internal_packages/main-calendar/lib/core/week-view-helpers';
import {
  EventOccurrence,
  coveredDates,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import moment, { Moment } from 'moment';

// Runner is pinned to America/Chicago (scripts/test.js), so 2025-11-02 is a 25-hour day and
// 2026-03-08 a 23-hour one. Fixtures are built in that same host zone deliberately: the
// final-column fallback resolves through plain `Date`, which moment.tz.setDefault cannot
// reach, so a zone-pinned fixture would meet host-zone arithmetic inside the code under test.
function at(iso: string) {
  return moment(iso);
}

// A consecutive run of day columns, as the week and day views render them.
function daysFrom(startISO: string, count: number) {
  return Array.from({ length: count }, (_, i) => moment(startISO).add(i, 'days'));
}

// Mirrors makeOccurrence in calendar-drag-utils-spec: derive the dates and emit the right
// variant, so a fixture can't encode a shape production never emits.
function makeOccurrence(start: number, end: number, isAllDay = false): EventOccurrence {
  const base = {
    id: 'event-1-e0',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: 'Standup',
    location: '',
    description: '',
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    ...coveredDates(start, end, isAllDay),
  };
  return isAllDay ? { ...base, isAllDay: true } : { ...base, isAllDay: false, start, end };
}

function timedEvent(startISO: string, endISO: string) {
  return makeOccurrence(at(startISO).unix(), at(endISO).unix());
}

// Which of the rendered columns the event landed in, by ISO date.
function columnsContaining(event: EventOccurrence, days: Moment[]) {
  const map = eventsGroupedByDay([event], days);
  return days.filter((d) => map[`${d.unix()}`].length > 0).map((d) => d.format('YYYY-MM-DD'));
}

describe('eventsGroupedByDay', function () {
  it('places an ordinary timed event in exactly its own column', function () {
    const days = daysFrom('2026-06-08', 7);
    expect(columnsContaining(timedEvent('2026-06-10 10:00', '2026-06-10 11:00'), days)).toEqual([
      '2026-06-10',
    ]);
  });

  it('spans every column a multi-day timed event covers', function () {
    const days = daysFrom('2026-06-08', 7);
    expect(columnsContaining(timedEvent('2026-06-09 22:00', '2026-06-11 03:00'), days)).toEqual([
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
    ]);
  });

  it('keeps an event ending at midnight out of the following column', function () {
    // An 11pm-midnight event covers only the day it starts on; an inclusive end renders a
    // zero-height sliver in the next day's 12am slot.
    const days = daysFrom('2026-06-08', 7);
    expect(columnsContaining(timedEvent('2026-06-10 23:00', '2026-06-11 00:00'), days)).toEqual([
      '2026-06-10',
    ]);
  });

  it('places a late event on a 25-hour day in its own column', function () {
    // A day end of start + 86400 falls at 23:00 on 2025-11-02 and drops anything after it
    // from every column.
    const days = daysFrom('2025-11-01', 4);
    expect(columnsContaining(timedEvent('2025-11-02 23:30', '2025-11-02 23:45'), days)).toEqual([
      '2025-11-02',
    ]);
  });

  it('keeps an early event off the preceding 23-hour day', function () {
    // A day end of start + 86400 reaches an hour past midnight out of 2026-03-08 into 03-09.
    const days = daysFrom('2026-03-07', 4);
    expect(columnsContaining(timedEvent('2026-03-09 00:30', '2026-03-09 00:45'), days)).toEqual([
      '2026-03-09',
    ]);
  });

  it('bounds the final column, which has no successor to take its end from', function () {
    // The event sits on the day AFTER the last column; an unbounded fallback admits it.
    const days = daysFrom('2026-06-08', 3);
    expect(columnsContaining(timedEvent('2026-06-11 10:00', '2026-06-11 11:00'), days)).toEqual([]);
    expect(columnsContaining(timedEvent('2026-06-10 10:00', '2026-06-10 11:00'), days)).toEqual([
      '2026-06-10',
    ]);
  });

  it('excludes an event starting exactly at the next column start', function () {
    // Pins the strictness of `event.start < end`; with `<=` a midnight-starting event also
    // lands in the previous column.
    const days = daysFrom('2026-06-08', 7);
    expect(columnsContaining(timedEvent('2026-06-11 00:00', '2026-06-11 01:00'), days)).toEqual([
      '2026-06-11',
    ]);
  });

  it('keeps a zero-length event on its own day', function () {
    // Pins Math.max(end - 1, start): without it a start==end event's last instant is one
    // second before the day it belongs to, which at midnight is the previous day.
    const days = daysFrom('2026-06-08', 7);
    expect(columnsContaining(timedEvent('2026-06-10 00:00', '2026-06-10 00:00'), days)).toEqual([
      '2026-06-10',
    ]);
  });

  it('routes all-day events to the all-day row rather than a column', function () {
    const days = daysFrom('2026-06-08', 7);
    const allDay = makeOccurrence(at('2026-06-10').unix(), at('2026-06-11').unix(), true);
    const map = eventsGroupedByDay([allDay], days);
    expect(map.allDay.length).toBe(1);
    expect(days.every((d) => map[`${d.unix()}`].length === 0)).toBe(true);
  });
});

describe('exclusiveDayEnds', function () {
  it("gives each day the next day's start, so a DST day is not assumed to be 86400s", function () {
    const days = daysFrom('2025-11-01', 4);
    const ends = exclusiveDayEnds(days);
    expect(ends[1] - days[1].unix()).toBe(90000);
    expect(ends[0] - days[0].unix()).toBe(86400);
  });

  it('shortens a spring-forward day rather than assuming 86400s', function () {
    const days = daysFrom('2026-03-07', 4);
    expect(exclusiveDayEnds(days)[1] - days[1].unix()).toBe(82800);
  });

  it('resolves the final day, which has no successor', function () {
    const days = daysFrom('2026-06-08', 3);
    expect(exclusiveDayEnds(days)[2]).toBe(at('2026-06-11').unix());
  });
});
