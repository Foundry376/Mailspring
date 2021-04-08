import { EventOccurrence } from './calendar-data-source';
import moment, { Moment } from 'moment';
import { Utils } from 'mailspring-exports';

// This pre-fetches from Utils to prevent constant disc access
const overlapsBounds = Utils.overlapsBounds;

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
export function overlapForEvents(events: EventOccurrence[]) {
  const eventsByTime: { [unix: number]: EventOccurrence[] } = {};

  for (const event of events) {
    if (!eventsByTime[event.start]) {
      eventsByTime[event.start] = [];
    }
    if (!eventsByTime[event.end]) {
      eventsByTime[event.end] = [];
    }
    eventsByTime[event.start].push(event);
    eventsByTime[event.end].push(event);
  }
  const sortedTimes = Object.keys(eventsByTime)
    .map(Number)
    .sort();

  const overlapById: OverlapByEventId = {};
  let ongoingEvents: EventOccurrence[] = [];

  for (const t of sortedTimes) {
    // Process all event start/ends during this time to keep our
    // "ongoingEvents" set correct.
    for (const e of eventsByTime[t]) {
      if (e.start === t) {
        overlapById[e.id] = { concurrentEvents: 1, order: null };
        ongoingEvents.push(e);
      }
      if (e.end === t) {
        ongoingEvents = ongoingEvents.filter(o => o.id !== e.id);
      }
    }

    // Write concurrency for all the events currently ongoing if they haven't
    // been assigned values already
    for (const e of ongoingEvents) {
      const numEvents = findMaxConcurrent(ongoingEvents, overlapById);
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
  return Math.max(1, ongoing.length, ...ongoing.map(e => overlapById[e.id].concurrentEvents));
}

export function findAvailableOrder(ongoing: EventOccurrence[], overlapById: OverlapByEventId) {
  const orders = ongoing.map(e => overlapById[e.id].order);
  let order = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!orders.includes(order)) {
      return order;
    }
    order += 1;
  }
}

export function maxConcurrentEvents(eventOverlap: OverlapByEventId) {
  return Math.max(-1, ...Object.values(eventOverlap).map(o => o.concurrentEvents));
}

export function eventsGroupedByDay(events: EventOccurrence[], days: Moment[]) {
  const map: { allDay: EventOccurrence[]; [dayUnix: string]: EventOccurrence[] } = { allDay: [] };

  const unixDays = days.map(d => d.unix());
  unixDays.forEach(day => {
    map[`${day}`] = [];
  });

  events.forEach(event => {
    if (event.isAllDay) {
      map.allDay.push(event);
    } else {
      for (const day of unixDays) {
        const bounds = {
          start: day,
          end: day + 24 * 60 * 60 - 1,
        };
        if (overlapsBounds(bounds, event)) {
          map[`${day}`].push(event);
        }
      }
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
