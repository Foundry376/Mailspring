import { CalendarDate, CalendarDateUtils } from 'mailspring-exports';
import { EventOccurrence, occurrenceStartUnix } from './calendar-data-source';

/** One week row's piece of an event: a multi-day event cut at the row's edges, or a one-day chip. */
export interface MonthViewBar {
  event: EventOccurrence;
  /** Columns are indexes into the row's days, inclusive at both ends. */
  firstColumn: number;
  lastColumn: number;
  /** The lane, 0 at the top; the same in every column the bar covers. */
  slot: number;
  /** Whether the event began in an earlier row, so this bar's start edge is a cut, not its start. */
  continuesBefore: boolean;
  /** Whether the event goes on into a later row. */
  continuesAfter: boolean;
}

export interface WeekBarsLayout {
  /** The bars to draw, in render order. Hidden bars are left out. */
  bars: MonthViewBar[];
  /** Per column, how many events covering that day are hidden; "+N more" takes the last lane where nonzero. */
  hiddenCountByDay: number[];
}

function spansDays(e: EventOccurrence) {
  return e.endDate > e.startDate;
}

// Google's order: multi-day bars first (all-day and timed together), then one-day all-day, then
// one-day timed. Placing every bar before any chip keeps a bar's lane free in all its columns.
function rank(e: EventOccurrence) {
  if (spansDays(e)) return 0;
  return e.isAllDay ? 1 : 2;
}

function compareForLayout(a: EventOccurrence, b: EventOccurrence) {
  return (
    rank(a) - rank(b) ||
    a.startDate - b.startDate ||
    b.endDate - a.endDate ||
    occurrenceStartUnix(a) - occurrenceStartUnix(b)
  );
}

/**
 * Lays out one week row of the month grid: each event covering the row becomes one bar, given the
 * lowest lane free across every column it covers.
 *
 * `maxSlots` lanes fit in a day. Where a day has more, its last lane holds "+N more" instead, so a
 * bar in that lane is hidden if any day it covers overflows, and counted in each of those days.
 */
export function layoutWeekBars(
  events: EventOccurrence[],
  weekDays: CalendarDate[],
  maxSlots: number
): WeekBarsLayout {
  const weekStart = weekDays[0];
  const lastColumn = weekDays.length - 1;
  const weekEnd = weekDays[lastColumn];

  const occupied: boolean[][] = [];
  const isFree = (slot: number, from: number, to: number) => {
    for (let c = from; c <= to; c++) {
      if (occupied[slot]?.[c]) return false;
    }
    return true;
  };

  const placed: MonthViewBar[] = events
    .filter((e) => e.startDate <= weekEnd && e.endDate >= weekStart)
    .sort(compareForLayout)
    .map((event) => {
      const first = Math.max(CalendarDateUtils.calendarDaysBetween(weekStart, event.startDate), 0);
      const last = Math.min(
        CalendarDateUtils.calendarDaysBetween(weekStart, event.endDate),
        lastColumn
      );
      let slot = 0;
      while (!isFree(slot, first, last)) slot++;
      occupied[slot] = occupied[slot] || [];
      for (let c = first; c <= last; c++) occupied[slot][c] = true;
      return {
        event,
        firstColumn: first,
        lastColumn: last,
        slot,
        continuesBefore: event.startDate < weekStart,
        continuesAfter: event.endDate > weekEnd,
      };
    });

  const overflows = weekDays.map((_, c) =>
    placed.some((b) => b.slot >= maxSlots && b.firstColumn <= c && c <= b.lastColumn)
  );
  const isHidden = (b: MonthViewBar) =>
    b.slot >= maxSlots ||
    (b.slot === maxSlots - 1 && overflows.slice(b.firstColumn, b.lastColumn + 1).some(Boolean));

  const hiddenCountByDay = weekDays.map(() => 0);
  const bars: MonthViewBar[] = [];
  for (const b of placed) {
    if (isHidden(b)) {
      for (let c = b.firstColumn; c <= b.lastColumn; c++) hiddenCountByDay[c]++;
    } else {
      bars.push(b);
    }
  }
  return { bars, hiddenCountByDay };
}
