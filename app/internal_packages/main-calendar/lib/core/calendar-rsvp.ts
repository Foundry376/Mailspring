import {
  AccountStore,
  Actions,
  Calendar,
  CalendarUtils,
  DatabaseStore,
  Event,
  EventRSVPTask,
  ICSEventHelpers,
  ICSParticipantStatus,
  SyncbackEventTask,
  localized,
} from 'mailspring-exports';
import React from 'react';
import ICAL from 'ical.js';
import { ProposeTimePopover } from 'mailspring-component-kit';
import { EventOccurrence, occurrenceStartUnix, occurrenceEndUnix } from './calendar-data-source';
import { parseEventIdFromOccurrence } from './calendar-drag-utils';
import { formatCalendarDate } from '../../../../src/calendar-date';

/** Whether this occurrence is an invitation we can answer, rather than one we sent. */
export function canRespondToEvent(occurrence: EventOccurrence): boolean {
  const me = myAttendeeEmail(occurrence);
  if (!me) return false;

  // The organizer doesn't RSVP to their own meeting; they change it.
  const organizer =
    occurrence.organizer && CalendarUtils.emailFromParticipantURI(occurrence.organizer.email);
  return !organizer || organizer.toLowerCase() !== me;
}

/**
 * Our address on this event's guest list, lowercased. Scoped to the event's own account: another
 * connected account may be a guest too, and selfParticipant would not find them.
 */
export function myAttendeeEmail(occurrence: EventOccurrence): string | null {
  for (const attendee of occurrence.attendees) {
    if (!attendee.email) continue;
    const account = AccountStore.accountForEmail(attendee.email);
    if (account && account.id === occurrence.accountId) {
      return attendee.email.toLowerCase();
    }
  }
  return null;
}

/** Our current participation status for this occurrence, if we're on the guest list. */
export function myParticipationStatus(occurrence: EventOccurrence): string | null {
  const me = myAttendeeEmail(occurrence);
  if (!me) return null;
  const mine = occurrence.attendees.find((a) => a.email && a.email.toLowerCase() === me);
  return mine ? (mine.partstat || 'NEEDS-ACTION').toUpperCase() : null;
}

/**
 * Answers an invitation from the calendar: our PARTSTAT on our copy (RFC 6638 section 3.2.5)
 * and an emailed REPLY to the organizer, which goes even when the copy cannot be written.
 */
export async function respondToCalendarEvent(
  occurrence: EventOccurrence,
  status: ICSParticipantStatus
): Promise<void> {
  const eventId = parseEventIdFromOccurrence(occurrence.id);
  const event = await DatabaseStore.find<Event>(Event, eventId);
  if (!event) {
    console.warn(`Calendar RSVP: could not find event ${eventId}`);
    return;
  }

  let parsed: ReturnType<typeof CalendarUtils.parseICSString>;
  try {
    parsed = CalendarUtils.parseICSString(event.ics);
  } catch (e) {
    AppEnv.showErrorDialog(localized("Sorry, this event's data could not be read."));
    return;
  }

  const me = CalendarUtils.selfParticipant(parsed.event, event.accountId);
  if (!me) {
    AppEnv.showErrorDialog(
      localized("You're not on this event's guest list, so there's no RSVP to give.")
    );
    return;
  }

  // A calendar the server named as somebody else's holds their event, not ours; the invitation
  // header refuses the same copy through resolveRSVPTarget.
  const calendar = await DatabaseStore.find<Calendar>(Calendar, event.calendarId);
  const writable =
    calendar && !calendar.readOnly && !CalendarUtils.isSomeoneElsesCalendar(calendar);
  if (writable) {
    const ics = ICSEventHelpers.updateAttendeeStatus(event.ics, me.email, status);
    if (ics) {
      const updated = event.clone();
      updated.ics = ics;
      // Not undoable: the REPLY emailed below cannot be retracted.
      Actions.queueTask(SyncbackEventTask.forUpdating({ event: updated }));
    }
  }

  const organizerEmail = CalendarUtils.emailFromParticipantURI(parsed.event.organizer);
  if (!organizerEmail) return; // nothing to tell - an event with no organizer isn't scheduled

  try {
    Actions.queueTask(
      EventRSVPTask.forReplying({
        accountId: event.accountId,
        icsOriginalData: event.ics,
        icsRSVPStatus: status,
        to: organizerEmail,
      })
    );
  } catch (e) {
    console.warn(`Calendar RSVP: could not build the reply: ${e.message}`);
  }
}

/**
 * What RECURRENCE-ID names this occurrence: its original start, as a DATE for an all-day
 * series. Null for an event that does not repeat.
 */
export function occurrenceRecurrenceId(occurrence: EventOccurrence): ICAL.Time | null {
  if (!occurrence.isRecurring && !occurrence.isException) return null;
  const originalStart = occurrence.recurrenceIdStart ?? occurrenceStartUnix(occurrence);
  return occurrence.isAllDay
    ? ICAL.Time.fromDateString(formatCalendarDate(occurrence.startDate))
    : ICAL.Time.fromJSDate(new Date(originalStart * 1000), true);
}

/**
 * Counter-proposes another time for a meeting we were invited to (RFC 5546 section 3.2.7),
 * from the calendar where the accepted invitation lives. Nothing is written locally: the event
 * changes only when the organizer accepts and sends the update back.
 */
export async function proposeNewTimeForCalendarEvent(
  occurrence: EventOccurrence,
  proposal: { start: Date; end: Date; comment: string }
): Promise<void> {
  const eventId = parseEventIdFromOccurrence(occurrence.id);
  const event = await DatabaseStore.find<Event>(Event, eventId);
  if (!event) {
    console.warn(`Calendar counter-proposal: could not find event ${eventId}`);
    return;
  }

  let parsed: ReturnType<typeof CalendarUtils.parseICSString>;
  try {
    parsed = CalendarUtils.parseICSString(event.ics);
  } catch (e) {
    AppEnv.showErrorDialog(localized("Sorry, this event's data could not be read."));
    return;
  }

  const me = CalendarUtils.selfParticipant(parsed.event, event.accountId);
  if (!me) {
    AppEnv.showErrorDialog(
      localized("You're not on this event's guest list, so there's no new time to propose.")
    );
    return;
  }

  const organizerEmail = CalendarUtils.emailFromParticipantURI(parsed.event.organizer);
  if (!organizerEmail) {
    AppEnv.showErrorDialog(
      localized("This event has no organizer, so there's nobody to propose a new time to.")
    );
    return;
  }

  let ics: string;
  try {
    ics = ICSEventHelpers.createCounterProposal(event.ics, {
      email: me.email,
      start: proposal.start,
      end: proposal.end,
      comment: proposal.comment,
      recurrenceId: occurrenceRecurrenceId(occurrence),
    });
  } catch (e) {
    console.warn(`Calendar counter-proposal: could not build it: ${e.message}`);
    ics = null;
  }
  if (!ics) {
    AppEnv.showErrorDialog(
      localized("Sorry, we couldn't build a counter-proposal for this event.")
    );
    return;
  }

  Actions.queueTask(
    EventRSVPTask.forProposingNewTime({
      accountId: event.accountId,
      to: organizerEmail,
      ics,
      summary: parsed.event.summary,
      comment: proposal.comment,
    })
  );
}

/**
 * Opens the time picker for a counter-proposal, anchored on the event in the grid, or on the
 * window's centre when the grid has scrolled it out of view.
 */
export function openProposeNewTimePopover(occurrence: EventOccurrence): void {
  const eventEl = document.getElementById(occurrence.id);
  Actions.openPopover(
    React.createElement(ProposeTimePopover, {
      start: occurrenceStartUnix(occurrence),
      end: occurrenceEndUnix(occurrence),
      isAllDay: occurrence.isAllDay,
      onPropose: (proposal: { start: Date; end: Date; comment: string }) =>
        proposeNewTimeForCalendarEvent(occurrence, proposal),
    }),
    {
      originRect: eventEl
        ? eventEl.getBoundingClientRect()
        : new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 2, 2),
      direction: 'right',
      fallbackDirection: 'left',
    }
  );
}

/**
 * What a guest gets for trying to move a meeting: only the organizer reschedules one (RFC 5546
 * section 2.1.4), so the dialog offers the counter-proposal that stands in for the move.
 */
export function offerCounterInsteadOfMove(occurrence: EventOccurrence): void {
  const response = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'info',
    buttons: [localized('Propose a new time'), localized('Cancel')],
    defaultId: 0,
    cancelId: 1,
    title: localized("This meeting can't be rescheduled"),
    message: localized('Only the organizer can move "%@".', occurrence.title),
    detail: localized('You can propose a new time to the organizer instead.'),
  });
  if (response === 0) {
    openProposeNewTimePopover(occurrence);
  }
}
