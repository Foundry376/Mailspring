import { CalendarDateUtils, Contact, DatabaseStore, Event, Matcher } from 'mailspring-exports';
import { isAccountAllowed } from '../../../mcp-server/lib/capabilities/grant';
import {
  occurrencesForEvents,
  EventOccurrence,
} from '../../../main-calendar/lib/core/calendar-data-source';
import type { ViewGrant } from './grant';
import { ViewError } from './errors';

const MAX_RANGE_DAYS = 400;
const MAX_EVENTS = 2000;

export interface EventRange {
  startUnix: number;
  endUnix: number;
  search?: string;
  calendarIds?: string[];
  /** Only occurrences with this attendee (or organizer) email. */
  attendee?: string;
  /** Occurrences the user declined are left out unless this is set. */
  includeDeclined?: boolean;
}

export function parseRange({
  start,
  end,
  search,
  calendarIds,
  attendee,
  includeDeclined,
}: any): EventRange {
  const startUnix = Math.floor(new Date(start).getTime() / 1000);
  const endUnix = Math.floor(new Date(end).getTime() / 1000);
  if (!startUnix || !endUnix || endUnix <= startUnix) {
    throw new ViewError('invalid', 'start and end must be dates, with end after start');
  }
  if (endUnix - startUnix > MAX_RANGE_DAYS * 86400) {
    throw new ViewError('limit', `a range can span at most ${MAX_RANGE_DAYS} days`);
  }
  if (
    calendarIds !== undefined &&
    !(Array.isArray(calendarIds) && calendarIds.every((c) => typeof c === 'string'))
  ) {
    throw new ViewError('invalid', 'calendarIds must be an array of calendar ids');
  }
  return {
    startUnix,
    endUnix,
    search: typeof search === 'string' ? search : undefined,
    calendarIds: calendarIds && calendarIds.length ? calendarIds : undefined,
    attendee: typeof attendee === 'string' && attendee ? attendee.toLowerCase() : undefined,
    includeDeclined: includeDeclined === true,
  };
}

// The same overlap query the calendar uses (main-calendar's CalendarDataSource), so
// recurring masters whose series overlaps the range are expanded into occurrences.
export function eventQuery({ startUnix, endUnix }: EventRange) {
  const end = Event.attributes.recurrenceEnd;
  const start = Event.attributes.recurrenceStart;
  return DatabaseStore.findAll<Event>(Event).where(
    new Matcher.Or([
      new Matcher.And([start.lte(endUnix), end.gte(startUnix)]),
      new Matcher.And([end.gte(endUnix), start.lte(startUnix)]),
    ])
  );
}

const ATTENDEE_STATUS = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  TENTATIVE: 'tentative',
  'NEEDS-ACTION': 'needs-action',
};

const isMe = (email: string) => new Contact({ email }).isMe();

// Video-call links people paste into a location or description. The first match wins.
const CONFERENCE_URL =
  /https:\/\/(?:[\w-]+\.)*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|gotomeeting\.com|whereby\.com|meet\.jit\.si|chime\.aws|bluejeans\.com|around\.co)\/[^\s<>"')\]]*/i;

export function conferenceUrl(location: string, description: string): string | null {
  const match = `${location || ''} ${description || ''}`.match(CONFERENCE_URL);
  return match ? match[0] : null;
}

/** An occurrence id is `<event id>-e<start>`; mutations act on the stored Event. */
export function eventIdOf(occurrenceId: string) {
  return occurrenceId.replace(/-e-?\d+$/, '');
}

function serializeOccurrence(o: EventOccurrence) {
  const start = o.isAllDay === false ? o.start : CalendarDateUtils.dayStartUnix(o.startDate);
  const end = o.isAllDay === false ? o.end : CalendarDateUtils.nextDayStartUnix(o.endDate);
  const attendees = (o.attendees || []).map((a) => ({
    name: a.name || '',
    email: a.email,
    isMe: isMe(a.email),
    status: ATTENDEE_STATUS[(a.partstat || '').toUpperCase()] || null,
  }));
  const me = attendees.find((a) => a.isMe);
  // ORGANIZER arrives as the raw property value, usually a mailto: URI.
  const organizerEmail = o.organizer ? o.organizer.email.replace(/^mailto:/i, '') || null : null;
  const organizerAttendee = organizerEmail
    ? attendees.find((a) => a.email.toLowerCase() === organizerEmail.toLowerCase())
    : null;
  return {
    id: o.id,
    eventId: eventIdOf(o.id),
    calendarId: o.calendarId,
    accountId: o.accountId,
    title: o.title,
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString(),
    allDay: o.isAllDay === true,
    location: o.location || null,
    description: o.description || null,
    status: o.isCancelled ? 'CANCELLED' : o.isPending ? 'TENTATIVE' : 'CONFIRMED',
    organizer: organizerEmail
      ? {
          name: organizerAttendee ? organizerAttendee.name : '',
          email: organizerEmail,
          isMe: isMe(organizerEmail),
        }
      : null,
    attendees,
    // The user's own response; null when they aren't an attendee (e.g. their own event).
    myStatus: me ? me.status : null,
    conferenceUrl: conferenceUrl(o.location, o.description),
    recurring: o.isRecurring,
    exception: o.isException,
  };
}

type SerializedOccurrence = ReturnType<typeof serializeOccurrence>;

function matchesRange(e: SerializedOccurrence, range: EventRange) {
  if (range.calendarIds && !range.calendarIds.includes(e.calendarId)) return false;
  if (!range.includeDeclined && e.myStatus === 'declined') return false;
  if (range.attendee) {
    const emails = e.attendees.map((a) => a.email.toLowerCase());
    if (e.organizer) emails.push(e.organizer.email.toLowerCase());
    if (!emails.includes(range.attendee)) return false;
  }
  return true;
}

export function serializeEvents(grant: ViewGrant, events: Event[], range: EventRange) {
  const needle = range.search && range.search.toLowerCase();
  return occurrencesForEvents(
    events.filter((e) => isAccountAllowed(grant.scope, e.accountId)),
    range
  )
    .filter(
      (o) =>
        !needle ||
        [o.title, o.location, o.description].some((s) => (s || '').toLowerCase().includes(needle))
    )
    .map(serializeOccurrence)
    .filter((e) => matchesRange(e, range))
    .slice(0, MAX_EVENTS)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface BusyInterval {
  start: string;
  end: string;
}

/**
 * Busy time in the range: timed occurrences that aren't cancelled or declined, clipped to the
 * range and merged where they touch or overlap. All-day events are left out, the way calendar
 * apps treat them as free unless marked busy.
 */
export function freeBusy(events: SerializedOccurrence[], range: EventRange) {
  const intervals = events
    .filter((e) => !e.allDay && e.status !== 'CANCELLED' && e.myStatus !== 'declined')
    .map((e) => [
      Math.max(Date.parse(e.start) / 1000, range.startUnix),
      Math.min(Date.parse(e.end) / 1000, range.endUnix),
    ])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const [s, e] of intervals) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const busy: BusyInterval[] = merged.map(([s, e]) => ({
    start: new Date(s * 1000).toISOString(),
    end: new Date(e * 1000).toISOString(),
  }));
  const busySeconds = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  return { busy, busyMinutes: Math.round(busySeconds / 60) };
}
