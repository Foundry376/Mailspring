import { ipcRenderer } from 'electron';
import { z } from 'zod';
import {
  Actions,
  Calendar,
  CalendarUtils,
  Contact,
  DatabaseStore,
  DateUtils,
  DestroyEventTask,
  Event,
  ICSEventHelpers,
  SyncbackEventTask,
  localized,
} from 'mailspring-exports';
import { isAccountAllowed } from '../../../mcp-server/lib/capabilities/grant';
import type { ViewGrant } from './grant';
import { requirePermission } from './grant';
import { ViewError } from './errors';
import { eventIdOf } from './events';

/**
 * Calendar reads beyond events, and the calendar writes Views may make. Every write goes
 * through the same tasks the calendar uses, so it syncs and shows in the undo toast. A write
 * that would notify other people (an invitation, an update or cancellation sent to guests, or
 * an RSVP to the organizer) needs the user's confirmation in a host dialog first: a View must
 * never email people on the user's behalf without them seeing it.
 */

export function serializeCalendar(calendar: Calendar, defaultIds: Set<string>) {
  return {
    id: calendar.id,
    accountId: calendar.accountId,
    name: calendar.name || '',
    color: calendar.color || null,
    readOnly: !!calendar.readOnly,
    isDefault: defaultIds.has(calendar.id),
  };
}

/** The first writable calendar of each account counts as its default for new events. */
export function listCalendars(grant: ViewGrant, calendars: Calendar[]) {
  const allowed = calendars.filter((c) => isAccountAllowed(grant.scope, c.accountId));
  const defaults = new Set<string>();
  const seen = new Set<string>();
  for (const c of allowed) {
    if (!c.readOnly && !seen.has(c.accountId)) {
      seen.add(c.accountId);
      defaults.add(c.id);
    }
  }
  return allowed.map((c) => serializeCalendar(c, defaults));
}

export const calendarsQuery = () => DatabaseStore.findAll<Calendar>(Calendar);

const isMe = (email: string) => !!email && new Contact({ email }).isMe();

/** The people other than the user a change to this ICS would notify. */
export function otherParticipants(ics: string): string[] {
  const { event } = CalendarUtils.parseICSString(ics);
  const emails = new Set<string>();
  for (const a of event.attendees || []) {
    const email = CalendarUtils.emailFromParticipantURI(String(a.getFirstValue() || ''));
    if (email && !isMe(email)) emails.add(email);
  }
  return [...emails];
}

/** Asks the user before a View's write notifies other people. Returns whether to go ahead. */
export function confirmNotify({
  viewId,
  action,
  title,
  people,
}: {
  viewId: string;
  action: string;
  title: string;
  people: string[];
}) {
  const shown = people.slice(0, 8).join(', ') + (people.length > 8 ? ', …' : '');
  const choice = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'question',
    buttons: [localized('Continue'), localized('Cancel')],
    defaultId: 1,
    cancelId: 1,
    message: localized('The "%@" View wants to %@ "%@".', viewId, action, title),
    detail: localized('This sends an email to: %@', shown),
  });
  return choice === 0;
}

function confirmOrThrow(opts: Parameters<typeof confirmNotify>[0]) {
  if (opts.people.length && !confirmNotify(opts)) {
    throw new ViewError('cancelled', 'The user cancelled this change.');
  }
}

async function writableCalendar(grant: ViewGrant, calendarId: string) {
  const calendar = await DatabaseStore.find<Calendar>(Calendar, calendarId);
  if (!calendar || !isAccountAllowed(grant.scope, calendar.accountId)) {
    throw new ViewError('not_found', `No calendar with id ${calendarId}.`);
  }
  if (calendar.readOnly) {
    throw new ViewError('read_only', `The calendar "${calendar.name}" is read-only.`);
  }
  return calendar;
}

/** Loads the stored Event behind an occurrence id (or an event id) for writing. */
async function writableEvent(grant: ViewGrant, id: string) {
  const event = await DatabaseStore.find<Event>(Event, eventIdOf(id));
  if (!event || !isAccountAllowed(grant.scope, event.accountId)) {
    throw new ViewError('not_found', `No event with id ${id}.`);
  }
  await writableCalendar(grant, event.calendarId);
  return event;
}

const snapshot = (event: Event) => ({
  ics: event.ics,
  recurrenceStart: event.recurrenceStart,
  recurrenceEnd: event.recurrenceEnd,
});

/** Re-derives the cached time columns from the ICS, as the calendar's own editors do. */
function syncTimes(event: Event) {
  const { event: parsed } = CalendarUtils.parseICSString(event.ics);
  event.recurrenceStart = parsed.startDate.toJSDate().getTime() / 1000;
  event.recurrenceEnd = parsed.endDate.toJSDate().getTime() / 1000;
}

function check<S extends z.ZodTypeAny>(schema: S, value: any): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ViewError('invalid', `${issue.path.join('.') || 'params'}: ${issue.message}`);
  }
  return result.data;
}

const Status = z.enum(['accepted', 'tentative', 'declined']);
const PARTSTAT = { accepted: 'ACCEPTED', tentative: 'TENTATIVE', declined: 'DECLINED' };

const DateInput = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a date' });
    return z.NEVER;
  }
  return d;
});

const Attendee = z.object({ email: z.string().email(), name: z.string().max(200).optional() });

export const EventInput = z.object({
  calendarId: z.string(),
  title: z.string().min(1).max(500),
  start: DateInput,
  end: DateInput,
  allDay: z.boolean().optional(),
  location: z.string().max(2000).optional(),
  description: z.string().max(20000).optional(),
  attendees: z.array(Attendee).max(100).optional(),
});

export const EventPatch = z.object({
  title: z.string().min(1).max(500).optional(),
  start: DateInput.optional(),
  end: DateInput.optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(2000).optional(),
  description: z.string().max(20000).optional(),
});

function checkTimes(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) {
    throw new ViewError('invalid', 'end must be after start');
  }
}

export async function rsvp(viewId: string, grant: ViewGrant, id: string, status: string) {
  requirePermission(grant, 'calendar.write');
  const answer = check(Status, status);
  const event = await writableEvent(grant, id);
  const { event: parsed } = CalendarUtils.parseICSString(event.ics);
  const attendees = (parsed.attendees || []).map((a) => ({
    email: CalendarUtils.emailFromParticipantURI(String(a.getFirstValue() || '')) || '',
    name: a.getFirstParameter('cn') || undefined,
    partstat: a.getFirstParameter('partstat') || 'NEEDS-ACTION',
  }));
  const mine = attendees.filter((a) => isMe(a.email));
  if (!mine.length) {
    throw new ViewError(
      'invalid',
      "You aren't an attendee of this event, so there's nothing to answer."
    );
  }
  const organizer = CalendarUtils.emailFromParticipantURI(String(parsed.organizer || ''));
  confirmOrThrow({
    viewId,
    action: localized('send your response (%@) to', answer),
    title: parsed.summary || localized('(no title)'),
    people: organizer && !isMe(organizer) ? [organizer] : [],
  });
  const undoData = snapshot(event);
  for (const a of mine) a.partstat = PARTSTAT[answer];
  // Replying applies to the whole series, the way calendar invitations are answered.
  event.ics = ICSEventHelpers.updateAttendees(event.ics, attendees);
  Actions.queueTask(
    SyncbackEventTask.forUpdating({ event, undoData, description: localized('Respond to event') })
  );
  return {};
}

export async function createEvent(viewId: string, grant: ViewGrant, params: any) {
  requirePermission(grant, 'calendar.write');
  const input = check(EventInput, params);
  checkTimes(input.start, input.end);
  const calendar = await writableCalendar(grant, input.calendarId);
  const others = (input.attendees || []).map((a) => a.email).filter((e) => !isMe(e));
  confirmOrThrow({
    viewId,
    action: localized('send an invitation for'),
    title: input.title,
    people: others,
  });

  const icsuid = ICSEventHelpers.generateUID();
  const ics = ICSEventHelpers.createICSString({
    uid: icsuid,
    summary: input.title,
    start: input.start,
    end: input.end,
    isAllDay: !!input.allDay,
    timezone: DateUtils.timeZone,
    description: input.description,
    location: input.location,
    attendees: input.attendees,
  });
  const event = new Event({
    calendarId: calendar.id,
    accountId: calendar.accountId,
    ics,
    icsuid,
    recurrenceStart: Math.floor(input.start.getTime() / 1000),
    recurrenceEnd: Math.floor(input.end.getTime() / 1000),
  });
  event.title = input.title;
  Actions.queueTask(
    SyncbackEventTask.forCreating({ event, calendarId: calendar.id, accountId: calendar.accountId })
  );
  return { eventId: event.id };
}

export async function updateEvent(viewId: string, grant: ViewGrant, id: string, params: any) {
  requirePermission(grant, 'calendar.write');
  const patch = check(EventPatch, params);
  const event = await writableEvent(grant, id);
  if (id !== event.id && ICSEventHelpers.isRecurringEvent(event.ics)) {
    // Editing one occurrence means writing an inline exception; Views edit whole series only.
    throw new ViewError(
      'unsupported',
      'Views can change a whole recurring series (pass its eventId) but not a single occurrence.'
    );
  }
  const { event: parsed } = CalendarUtils.parseICSString(event.ics);
  confirmOrThrow({
    viewId,
    action: localized('send an update for'),
    title: parsed.summary || localized('(no title)'),
    people: otherParticipants(event.ics),
  });

  const undoData = snapshot(event);
  let ics = event.ics;
  if (patch.title !== undefined)
    ics = ICSEventHelpers.updateEventProperty(ics, 'summary', patch.title);
  if (patch.location !== undefined)
    ics = ICSEventHelpers.updateEventProperty(ics, 'location', patch.location);
  if (patch.description !== undefined) {
    ics = ICSEventHelpers.updateEventProperty(ics, 'description', patch.description);
  }
  if (patch.start || patch.end || patch.allDay !== undefined) {
    const start = patch.start || parsed.startDate.toJSDate();
    const end = patch.end || parsed.endDate.toJSDate();
    checkTimes(start, end);
    ics = ICSEventHelpers.updateEventTimes(ics, {
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000),
      isAllDay: patch.allDay !== undefined ? patch.allDay : !!parsed.startDate.isDate,
    });
  }
  event.ics = ics;
  syncTimes(event);
  if (patch.title !== undefined) event.title = patch.title;
  Actions.queueTask(
    SyncbackEventTask.forUpdating({ event, undoData, description: localized('Edit event') })
  );
  return {};
}

export async function deleteEvent(viewId: string, grant: ViewGrant, id: string) {
  requirePermission(grant, 'calendar.write');
  const event = await writableEvent(grant, id);
  if (id !== event.id && ICSEventHelpers.isRecurringEvent(event.ics)) {
    throw new ViewError(
      'unsupported',
      'Views can delete a whole recurring series (pass its eventId) but not a single occurrence.'
    );
  }
  const { event: parsed } = CalendarUtils.parseICSString(event.ics);
  const title = parsed.summary || localized('(no title)');
  // Deleting isn't undoable, so the user always confirms, not only when guests are notified.
  const people = otherParticipants(event.ics);
  const choice = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'warning',
    buttons: [localized('Delete'), localized('Cancel')],
    defaultId: 1,
    cancelId: 1,
    message: localized('The "%@" View wants to delete "%@".', viewId, title),
    detail: people.length
      ? localized('This sends a cancellation to: %@', people.slice(0, 8).join(', '))
      : localized("This can't be undone."),
  });
  if (choice !== 0) throw new ViewError('cancelled', 'The user cancelled this change.');
  Actions.queueTask(DestroyEventTask.forRemoving({ events: [event] }));
  return {};
}

/** Opens the calendar window focused on an occurrence, or on a date when `id` is absent. */
export async function showInCalendar(grant: ViewGrant, params: { id?: string; date?: string }) {
  let start: number;
  let id: string | undefined;
  if (params.id) {
    const event = await DatabaseStore.find<Event>(Event, eventIdOf(params.id));
    if (!event || !isAccountAllowed(grant.scope, event.accountId)) {
      throw new ViewError('not_found', `No event with id ${params.id}.`);
    }
    const m = params.id.match(/-e(-?\d+)$/);
    start = m && Number(m[1]) > 0 ? Number(m[1]) : event.recurrenceStart;
    id = params.id;
  } else {
    const d = new Date(params.date);
    if (isNaN(d.getTime())) throw new ViewError('invalid', 'date must be a date');
    start = Math.floor(d.getTime() / 1000);
  }
  ipcRenderer.send('command', 'application:show-calendar', { id, start });
  return {};
}
