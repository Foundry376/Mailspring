import { Moment } from 'moment-timezone';
import { CalendarDate, CalendarDateUtils } from 'mailspring-exports';
import { EventOccurrence, occurrenceStartUnix } from './calendar-data-source';

export interface MonthViewBar {
  event: EventOccurrence;
  /** Indexes into the row's days, inclusive at both ends. */
  firstColumn: number;
  lastColumn: number;
  slot: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface WeekBarsLayout {
  /** Hidden bars are left out. */
  bars: MonthViewBar[];
  hiddenCountByDay: number[];
}

/** The day's `data-calendar-start`/`-end`: what the drag hit-test reads off a cell, a bar or "+N more". */
export function dayBoundsUnix(first: Moment, last: Moment = first) {
  return { start: first.clone().startOf('day').unix(), end: last.clone().endOf('day').unix() };
}

// Google's order (bars, then one-day all-day, then timed by start) falls out of start date then
// longest first: only events sharing a column contest a lane, and of those a bar starts earlier or runs longer.
function compareForLayout(a: EventOccurrence, b: EventOccurrence) {
  return (
    a.startDate - b.startDate ||
    b.endDate - a.endDate ||
    Number(b.isAllDay) - Number(a.isAllDay) ||
    occurrenceStartUnix(a) - occurrenceStartUnix(b)
  );
}

/**
 * Where a day has more than `maxSlots` events its last lane holds "+N more", so a bar in that lane
 * is hidden if any day it covers overflows, and counted in each of those days.
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

/** Per row, the events whose first visible bar is in that row: the bar that takes Tab and focus. */
export function firstVisibleBarIds(layouts: WeekBarsLayout[]): Set<string>[] {
  const seen = new Set<string>();
  return layouts.map(({ bars }) => {
    const first = new Set<string>();
    for (const { event } of bars) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        first.add(event.id);
      }
    }
    return first;
  });
}
