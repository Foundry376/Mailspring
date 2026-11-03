import React from 'react';
import { Utils } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';
import { EventAttendee } from './calendar-data-source';

// Office 365 (Graph) copies of a meeting carry no answer for its organizer, so they store
// NEEDS-ACTION. Google lets an organizer decline their own meeting, so a stored answer still shows.
export function withOrganizerAttending(
  attendees: EventAttendee[],
  organizer: { email: string } | null
): EventAttendee[] {
  if (!organizer) return attendees;
  return attendees.map((a) =>
    Utils.emailIsEquivalent(a.email, organizer.email) &&
    (!a.partstat || a.partstat === 'NEEDS-ACTION')
      ? { ...a, partstat: 'ACCEPTED' }
      : a
  );
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

export function sortAttendeesByStatus(attendees: EventAttendee[]): EventAttendee[] {
  const statusOrder = { ACCEPTED: 0, TENTATIVE: 1, 'NEEDS-ACTION': 1, DECLINED: 2 };
  return [...attendees].sort((a, b) => {
    const aOrder = statusOrder[a.partstat] ?? 1;
    const bOrder = statusOrder[b.partstat] ?? 1;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aName = (a.name || a.email).toLowerCase();
    const bName = (b.name || b.email).toLowerCase();
    return aName.localeCompare(bName);
  });
}
