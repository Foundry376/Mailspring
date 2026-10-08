// Import directly from the source file; the plugin isn't registered in mailspring-exports.
import {
  firstVisibleBarIds,
  layoutWeekBars,
} from '../internal_packages/main-calendar/lib/core/month-view-helpers';
import {
  EventOccurrence,
  coveredDates,
} from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { calendarDateFromUnix } from '../src/calendar-date';
import moment from 'moment';

// Built the way MonthView builds a row: seven local midnights, read as dates.
function weekFrom(startISO: string) {
  return Array.from({ length: 7 }, (_, i) =>
    calendarDateFromUnix(moment(startISO).add(i, 'days').unix())
  );
}

function makeOccurrence(
  id: string,
  start: number,
  end: number,
  isAllDay: boolean
): EventOccurrence {
  const base = {
    id,
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: id,
    location: '',
    description: '',
    isCancelled: false,
    isPending: false,
    isMine: true,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    ...coveredDates(start, end, isAllDay),
  };
  return isAllDay ? { ...base, isAllDay: true } : { ...base, isAllDay: false, start, end };
}

/** All-day from `firstISO` through `lastISO`, inclusive. */
function allDay(id: string, firstISO: string, lastISO = firstISO) {
  return makeOccurrence(id, moment(firstISO).unix(), moment(lastISO).add(1, 'day').unix(), true);
}

function timed(id: string, startISO: string, endISO: string) {
  return makeOccurrence(id, moment(startISO).unix(), moment(endISO).unix(), false);
}

// Sunday 2026-10-04 through Saturday 2026-10-10.
const WEEK = weekFrom('2026-10-04');
const NEXT_WEEK = weekFrom('2026-10-11');

function barFor(layout: ReturnType<typeof layoutWeekBars>, id: string) {
  const bar = layout.bars.find((b) => b.event.id === id);
  return (
    bar && {
      columns: [bar.firstColumn, bar.lastColumn],
      slot: bar.slot,
      continuesBefore: bar.continuesBefore,
      continuesAfter: bar.continuesAfter,
    }
  );
}

describe('layoutWeekBars', function () {
  it('draws a three-day all-day event as one bar across its columns', function () {
    const layout = layoutWeekBars([allDay('trip', '2026-10-06', '2026-10-08')], WEEK, 5);
    expect(layout.bars.length).toBe(1);
    expect(barFor(layout, 'trip')).toEqual({
      columns: [2, 4],
      slot: 0,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('cuts a bar at the end of the row and continues it on the next', function () {
    const event = allDay('trip', '2026-10-09', '2026-10-13');
    expect(barFor(layoutWeekBars([event], WEEK, 5), 'trip')).toEqual({
      columns: [5, 6],
      slot: 0,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(barFor(layoutWeekBars([event], NEXT_WEEK, 5), 'trip')).toEqual({
      columns: [0, 2],
      slot: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('treats an event filling the row exactly as neither continued nor cut', function () {
    const layout = layoutWeekBars(
      [allDay('week', '2026-10-04', '2026-10-10'), allDay('sunday', '2026-10-04')],
      WEEK,
      5
    );
    expect(barFor(layout, 'week')).toEqual({
      columns: [0, 6],
      slot: 0,
      continuesBefore: false,
      continuesAfter: false,
    });
    expect(barFor(layout, 'sunday').columns).toEqual([0, 0]);
  });

  it('spans a timed event that crosses midnight, but not one that ends at it', function () {
    const layout = layoutWeekBars(
      [
        timed('flight', '2026-10-06T22:00', '2026-10-07T01:00'),
        timed('late', '2026-10-08T22:00', '2026-10-09T00:00'),
      ],
      WEEK,
      5
    );
    expect(barFor(layout, 'flight').columns).toEqual([2, 3]);
    expect(barFor(layout, 'late').columns).toEqual([4, 4]);
  });

  it('holds a bar in the same lane in every column it covers', function () {
    const layout = layoutWeekBars(
      [
        timed('standup', '2026-10-06T09:00', '2026-10-06T09:15'),
        allDay('trip', '2026-10-05', '2026-10-07'),
        timed('review', '2026-10-08T10:00', '2026-10-08T11:00'),
      ],
      WEEK,
      5
    );
    expect(barFor(layout, 'trip').slot).toBe(0);
    expect(barFor(layout, 'standup').slot).toBe(1);
    expect(barFor(layout, 'review').slot).toBe(0);
  });

  it('puts multi-day bars first, then one-day all-day, then one-day timed by start', function () {
    const layout = layoutWeekBars(
      [
        timed('late', '2026-10-06T15:00', '2026-10-06T16:00'),
        timed('early', '2026-10-06T08:00', '2026-10-06T09:00'),
        allDay('holiday', '2026-10-06'),
        allDay('trip', '2026-10-06', '2026-10-07'),
      ],
      WEEK,
      5
    );
    expect(['trip', 'holiday', 'early', 'late'].map((id) => barFor(layout, id).slot)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('puts a one-day all-day event above a timed one starting at midnight', function () {
    const layout = layoutWeekBars(
      [timed('midnight', '2026-10-06T00:00', '2026-10-06T01:00'), allDay('holiday', '2026-10-06')],
      WEEK,
      5
    );
    expect(barFor(layout, 'holiday').slot).toBe(0);
    expect(barFor(layout, 'midnight').slot).toBe(1);
  });

  it('orders multi-day bars by start, then longest first, all-day and timed together', function () {
    const layout = layoutWeekBars(
      [
        allDay('short', '2026-10-05', '2026-10-06'),
        allDay('later', '2026-10-06', '2026-10-09'),
        timed('overnight', '2026-10-04T20:00', '2026-10-05T10:00'),
        allDay('long', '2026-10-05', '2026-10-08'),
      ],
      WEEK,
      5
    );
    expect(barFor(layout, 'overnight').slot).toBe(0);
    expect(barFor(layout, 'long').slot).toBe(1);
    expect(barFor(layout, 'short').slot).toBe(2);
    // Free from Tuesday on in lane 0, which 'overnight' left on Monday.
    expect(barFor(layout, 'later').slot).toBe(0);
  });

  it('shows every event when a day fills its lanes exactly', function () {
    const events = ['a', 'b', 'c'].map((id, i) =>
      timed(id, `2026-10-06T0${i + 1}:00`, `2026-10-06T0${i + 1}:30`)
    );
    const layout = layoutWeekBars(events, WEEK, 3);
    expect(layout.bars.length).toBe(3);
    expect(layout.hiddenCountByDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('gives an overflowing day\'s last lane to "+N more"', function () {
    const events = ['a', 'b', 'c', 'd'].map((id, i) =>
      timed(id, `2026-10-06T0${i + 1}:00`, `2026-10-06T0${i + 1}:30`)
    );
    const layout = layoutWeekBars(events, WEEK, 3);
    expect(layout.bars.map((b) => b.event.id)).toEqual(['a', 'b']);
    expect(layout.hiddenCountByDay).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('hides a last-lane bar in every day it covers when any of them overflows', function () {
    const layout = layoutWeekBars(
      [
        allDay('one', '2026-10-05', '2026-10-06'),
        allDay('two', '2026-10-05', '2026-10-06'),
        allDay('three', '2026-10-05', '2026-10-06'),
        timed('extra', '2026-10-06T09:00', '2026-10-06T10:00'),
      ],
      WEEK,
      3
    );
    expect(layout.bars.map((b) => b.event.id)).toEqual(['one', 'two']);
    // Monday has room, but 'three' is one bar, so it is hidden there too and counted there.
    expect(layout.hiddenCountByDay).toEqual([0, 1, 2, 0, 0, 0, 0]);
  });

  it('keeps a last-lane bar whose days all have room', function () {
    const layout = layoutWeekBars(
      [
        allDay('one', '2026-10-05', '2026-10-06'),
        allDay('two', '2026-10-05', '2026-10-06'),
        allDay('three', '2026-10-05', '2026-10-06'),
        timed('extra', '2026-10-08T09:00', '2026-10-08T10:00'),
      ],
      WEEK,
      3
    );
    expect(layout.bars.length).toBe(4);
    expect(layout.hiddenCountByDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('leaves out events outside the row', function () {
    const layout = layoutWeekBars(
      [allDay('before', '2026-10-01', '2026-10-03'), allDay('after', '2026-10-11')],
      WEEK,
      5
    );
    expect(layout.bars).toEqual([]);
  });

  it('places by date across a spring-forward week', function () {
    // America/Chicago (the runner's zone) springs forward on Sunday 2026-03-08.
    const dstWeek = weekFrom('2026-03-08');
    const layout = layoutWeekBars(
      [
        allDay('trip', '2026-03-08', '2026-03-10'),
        timed('meeting', '2026-03-14T10:00', '2026-03-14T11:00'),
      ],
      dstWeek,
      5
    );
    expect(barFor(layout, 'trip').columns).toEqual([0, 2]);
    expect(barFor(layout, 'meeting').columns).toEqual([6, 6]);
  });
});

describe('firstVisibleBarIds', function () {
  it("gives an event's first visible bar the focus, even when overflow hides an earlier one", function () {
    // Three bars from Friday fill Saturday, so the trip's first-row bar lands past the cap.
    const busy = ['a', 'b', 'c'].map((id) => allDay(id, '2026-10-09', '2026-10-10'));
    const events = [...busy, allDay('trip', '2026-10-10', '2026-10-12')];
    const layouts = [layoutWeekBars(events, WEEK, 3), layoutWeekBars(events, NEXT_WEEK, 3)];
    expect(layouts[0].bars.some((b) => b.event.id === 'trip')).toBe(false);
    const [first, second] = firstVisibleBarIds(layouts);
    expect(first.has('trip')).toBe(false);
    expect(second.has('trip')).toBe(true);
    expect(first.has('a')).toBe(true);
  });
});
