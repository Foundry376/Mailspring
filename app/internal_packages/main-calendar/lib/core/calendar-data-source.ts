import Rx from 'rx-lite';
import {
  Event,
  Matcher,
  DatabaseStore,
  AndCompositeMatcher,
  OrCompositeMatcher,
  Contact,
} from 'mailspring-exports';
import IcalExpander from 'ical-expander';

/** Participation status values from iCalendar spec */
export type ParticipationStatus = 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | string;

/**
 * Represents an attendee of a calendar event with basic contact info.
 * Compatible with Contact model for use with EventAttendeesInput.
 */
export interface EventAttendee {
  email: string;
  name?: string | null;
  partstat?: ParticipationStatus;
}

export interface EventOccurrence {
  start: number; // unix
  end: number; // unix
  id: string;
  accountId: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  isAllDay: boolean;
  isCancelled: boolean;
  /**
   * True if this event should display with "pending" styling (hatched pattern).
   * This includes:
   * - Events with STATUS=TENTATIVE
   * - Events where the current user is an attendee but hasn't accepted (NEEDS-ACTION or TENTATIVE)
   */
  isPending: boolean;
  isException: boolean;
  organizer: { email: string } | null;
  attendees: EventAttendee[];

  /** True if this is a synthetic drag preview event (not a real event) */
  isDragPreview?: boolean;
  /** If this is a preview, the ID of the original event being dragged */
  originalEventId?: string;
}

// Minimal type for focusing/highlighting an event on the calendar
export type FocusedEventInfo = Pick<EventOccurrence, 'start' | 'id'>;

/** Strip mailto: prefix from email addresses (common in iCalendar data) */
function normalizeEmail(email: string): string {
  return email.replace(/^mailto:/i, '');
}

export class CalendarDataSource {
  observable: Rx.Observable<{ events: EventOccurrence[] }>;

  buildObservable({ startUnix, endUnix, disabledCalendars }) {
    const end = Event.attributes.recurrenceEnd;
    const start = Event.attributes.recurrenceStart;

    // Query all events (masters and exceptions) that fall in the date range
    const dateMatcher = new Matcher.Or([
      new Matcher.And([start.lte(endUnix), end.gte(startUnix)]),
      new Matcher.And([start.lte(endUnix), start.gte(startUnix)]),
      new Matcher.And([end.gte(startUnix), end.lte(endUnix)]),
      new Matcher.And([end.gte(endUnix), start.lte(startUnix)]),
    ]);

    let matcher: AndCompositeMatcher | OrCompositeMatcher = dateMatcher;

    if (disabledCalendars && disabledCalendars.length) {
      matcher = new Matcher.And([matcher, Event.attributes.calendarId.notIn(disabledCalendars)]);
    }

    const query = DatabaseStore.findAll<Event>(Event).where(matcher);
    this.observable = Rx.Observable.fromQuery(query).flatMapLatest(results =>
      Rx.Observable.from([{ events: occurrencesForEvents(results, { startUnix, endUnix }) }])
    );
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}

export function occurrencesForEvents(
  results: Event[],
  { startUnix, endUnix }: { startUnix: number; endUnix: number }
) {
  const occurrences: EventOccurrence[] = [];

  // Group events by icsUID to handle master/exception relationships
  const eventsByUid = new Map<string, Event[]>();
  for (const event of results) {
    const uid = event.icsuid;
    if (!eventsByUid.has(uid)) {
      eventsByUid.set(uid, []);
    }
    eventsByUid.get(uid).push(event);
  }

  // Process each group of events with the same UID
  for (const [, events] of eventsByUid) {
    // Separate master from exceptions
    const master = events.find(e => !e.recurrenceId);
    const exceptions = events.filter(e => e.recurrenceId);

    // Track occurrence start times generated from master expansion
    // to avoid duplicates when exceptions are in the same ICS file
    const expandedStartTimes = new Set<number>();

    // Expand the master event's ICS (handles exceptions in same ICS file)
    if (master) {
      try {
        const icalExpander = new IcalExpander({ ics: master.ics, maxIterations: 100 });
        const expanded = icalExpander.between(new Date(startUnix * 1000), new Date(endUnix * 1000));

        [...expanded.events, ...expanded.occurrences].forEach((e, idx) => {
          const start = e.startDate.toJSDate().getTime() / 1000;
          const end = e.endDate.toJSDate().getTime() / 1000;
          // For occurrences, the actual event data is in e.item; for events, e is the event itself
          const item = 'item' in e ? e.item : e;
          const statusValue = item.component?.getFirstPropertyValue('status');
          const status = typeof statusValue === 'string' ? statusValue : '';

          expandedStartTimes.add(start);

          // Parse attendees with their participation status
          const attendees: EventAttendee[] = item.attendees.map(a => ({
            email: normalizeEmail(String(a.getFirstValue() || '')),
            name: a.getFirstParameter('cn') || '',
            partstat: (a.getFirstParameter('partstat') || 'NEEDS-ACTION') as ParticipationStatus,
          }));

          // Determine if event should show "pending" styling:
          // 1. Event status is TENTATIVE, or
          // 2. Current user is an attendee who hasn't accepted
          const isTentativeStatus = status.toUpperCase() === 'TENTATIVE';
          const myAttendee = attendees.find(a => a.email && new Contact({ email: a.email }).isMe());
          const myPartstat = myAttendee?.partstat?.toUpperCase();
          const isAwaitingMyResponse =
            myAttendee && myPartstat !== 'ACCEPTED' && myPartstat !== 'DECLINED';

          occurrences.push({
            start,
            end,
            id: `${master.id}-e${idx}`,
            accountId: master.accountId,
            calendarId: master.calendarId,
            title: item.summary || '',
            location: item.location || '',
            description: item.description || '',
            isAllDay: end - start >= 86400 - 1,
            isCancelled: status.toUpperCase() === 'CANCELLED',
            isPending: isTentativeStatus || isAwaitingMyResponse,
            isException: !!item.component?.getFirstPropertyValue('recurrence-id'),
            organizer: item.organizer ? { email: item.organizer } : null,
            attendees,
          });
        });
      } catch (err) {
        console.error(`Failed to expand ICS for event ${master.id}:`, err);
      }
    }

    // Handle standalone exceptions (separate ICS files scenario)
    // Only add if their start time wasn't already covered by master expansion
    for (const exception of exceptions) {
      const start = exception.recurrenceStart;
      if (expandedStartTimes.has(start)) {
        // Already covered by master expansion, skip to avoid duplicates
        continue;
      }

      // This exception came from a separate ICS file, expand it directly
      try {
        const icalExpander = new IcalExpander({ ics: exception.ics, maxIterations: 100 });
        const expanded = icalExpander.between(new Date(startUnix * 1000), new Date(endUnix * 1000));

        [...expanded.events, ...expanded.occurrences].forEach((e, idx) => {
          const occStart = e.startDate.toJSDate().getTime() / 1000;
          const occEnd = e.endDate.toJSDate().getTime() / 1000;
          const item = 'item' in e ? e.item : e;
          const statusValue = item.component?.getFirstPropertyValue('status');
          const status = typeof statusValue === 'string' ? statusValue : '';

          // Parse attendees with their participation status
          const attendees: EventAttendee[] = item.attendees.map(a => ({
            email: normalizeEmail(String(a.getFirstValue() || '')),
            name: a.getFirstParameter('cn') || '',
            partstat: (a.getFirstParameter('partstat') || 'NEEDS-ACTION') as ParticipationStatus,
          }));

          // Determine if event should show "pending" styling
          const isTentativeStatus = status.toUpperCase() === 'TENTATIVE';
          const myAttendee = attendees.find(a => a.email && new Contact({ email: a.email }).isMe());
          const myPartstat = myAttendee?.partstat?.toUpperCase();
          const isAwaitingMyResponse =
            myAttendee && myPartstat !== 'ACCEPTED' && myPartstat !== 'DECLINED';

          occurrences.push({
            start: occStart,
            end: occEnd,
            id: `${exception.id}-e${idx}`,
            accountId: exception.accountId,
            calendarId: exception.calendarId,
            title: item.summary || '',
            location: item.location || '',
            description: item.description || '',
            isAllDay: occEnd - occStart >= 86400 - 1,
            isCancelled: status.toUpperCase() === 'CANCELLED',
            isPending: isTentativeStatus || isAwaitingMyResponse,
            isException: true,
            organizer: item.organizer ? { email: item.organizer } : null,
            attendees,
          });
        });
      } catch (err) {
        console.error(`Failed to expand ICS for exception ${exception.id}:`, err);
      }
    }
  }

  return occurrences;
}
