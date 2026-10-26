import React from 'react';
import { EventAttendee } from './calendar-data-source';

/** The class an attendee's answer is styled by: accepted, declined, tentative or needs-action. */
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

const questionMarkIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path
      d="M3.5 3.5a1.5 1.5 0 0 1 2.6 1c0 1-1.1 1-1.1 2"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <circle cx="5" cy="8.5" r="0.75" fill="currentColor" />
  </svg>
);

/** A tick for accepted, a cross for declined, a question mark for tentative or unanswered. */
export const AttendeeStatusIcon = ({ attendee }: { attendee: EventAttendee }) => {
  if (attendee.partstat === 'ACCEPTED') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M1.5 5.5L4 8l4.5-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (attendee.partstat === 'DECLINED') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return questionMarkIcon;
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
