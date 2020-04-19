import { EventOccurrence } from './calendar-data-source';

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
