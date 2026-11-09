import React from 'react';
import { Utils } from 'mailspring-exports';
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

export const AttendeeStatusIcon = ({ attendee }: { attendee: EventAttendee }) => {
  if (attendee.partstat === 'ACCEPTED') return <SVGIcons.Check />;
  if (attendee.partstat === 'DECLINED') return <SVGIcons.Cross />;
  return <SVGIcons.QuestionMark />;
};

export function sortedAttendees(event: EventOccurrence): EventAttendee[] {
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
    const aName = (a.name || a.email).toLowerCase();
    const bName = (b.name || b.email).toLowerCase();
    return aName.localeCompare(bName);
  });
}
