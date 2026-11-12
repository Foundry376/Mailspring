import React from 'react';
import { Contact, Utils, localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';
import { EventAttendee, EventOccurrence } from './calendar-data-source';
import { isOrganizer, myAttendeeEmail } from './calendar-rsvp';

// Office 365 (Graph) copies of a meeting carry no answer for its organizer, so they store
// NEEDS-ACTION, and the organizer's own copy leaves them off the guest list altogether. Google
// lets an organizer decline their own meeting, so a stored answer still shows. Drawn here only:
// the stored list is what an edit writes back.
function withOrganizerAttending(event: EventOccurrence): EventAttendee[] {
  const { organizer, attendees } = event;
  const listed = attendees.map((a) =>
    isOrganizer(event, a) && a.partstat === 'NEEDS-ACTION' ? { ...a, partstat: 'ACCEPTED' } : a
  );
  if (!organizer || !attendees.length || attendees.some((a) => isOrganizer(event, a))) {
    return listed;
  }
  return [{ ...organizer, partstat: 'ACCEPTED' }, ...listed];
}

export function attendeeStatusClass(attendee: EventAttendee): string {
  switch (attendee.partstat) {
    case 'ACCEPTED':
      return 'accepted';
    case 'DECLINED':
      return 'declined';
    case 'TENTATIVE':
      return 'tentative';
    default:
      return 'needs-action';
  }
}

export function guestCount(count: number): string {
  return count === 1 ? localized('1 guest') : localized('%@ guests', count);
}

/** "2 yes, 1 maybe, 3 awaiting": the answers in the Yes, No, Maybe buttons' order, zeros left out. */
export function guestSummary(attendees: EventAttendee[]): string {
  const tally = { accepted: 0, declined: 0, tentative: 0, 'needs-action': 0 };
  for (const a of attendees) tally[attendeeStatusClass(a)] += 1;
  return [
    tally.accepted && localized('%@ yes', tally.accepted),
    tally.declined && localized('%@ no', tally.declined),
    tally.tentative && localized('%@ maybe', tally.tentative),
    tally['needs-action'] && localized('%@ awaiting', tally['needs-action']),
  ]
    .filter(Boolean)
    .join(', ');
}

export const AttendeeStatusIcon = ({ attendee }: { attendee: EventAttendee }) => {
  if (attendee.partstat === 'ACCEPTED') return <SVGIcons.Check />;
  if (attendee.partstat === 'DECLINED') return <SVGIcons.Cross />;
  return <SVGIcons.QuestionMark />;
};

/** Contacts' names by lowercased email, for the guests an invitation leaves unnamed. */
export function contactNamesByEmail(contacts: Contact[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const { email, name } of contacts) {
    const key = email.toLowerCase();
    if (name && name !== email && !names.has(key)) names.set(key, name);
  }
  return names;
}

export function guestName(attendee: EventAttendee, contactNames: Map<string, string>): string {
  return attendee.name || contactNames.get(attendee.email.toLowerCase()) || attendee.email;
}

export function sortedAttendees(
  event: EventOccurrence,
  contactNames = new Map<string, string>()
): EventAttendee[] {
  const me = myAttendeeEmail(event);
  const pinOrder = (a: EventAttendee) => {
    if (isOrganizer(event, a)) return 0;
    if (me && Utils.emailIsEquivalent(a.email, me)) return 1;
    return 2;
  };
  const statusOrder = { ACCEPTED: 0, TENTATIVE: 1, 'NEEDS-ACTION': 1, DECLINED: 2 };
  return withOrganizerAttending(event).sort((a, b) => {
    if (pinOrder(a) !== pinOrder(b)) return pinOrder(a) - pinOrder(b);
    const aOrder = statusOrder[a.partstat] ?? 1;
    const bOrder = statusOrder[b.partstat] ?? 1;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aName = guestName(a, contactNames).toLowerCase();
    const bName = guestName(b, contactNames).toLowerCase();
    return aName.localeCompare(bName);
  });
}
