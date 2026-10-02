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
}

export function parseRange({ start, end, search }: any): EventRange {
  const startUnix = Math.floor(new Date(start).getTime() / 1000);
  const endUnix = Math.floor(new Date(end).getTime() / 1000);
  if (!startUnix || !endUnix || endUnix <= startUnix) {
    throw new ViewError('invalid', 'start and end must be dates, with end after start');
  }
  if (endUnix - startUnix > MAX_RANGE_DAYS * 86400) {
    throw new ViewError('limit', `a range can span at most ${MAX_RANGE_DAYS} days`);
  }
  return { startUnix, endUnix, search: typeof search === 'string' ? search : undefined };
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

function serializeOccurrence(o: EventOccurrence) {
  const start = o.isAllDay === false ? o.start : CalendarDateUtils.dayStartUnix(o.startDate);
  const end = o.isAllDay === false ? o.end : CalendarDateUtils.nextDayStartUnix(o.endDate);
  return {
    id: o.id,
    calendarId: o.calendarId,
    accountId: o.accountId,
    title: o.title,
    start: new Date(start * 1000).toISOString(),
    end: new Date(end * 1000).toISOString(),
    allDay: o.isAllDay === true,
    location: o.location || null,
    description: o.description || null,
    status: o.isCancelled ? 'CANCELLED' : o.isPending ? 'TENTATIVE' : 'CONFIRMED',
    organizer: o.organizer
      ? { name: '', email: o.organizer.email, isMe: isMe(o.organizer.email) }
      : null,
    attendees: (o.attendees || []).map((a) => ({
      name: a.name || '',
      email: a.email,
      isMe: isMe(a.email),
      status: ATTENDEE_STATUS[(a.partstat || '').toUpperCase()] || null,
    })),
    recurring: o.isRecurring,
  };
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
    .slice(0, MAX_EVENTS)
    .map(serializeOccurrence)
    .sort((a, b) => a.start.localeCompare(b.start));
}
