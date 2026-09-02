import { EventOccurrence, isTimed } from './calendar-data-source';
import moment, { Moment } from 'moment';
import { CalendarDateUtils } from 'mailspring-exports';

export interface OverlapByEventId {
  [id: string]: { concurrentEvents: number; order: null | number };
}

/*
 * Computes the overlap between a set of events in not O(n^2).
 *
 * Returns a hash keyed by event id whose value is an object:
 *   - concurrentEvents: number of concurrent events
 *   - order: the order in that series of concurrent events
 */
/**
 * Sweep-line bounds for an occurrence, as a half-open `[lo, hi)`. Each call is homogeneous —
 * the all-day bar passes only all-day events, day columns only timed — so all-day stacks in
 * date space (`addCalendarDays(endDate, 1)` exclusive) and timed in instants, and the two never mix in one call.
 */
function sweepBounds(e: EventOccurrence): { lo: number; hi: number } {
  return isTimed(e)
    ? { lo: e.start, hi: e.end }
    : { lo: e.startDate, hi: CalendarDateUtils.addCalendarDays(e.endDate, 1) };
}

export function overlapForEvents(events: EventOccurrence[]) {
  const eventsByTime: { [unix: number]: EventOccurrence[] } = {};

  for (const event of events) {
    const b = sweepBounds(event);
    if (!eventsByTime[b.lo]) {
      eventsByTime[b.lo] = [];
    }
    if (!eventsByTime[b.hi]) {
      eventsByTime[b.hi] = [];
    }
    eventsByTime[b.lo].push(event);
    eventsByTime[b.hi].push(event);
  }
  const sortedTimes = Object.keys(eventsByTime)
    .map(Number)
    .sort((a, b) => a - b);

  const overlapById: OverlapByEventId = {};
  const ongoingEvents: EventOccurrence[] = [];
  const ongoingIds = new Set<string>();

  for (const t of sortedTimes) {
    // Process all event start/ends during this time to keep our
    // "ongoingEvents" set correct.
    for (const e of eventsByTime[t]) {
      const b = sweepBounds(e);
      if (b.lo === t) {
        overlapById[e.id] = { concurrentEvents: 1, order: null };
        ongoingEvents.push(e);
        ongoingIds.add(e.id);
      }
      if (b.hi === t) {
        ongoingIds.delete(e.id);
      }
    }

    // Remove ended events from the array (batch removal instead of per-event .filter())
    if (ongoingEvents.length !== ongoingIds.size) {
      let write = 0;
      for (let read = 0; read < ongoingEvents.length; read++) {
        if (ongoingIds.has(ongoingEvents[read].id)) {
          ongoingEvents[write++] = ongoingEvents[read];
        }
      }
      ongoingEvents.length = write;
    }

    // Compute concurrency once for the current set of ongoing events
    const numEvents = findMaxConcurrent(ongoingEvents, overlapById);

    // Write concurrency for all the events currently ongoing if they haven't
    // been assigned values already
    for (const e of ongoingEvents) {
      overlapById[e.id].concurrentEvents = numEvents;
      if (overlapById[e.id].order === null) {
        // Don't re-assign the order.
        const order = findAvailableOrder(ongoingEvents, overlapById);
        overlapById[e.id].order = order;
      }
    }
  }
  return overlapById;
}

export function findMaxConcurrent(ongoing: EventOccurrence[], overlapById: OverlapByEventId) {
  let max = Math.max(1, ongoing.length);
  for (const e of ongoing) {
    const c = overlapById[e.id].concurrentEvents;
    if (c > max) max = c;
  }
  return max;
}

export function findAvailableOrder(ongoing: EventOccurrence[], overlapById: OverlapByEventId) {
  const usedOrders = new Set<number>();
  for (const e of ongoing) {
    const o = overlapById[e.id].order;
    if (o !== null) usedOrders.add(o);
  }
  let order = 1;
  while (usedOrders.has(order)) {
    order += 1;
  }
  return order;
}

export function maxConcurrentEvents(eventOverlap: OverlapByEventId) {
  let max = -1;
  for (const o of Object.values(eventOverlap)) {
    if (o.concurrentEvents > max) max = o.concurrentEvents;
  }
  return max;
}

/**
 * Each day's EXCLUSIVE end, taken from the next day's start so membership, layout and drag
 * hit-testing cannot drift from the rendered columns. A day is not always 86400 seconds:
 * 90000 on a fall-back day, 82800 on a spring-forward one. The last day has no successor and
 * resolves in the host zone, which is the zone the views build `days` in today.
 */
export function exclusiveDayEnds(days: Moment[]): number[] {
  const unixDays = days.map((d) => d.unix());
  return unixDays.map((day, i) =>
    i + 1 < unixDays.length ? unixDays[i + 1] : CalendarDateUtils.shiftedDayStartUnix(day, 1)
  );
}

export function eventsGroupedByDay(events: EventOccurrence[], days: Moment[]) {
  const map: { allDay: EventOccurrence[]; [dayUnix: string]: EventOccurrence[] } = { allDay: [] };

  const unixDays = days.map((d) => d.unix());
  unixDays.forEach((day) => {
    map[`${day}`] = [];
  });

  const exclusiveEnds = exclusiveDayEnds(days);

  events.forEach((event) => {
    if (isTimed(event)) {
      // Half-open, matching `coveredDates`' last-covered-instant convention, so a
      // 22:00-00:00 event covers only the day it starts on.
      const lastInstant = Math.max(event.end - 1, event.start);
      unixDays.forEach((day, i) => {
        if (event.start < exclusiveEnds[i] && lastInstant >= day) {
          map[`${day}`].push(event);
        }
      });
    } else {
      map.allDay.push(event);
    }
  });

  return map;
}

export const DAY_DUR = 24 * 60 * 60;
export const TICK_STEP = 30 * 60;
export const TICKS_PER_DAY = DAY_DUR / TICK_STEP;

export function* tickGenerator(type: 'major' | 'minor', tickHeight: number) {
  const step = TICK_STEP * 2;
  const skip = TICK_STEP * 2;
  const stepStart = type === 'minor' ? TICK_STEP : 0;

  // We only use a moment object so we can properly localize the "time"
  // part. The day is irrelevant. We just need to make sure we're
  // picking a non-DST boundary day.
  const time = moment([2015, 1, 1]).add(stepStart, 'seconds');

  for (let tsec = stepStart; tsec <= DAY_DUR; tsec += step) {
    const y = (tsec / TICK_STEP) * tickHeight;
    yield { time, y };
    time.add(skip, 'seconds');
  }
}
