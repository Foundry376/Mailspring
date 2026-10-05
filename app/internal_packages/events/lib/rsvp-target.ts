import {
  Calendar,
  CalendarUtils,
  Event,
  ICSEventHelpers,
  ICSParticipantStatus,
  Utils,
} from 'mailspring-exports';
import ICAL from 'ical.js';

/** Where an RSVP will be recorded, once we're certain which copy of the event is ours. */
export interface RSVPTarget {
  event: Event;
  calendar: Calendar;
}

/** Why no copy can be answered. The reply still goes to the organizer by email. */
export type RSVPTargetProblem =
  /** The event isn't on any calendar we sync. */
  | 'not-on-a-calendar'
  /** Every copy we found is on a read-only calendar. */
  | 'read-only'
  /** Every writable copy is on a calendar the server says belongs to somebody else. */
  | 'not-ours'
  /** Copies on more than one writable calendar, and none is identifiably ours. */
  | 'ambiguous';

export type RSVPTargetResolution =
  | { target: RSVPTarget; problem?: undefined }
  | { target: null; problem: RSVPTargetProblem };

/**
 * Picks the copy of an invitation this account may answer. One UID lands on our calendar, a
 * room's and a colleague's at once, so a target is named only when it is certainly ours.
 */
export function resolveRSVPTarget({
  events,
  calendars,
  addresses,
}: {
  events: Event[];
  calendars: Calendar[];
  addresses: string[];
}): RSVPTargetResolution {
  if (!events.length) {
    return { target: null, problem: 'not-on-a-calendar' };
  }

  const calendarsById = new Map(calendars.map((c) => [c.id, c]));
  const writable = events.filter((e) => {
    const calendar = calendarsById.get(e.calendarId);
    return calendar && !calendar.readOnly;
  });
  if (!writable.length) {
    return { target: null, problem: 'read-only' };
  }

  // The sole-candidate fallback below is for calendars of unknown ownership, never for one
  // the server named as someone else's.
  const calendarIds = new Set(
    writable
      .filter((e) => !CalendarUtils.isSomeoneElsesCalendar(calendarsById.get(e.calendarId)))
      .map((e) => e.calendarId)
  );
  if (!calendarIds.size) {
    return { target: null, problem: 'not-ours' };
  }
  const ownCalendarIds = [...calendarIds].filter((id) =>
    CalendarUtils.isOwnCalendar(calendarsById.get(id), addresses)
  );

  // Our own calendar, else the only candidate; never a guess between several.
  let calendarId: string;
  if (ownCalendarIds.length === 1) {
    calendarId = ownCalendarIds[0];
  } else if (ownCalendarIds.length === 0 && calendarIds.size === 1) {
    calendarId = [...calendarIds][0];
  } else {
    return { target: null, problem: 'ambiguous' };
  }

  // The master carries the attendee list for every occurrence; an exception answers only itself.
  const onCalendar = writable.filter((e) => e.calendarId === calendarId);
  const event = onCalendar.find((e) => !e.isRecurrenceException());
  if (!event) {
    return { target: null, problem: 'not-on-a-calendar' };
  }

  return { target: { event, calendar: calendarsById.get(calendarId) } };
}

/**
 * Whether an emailed invitation may be stored on one of our calendars. Stored with us as
 * ORGANIZER, a scheduling server (RFC 6638 section 3.2.1) would mail its ATTENDEE list from us.
 */
export function mayBeAddedToCalendar(organizerUri: string, addresses: string[]): boolean {
  const organizer = CalendarUtils.emailFromParticipantURI(organizerUri);
  if (!organizer) return false;
  return !addresses.some((a) => Utils.emailIsEquivalent(a, organizer));
}

/**
 * The calendars an unsynced invitation may be added to, and the one preselected. `current`
 * is the user's own pick from an earlier tick, kept while it is still a choice.
 */
export function resolveAddTo({
  rsvp,
  calendars,
  addresses,
  organizerUri,
  current,
}: {
  rsvp: RSVPTargetResolution;
  calendars: Calendar[];
  addresses: string[];
  organizerUri: string;
  current?: Calendar;
}): { choices: Calendar[]; addTo: Calendar } | null {
  if (rsvp.problem !== 'not-on-a-calendar' || !mayBeAddedToCalendar(organizerUri, addresses)) {
    return null;
  }
  const choices = calendars.filter((c) => !c.readOnly && !CalendarUtils.isSomeoneElsesCalendar(c));
  if (!choices.length) return null;
  const addTo =
    (current && choices.find((c) => c.id === current.id)) ||
    choices.find((c) => CalendarUtils.isOwnCalendar(c, addresses)) ||
    choices[0];
  return { choices, addTo };
}

export type RSVPWrite =
  | { kind: 'update'; event: Event }
  | { kind: 'create'; event: Event; calendar: Calendar };

/**
 * The calendar write that records an answer, beside the emailed REPLY: our PARTSTAT on our own
 * copy (RFC 6638 section 3.2.5), on the one occurrence an invitation names where it names one,
 * or the invitation itself when we are attending and have no copy.
 */
export function planRSVPWrite({
  rsvp,
  addTo,
  status,
  myEmail,
  inviteIcs,
  inviteEvent,
  accountId,
}: {
  rsvp: RSVPTargetResolution | undefined;
  addTo: Calendar | undefined;
  status: ICSParticipantStatus;
  myEmail: string;
  inviteIcs: string;
  inviteEvent: ICAL.Event;
  accountId: string;
}): RSVPWrite | null {
  if (!rsvp) return null;

  if (rsvp.target) {
    const { event: calEvent } = rsvp.target;
    // An invitation to one occurrence is answered on that occurrence alone. A Google organizer
    // takes the answer from this write and ignores the emailed REPLY (measured on #2924), so
    // writing every VEVENT would accept or decline the whole series.
    const ics = inviteEvent.component.getFirstPropertyValue('recurrence-id')
      ? ICSEventHelpers.updateOccurrenceAttendeeStatus(calEvent.ics, inviteIcs, myEmail, status)
      : ICSEventHelpers.updateAttendeeStatus(calEvent.ics, myEmail, status);
    if (!ics) return null;
    const event = calEvent.clone();
    event.ics = ics;
    return { kind: 'update', event };
  }

  // Declining leaves the event off our calendar, as Google does.
  const attending = status === 'ACCEPTED' || status === 'TENTATIVE';
  if (!attending || rsvp.problem !== 'not-on-a-calendar' || !addTo) return null;

  const answered = ICSEventHelpers.updateAttendeeStatus(inviteIcs, myEmail, status);
  if (!answered) return null;
  const event = new Event({
    calendarId: addTo.id,
    accountId,
    // A stored event must not carry the invitation's METHOD (RFC 4791 section 4.1).
    ics: ICSEventHelpers.stripITIPMethod(answered),
    icsuid: inviteEvent.uid,
    recurrenceStart: Math.round(inviteEvent.startDate.toJSDate().getTime() / 1000),
    recurrenceEnd: Math.round(inviteEvent.endDate.toJSDate().getTime() / 1000),
  });
  return { kind: 'create', event, calendar: addTo };
}
