import Rx from 'rx-lite';
import {
  Event,
  Matcher,
  DatabaseStore,
  CalendarUtils,
  CalendarDateUtils,
  CalendarDate,
  ICSEventHelpers,
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

type ICAL = typeof import('ical.js').default;
type ICALEvent = InstanceType<ICAL['Event']>;
type ICALTime = InstanceType<ICAL['Time']>;

/** An ICAL.Time's date, taken from its parts so no timezone is applied on the way. */
function dateFromICALTime(time: ICALTime): CalendarDate {
  return CalendarDateUtils.calendarDateFromParts(time.year, time.month, time.day);
}

/** Whether an occurrence covers the given day. */
export function eventCoversDate(event: EventOccurrence, date: CalendarDate): boolean {
  return event.startDate <= date && date <= event.endDate;
}

/**
 * The dates an event covers, inclusive, from its start and exclusive end instants.
 *
 * All-day ends land on a day boundary, so the last covered date is one date back; timed ends
 * are instants, so step inside the end before reading it — a 22:00-00:00 event covers one day,
 * not two. For events with parsed ICS, read the DATE parts instead; this is for callers that
 * only hold instants.
 */
export function coveredDates(
  startUnix: number,
  endUnix: number,
  isAllDay: boolean
): { startDate: CalendarDate; endDate: CalendarDate } {
  const startDate = CalendarDateUtils.calendarDateFromUnix(startUnix);
  const endDate = isAllDay
    ? CalendarDateUtils.addCalendarDays(CalendarDateUtils.calendarDateFromUnix(endUnix), -1)
    : CalendarDateUtils.calendarDateFromUnix(Math.max(endUnix - 1, startUnix));
  return { startDate, endDate: endDate > startDate ? endDate : startDate };
}

/**
 * The last day an all-day span covers, given an exclusive end date.
 *
 * Subtracted in date space rather than by a second. For ends parsed from ICS the two agree,
 * since ical.js hands back an exact midnight — but the expansion-failure path reads the
 * denormalized columns, which the sync engine writes an hour late for any date inside DST.
 * There `dateOf(end - 1s)` lands a day late and this doesn't. Floored at the start so a
 * malformed span can't end before it begins.
 */
function lastCoveredDate(exclusiveEnd: CalendarDate, startDate: CalendarDate): CalendarDate {
  return Math.max(CalendarDateUtils.addCalendarDays(exclusiveEnd, -1), startDate) as CalendarDate;
}

export interface EventOccurrence {
  start: number; // unix
  end: number; // unix
  /**
   * The days covered, inclusive both ends — a one-day event has `startDate === endDate`.
   *
   * Stored rather than derived per render because reading a date costs ~2µs and the day-cell
   * filters would call it per event per cell. Those filters still compare timestamps, so
   * nothing reads these yet.
   */
  startDate: CalendarDate;
  endDate: CalendarDate;
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
  /**
   * For exception occurrences only: the Unix timestamp (seconds) of the **original**
   * unmodified occurrence start, taken from the RECURRENCE-ID property. This differs
   * from `start` when the exception has been moved to a different time.
   * Used by the edit popover to correctly upsert the existing inline exception VEVENT.
   */
  recurrenceIdStart?: number;
  /** True if this event is part of a recurring series (has RRULE/RDATE) */
  isRecurring: boolean;
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
    this.observable = Rx.Observable.fromQuery(query).flatMapLatest((results) =>
      Rx.Observable.from([{ events: occurrencesForEvents(results, { startUnix, endUnix }) }])
    );
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}

/**
 * `startTime`/`endTime` are separate from `item` because an expanded occurrence's times differ
 * from the component its properties come from.
 */
function occurrenceFromICS(args: {
  id: string;
  event: Event;
  item: ICALEvent;
  startTime: ICALTime;
  endTime: ICALTime;
  isRecurring: boolean;
  /** Defaults to whether the component carries a RECURRENCE-ID */
  isException?: boolean;
}): EventOccurrence {
  const { id, event, item, startTime, endTime } = args;
  const startUnix = startTime.toJSDate().getTime() / 1000;
  const endUnix = endTime.toJSDate().getTime() / 1000;

  const statusValue = item.component?.getFirstPropertyValue('status');
  const status = (typeof statusValue === 'string' ? statusValue : '').toUpperCase();

  const attendees: EventAttendee[] = item.attendees.map((a) => ({
    email: normalizeEmail(String(a.getFirstValue() || '')),
    name: a.getFirstParameter('cn') || '',
    partstat: (a.getFirstParameter('partstat') || 'NEEDS-ACTION') as ParticipationStatus,
  }));

  // Pending styling also covers an event I'm invited to but haven't answered
  const myAttendee = attendees.find((a) => a.email && new Contact({ email: a.email }).isMe());
  const myPartstat = myAttendee?.partstat?.toUpperCase();
  const isAwaitingMyResponse = myAttendee && myPartstat !== 'ACCEPTED' && myPartstat !== 'DECLINED';

  const isAllDay = !!startTime.isDate;
  const startDate = isAllDay
    ? dateFromICALTime(startTime)
    : CalendarDateUtils.calendarDateFromUnix(startUnix);
  const endDate = isAllDay
    ? lastCoveredDate(dateFromICALTime(endTime), startDate)
    : // the end instant is exclusive, so step inside it before reading the date
      CalendarDateUtils.calendarDateFromUnix(Math.max(endUnix - 1, startUnix));

  const rid = item.component?.getFirstPropertyValue('recurrence-id');

  return {
    start: startUnix,
    end: endUnix,
    id,
    accountId: event.accountId,
    calendarId: event.calendarId,
    title: item.summary || '',
    location: item.location || '',
    description: item.description || '',
    isAllDay,
    startDate,
    endDate,
    isCancelled: status === 'CANCELLED',
    isPending: status === 'TENTATIVE' || !!isAwaitingMyResponse,
    isException: args.isException ?? !!rid,
    recurrenceIdStart: rid ? (rid as any).toJSDate().getTime() / 1000 : undefined,
    isRecurring: args.isRecurring,
    organizer: item.organizer ? { email: item.organizer } : null,
    attendees,
  };
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
    const master = events.find((e) => !e.recurrenceId);
    const exceptions = events.filter((e) => e.recurrenceId);

    // Track occurrence start times generated from master expansion
    // to avoid duplicates when exceptions are in the same ICS file
    const expandedStartTimes = new Set<number>();

    // Expand the master event's ICS (handles exceptions in same ICS file)
    if (master) {
      try {
        const icalExpander = new IcalExpander({ ics: master.ics, maxIterations: 100 });
        const expanded = icalExpander.between(new Date(startUnix * 1000), new Date(endUnix * 1000));

        const masterIsRecurring = ICSEventHelpers.isRecurringEvent(master.ics);

        [...expanded.events, ...expanded.occurrences].forEach((e, idx) => {
          const start = e.startDate.toJSDate().getTime() / 1000;
          const end = e.endDate.toJSDate().getTime() / 1000;
          // For occurrences, the actual event data is in e.item; for events, e is the event itself
          const item = 'item' in e ? e.item : e;
          expandedStartTimes.add(start);

          occurrences.push(
            occurrenceFromICS({
              id: `${master.id}-e${idx}`,
              event: master,
              item,
              startTime: e.startDate,
              endTime: e.endDate,
              isRecurring: masterIsRecurring,
            })
          );
        });
      } catch (err) {
        console.error(`Failed to expand ICS for event ${master.id}:`, err);
        // Fallback: show the master event as a single occurrence so it doesn't vanish
        // A row whose JSON lacks rs/re can't be placed on a calendar, and reading a date off a
        // non-finite value throws — which would abandon every other event in the batch.
        if (!Number.isFinite(master.recurrenceStart) || !Number.isFinite(master.recurrenceEnd)) {
          continue;
        }
        const isAllDay = master.recurrenceEnd - master.recurrenceStart >= 82800;
        const startDate = CalendarDateUtils.calendarDateFromUnix(master.recurrenceStart);
        const exclusiveEnd = CalendarDateUtils.calendarDateFromUnix(master.recurrenceEnd);
        const endDate = isAllDay ? lastCoveredDate(exclusiveEnd, startDate) : exclusiveEnd;

        occurrences.push({
          start: master.recurrenceStart,
          end: master.recurrenceEnd,
          id: `${master.id}-e0`,
          accountId: master.accountId,
          calendarId: master.calendarId,
          title: '(Error expanding event)',
          location: '',
          description: '',
          // Expansion failed, so there's no DATE flag to read — fall back on duration. A
          // recurring master's columns can hold one occurrence's span, so a series can
          // misread as all-day here.
          isAllDay,
          startDate,
          endDate,
          isCancelled: false,
          isPending: false,
          isException: false,
          isRecurring: false,
          organizer: null,
          attendees: [],
        });
      }
    }

    // Handle standalone exceptions (separate database records)
    // Only add if their start time wasn't already covered by master expansion
    for (const exception of exceptions) {
      const start = exception.recurrenceStart;
      if (expandedStartTimes.has(start)) {
        // Already covered by master expansion, skip to avoid duplicates
        continue;
      }

      // Exception events are single-instance (no RRULE), so parse directly
      // with ICAL.js instead of using ical-expander (which is for recurrence expansion)
      try {
        const { event: icsEvent } = CalendarUtils.parseICSString(exception.ics);
        const occStart = icsEvent.startDate.toJSDate().getTime() / 1000;
        const occEnd = icsEvent.endDate.toJSDate().getTime() / 1000;

        // Skip if outside the visible range
        if (occEnd < startUnix || occStart > endUnix) {
          continue;
        }

        occurrences.push(
          occurrenceFromICS({
            id: `${exception.id}-e0`,
            event: exception,
            item: icsEvent,
            startTime: icsEvent.startDate,
            endTime: icsEvent.endDate,
            isRecurring: true, // exceptions only exist for a series
            isException: true,
          })
        );
      } catch (err) {
        console.error(`Failed to parse ICS for exception ${exception.id}:`, err);
      }
    }
  }

  return occurrences;
}
