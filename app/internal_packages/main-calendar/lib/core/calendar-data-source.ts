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
 * Whether an occurrence is in the selection, compared by id. Selection holds occurrences captured
 * at click time; a data refresh gives every occurrence a fresh object identity, so an identity
 * (`includes`) check silently drops the highlight on the next render.
 */
export function isEventSelected(
  selectedEvents: EventOccurrence[],
  event: EventOccurrence
): boolean {
  return selectedEvents.some((e) => e.id === event.id);
}

/**
 * Narrowing guard. The app tsconfig omits `strictNullChecks`, so `if (e.isAllDay)` does NOT
 * narrow the union — only `=== true`/`=== false` and a guard like this do. Use it to reach
 * `start`/`end`, which exist on timed occurrences only.
 */
export function isTimed(e: EventOccurrence): e is TimedOccurrence {
  return e.isAllDay === false;
}

/**
 * An occurrence's start as an instant — its real start if timed, its first day's start if
 * all-day. For sort keys, the focus scroll target, and day-snap drag references; never stored.
 */
export function occurrenceStartUnix(e: EventOccurrence): number {
  return isTimed(e) ? e.start : CalendarDateUtils.dayStartUnix(e.startDate);
}

/**
 * An occurrence's end as an exclusive instant — its real end if timed, the midnight after its
 * last covered day if all-day. For drag hit-testing and time formatting; never stored, and not
 * for layout positioning (that stays in date space).
 */
export function occurrenceEndUnix(e: EventOccurrence): number {
  return isTimed(e) ? e.end : CalendarDateUtils.nextDayStartUnix(e.endDate);
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

/** Fields common to all occurrences, all-day or timed. */
interface OccurrenceBase {
  /**
   * The days covered, inclusive both ends — a one-day event has `startDate === endDate`.
   *
   * The authoritative span for all-day events, and what the day-cell filters read per event
   * per cell via eventCoversDate.
   */
  startDate: CalendarDate;
  endDate: CalendarDate;
  id: string;
  accountId: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
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

/** An all-day occurrence: covered dates only, no instants. `isAllDay` discriminates the union. */
export interface AllDayOccurrence extends OccurrenceBase {
  isAllDay: true;
}

/** A timed occurrence: keeps its start/end instants. */
export interface TimedOccurrence extends OccurrenceBase {
  isAllDay: false;
  start: number; // unix
  end: number; // unix
}

export type EventOccurrence = AllDayOccurrence | TimedOccurrence;

// Minimal type for focusing/highlighting an event on the calendar
/**
 * What the calendar keeps to hold an event focused: its id and a scroll-to instant. `start`
 * is that instant — a timed event's real start, an all-day event's day start — so an all-day
 * occurrence (which has no start of its own) still scrolls the view somewhere sensible.
 */
export type FocusedEventInfo = { id: string; start: number };

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

  const base: OccurrenceBase = {
    id,
    accountId: event.accountId,
    calendarId: event.calendarId,
    title: item.summary || '',
    location: item.location || '',
    description: item.description || '',
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

  return isAllDay
    ? { ...base, isAllDay: true }
    : { ...base, isAllDay: false, start: startUnix, end: endUnix };
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
        // The budget is derived from the series' own frequency rather than fixed. It was
        // 100, which is not a limit on work but on how far back a series may begin: a
        // weekly meeting older than about two years never reached the present, so it
        // expanded to nothing and vanished from the calendar entirely.
        const icalExpander = new IcalExpander({
          ics: master.ics,
          maxIterations: ICSEventHelpers.expansionIterationBudget(
            master.ics,
            master.recurrenceStart,
            endUnix
          ),
        });
        const expanded = icalExpander.between(new Date(startUnix * 1000), new Date(endUnix * 1000));

        const masterIsRecurring = ICSEventHelpers.isRecurringEvent(master.ics);

        [...expanded.events, ...expanded.occurrences].forEach((e) => {
          const start = e.startDate.toJSDate().getTime() / 1000;
          const end = e.endDate.toJSDate().getTime() / 1000;
          // For occurrences, the actual event data is in e.item; for events, e is the event itself
          const item = 'item' in e ? e.item : e;
          expandedStartTimes.add(start);

          occurrences.push(
            occurrenceFromICS({
              // Key on the occurrence start, not the expansion index: idx depends on the query
              // range, so the same occurrence got a different id per view — breaking selection
              // (and React keys) when switching views. The start is stable across ranges.
              id: `${master.id}-e${Math.round(start)}`,
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
        // Fallback: show the master event as a single occurrence so it doesn't vanish.
        // Push it only when rs/re are finite — null/non-finite derive to NaN or 1970 dates
        // that render nowhere. Guard the push, not the iteration: a bad master must still
        // fall through to this UID's standalone exceptions below.
        if (Number.isFinite(master.recurrenceStart) && Number.isFinite(master.recurrenceEnd)) {
          const isAllDay = master.recurrenceEnd - master.recurrenceStart >= 82800;
          const { startDate, endDate } = coveredDates(
            master.recurrenceStart,
            master.recurrenceEnd,
            isAllDay
          );

          // Expansion failed, so there's no DATE flag to read — isAllDay fell back on
          // duration above. A recurring master's columns can hold one occurrence's span, so
          // a series can misread as all-day here.
          const errorBase: OccurrenceBase = {
            id: `${master.id}-e0`,
            accountId: master.accountId,
            calendarId: master.calendarId,
            title: '(Error expanding event)',
            location: '',
            description: '',
            startDate,
            endDate,
            isCancelled: false,
            isPending: false,
            isException: false,
            isRecurring: false,
            organizer: null,
            attendees: [],
          };
          occurrences.push(
            isAllDay
              ? { ...errorBase, isAllDay: true }
              : {
                  ...errorBase,
                  isAllDay: false,
                  start: master.recurrenceStart,
                  end: master.recurrenceEnd,
                }
          );
        }
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
