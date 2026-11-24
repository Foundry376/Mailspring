import moment from 'moment';
import { CalendarDateUtils, CalendarUtils } from 'mailspring-exports';
import type { Thread, Message, Category, Contact, File, Calendar } from 'mailspring-exports';
import { EventOccurrence, isTimed } from '../../main-calendar/lib/core/calendar-data-source';
import { isThreadAllowed, isMessageAllowed, isAccountAllowed } from './mcp-access-control';

// Authorization + output-shaping, combined. Every thread/message/calendar/event that leaves
// this process for an MCP client passes through one of these functions,
// which return `null` when the underlying model fails the account/folder
// access-control check — that makes it structurally impossible to add a new
// output field (or a new call site) without it also passing through the
// authorization gate.

function serializeCategory(c: Category) {
  return { id: c.id, name: c.displayName || c.name };
}

function serializeContact(c: Pick<Contact, 'name' | 'email'>) {
  return { name: c.name, email: c.email };
}

function serializeFile(f: File) {
  return {
    id: f.id,
    filename: f.displayName(),
    contentType: f.contentType || null,
    size: f.size,
    isInline: !!f.contentId,
  };
}

export function serializeThreadSummary(
  thread: Thread,
  opts: { includeMessageCount?: boolean } = {}
): Record<string, any> | null {
  if (!isThreadAllowed(thread)) return null;
  const summary: Record<string, any> = {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    unread: thread.unread,
    starred: thread.starred,
    lastMessageReceivedTimestamp: thread.lastMessageReceivedTimestamp,
    participantCount: thread.participants?.length || 0,
    attachmentCount: thread.attachmentCount || 0,
    accountId: thread.accountId,
    categories: (thread.categories || []).map(serializeCategory),
  };
  if (opts.includeMessageCount) {
    summary.messageCount = (thread as any).messageCount || null;
  }
  return summary;
}

export function serializeMessageDetail(message: Message): Record<string, any> | null {
  if (!isMessageAllowed(message)) return null;
  return {
    id: message.id,
    headerMessageId: message.headerMessageId,
    threadId: message.threadId,
    from: message.from?.map(serializeContact),
    to: message.to?.map(serializeContact),
    cc: message.cc?.map(serializeContact),
    bcc: message.bcc?.map(serializeContact),
    subject: message.subject,
    date: message.date,
    body: message.body,
    snippet: message.snippet,
    files: (message.files || []).map(serializeFile),
    unread: message.unread,
    starred: message.starred,
    draft: message.draft,
    replyToHeaderMessageId: message.replyToHeaderMessageId,
    accountId: message.accountId,
    folders: message.categories().map(serializeCategory),
  };
}

export function serializeThreadDetail(
  thread: Thread,
  messages: Message[]
): Record<string, any> | null {
  if (!isThreadAllowed(thread)) return null;
  return {
    id: thread.id,
    subject: thread.subject,
    unread: thread.unread,
    starred: thread.starred,
    accountId: thread.accountId,
    lastMessageReceivedTimestamp: thread.lastMessageReceivedTimestamp,
    categories: (thread.categories || []).map(serializeCategory),
    // Folder-excluded messages within an otherwise-allowed thread are
    // dropped here rather than surfaced with a placeholder, matching the
    // "don't confirm existence of excluded data" posture used everywhere
    // else in this package.
    messages: messages
      .map(serializeMessageDetail)
      .filter((m): m is Record<string, any> => m !== null),
  };
}

export function serializeCalendar(calendar: Calendar): Record<string, any> | null {
  if (!isAccountAllowed(calendar.accountId)) return null;
  return {
    id: calendar.id,
    name: calendar.name || '',
    description: calendar.description || null,
    accountId: calendar.accountId,
    readOnly: !!calendar.readOnly,
  };
}

/**
 * Times read the way create_event takes them, so an agent can copy one back: a timed
 * occurrence as ISO 8601 with the user's UTC offset, an all-day one as dates with `end`
 * exclusive (the day after the last day covered, as iCalendar's DTEND).
 */
function occurrenceTimes(o: EventOccurrence) {
  if (isTimed(o)) {
    return { start: moment.unix(o.start).format(), end: moment.unix(o.end).format() };
  }
  return {
    start: CalendarDateUtils.formatCalendarDate(o.startDate),
    end: CalendarDateUtils.formatCalendarDate(CalendarDateUtils.addCalendarDays(o.endDate, 1)),
  };
}

export function serializeEventOccurrence(o: EventOccurrence): Record<string, any> | null {
  if (!isAccountAllowed(o.accountId)) return null;
  return {
    id: o.id,
    eventId: CalendarUtils.parseOccurrenceId(o.id).eventId,
    calendarId: o.calendarId,
    accountId: o.accountId,
    title: o.title,
    ...occurrenceTimes(o),
    isAllDay: o.isAllDay,
    location: o.location || null,
    description: o.description || null,
    status: o.isCancelled ? 'cancelled' : o.isPending ? 'tentative' : 'confirmed',
    isRecurring: o.isRecurring,
    isException: o.isException,
    organizer: o.organizer ? { name: o.organizer.name || '', email: o.organizer.email } : null,
    attendees: (o.attendees || []).map((a) => ({
      name: a.name || '',
      email: a.email,
      status: (a.partstat || 'NEEDS-ACTION').toLowerCase(),
    })),
  };
}
