import {
  AccountStore,
  Actions,
  AttachmentStore,
  Calendar,
  CalendarUtils,
  DatabaseStore,
  Event,
  EventRSVPTask,
  File,
  ICSEventHelpers,
  ICSParticipantStatus,
  Message,
  SyncbackEventTask,
  Utils,
  localized,
} from 'mailspring-exports';
import fs from 'fs';
import React from 'react';
import ICAL from 'ical.js';
import { ProposeTimePopover } from 'mailspring-component-kit';
import {
  EventOccurrence,
  occurrenceSlot,
  occurrenceStartUnix,
  occurrenceTimes,
  occurrenceEndUnix,
} from './calendar-data-source';
import { formatCalendarDate } from '../../../../src/calendar-date';
import { showRecurringEventDialog } from './recurring-event-dialog';

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

/** The answers a guest can give, in the order the menu and the event panel offer them. */
export function rsvpActions(): [ICSParticipantStatus, string][] {
  return [
    ['ACCEPTED', localized('Accept')],
    ['TENTATIVE', localized('Maybe')],
    ['DECLINED', localized('Decline')],
  ];
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
 * and an emailed REPLY to the organizer, which goes even when the copy cannot be written. On a
 * series it first asks, as Google Calendar and Delete do, whether the answer is for this
 * occurrence or for all of them; one occurrence is answered on its own VEVENT and in a REPLY
 * that names it (RFC 5546 section 3.2.3).
 */
export async function respondToCalendarEvent(
  occurrence: EventOccurrence,
  status: ICSParticipantStatus
): Promise<void> {
  const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
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

  let thisOccurrenceOnly = false;
  if (parsed.event.isRecurring() && !event.isRecurrenceException()) {
    const choice = await showRecurringEventDialog('answer', occurrence.title);
    if (choice === 'cancel') return;
    thisOccurrenceOnly = choice === 'this-occurrence';
  }
  await recordAndSendRSVP({
    event,
    myEmail: me.email,
    status,
    recurrenceId: thisOccurrenceOnly ? occurrenceRecurrenceId(occurrence) : null,
  });
}

/**
 * The RSVP itself, shared with Views: our PARTSTAT on our copy when that copy is writable, and
 * an emailed REPLY to the organizer either way. `recurrenceId` answers one occurrence; null
 * answers the whole stored object. Not undoable: the REPLY cannot be retracted.
 */
export async function recordAndSendRSVP({
  event,
  myEmail,
  status,
  recurrenceId,
}: {
  event: Event;
  myEmail: string;
  status: ICSParticipantStatus;
  recurrenceId: ICAL.Time | null;
}): Promise<void> {
  // What the answer is about: the one occurrence's VEVENT, or the whole stored object.
  const answered = recurrenceId
    ? ICSEventHelpers.occurrenceIcs(event.ics, recurrenceId)
    : event.ics;

  // A calendar the server named as somebody else's holds their event, not ours; the invitation
  // header refuses the same copy through resolveRSVPTarget.
  const calendar = await DatabaseStore.find<Calendar>(Calendar, event.calendarId);
  const writable =
    calendar && !calendar.readOnly && !CalendarUtils.isSomeoneElsesCalendar(calendar);
  if (writable) {
    const ics = recurrenceId
      ? ICSEventHelpers.updateOccurrenceAttendeeStatus(event.ics, answered, myEmail, status)
      : ICSEventHelpers.updateAttendeeStatus(event.ics, myEmail, status);
    if (ics) {
      const updated = event.clone();
      updated.ics = ics;
      const answer = {
        email: myEmail,
        status,
        occurrenceIcs: recurrenceId ? answered : undefined,
      };
      Actions.queueTask(SyncbackEventTask.forAnswering({ event: updated, answer }));
    }
  }

  const { event: parsed } = CalendarUtils.parseICSString(event.ics);
  const organizerEmail = CalendarUtils.emailFromParticipantURI(parsed.organizer);
  if (!organizerEmail) return; // nothing to tell - an event with no organizer isn't scheduled

  try {
    Actions.queueTask(
      EventRSVPTask.forReplying({
        accountId: event.accountId,
        icsOriginalData: answered,
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
  const originalStart = occurrenceSlot(occurrence);
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
  const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
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

export interface ProposedTime {
  from: { email: string; name: string };
  start: number;
  end: number;
  isAllDay: boolean;
  note: string;
}

/**
 * Guests' proposals of another time for this occurrence of a meeting we organize (RFC 5546
 * section 3.2.7), read from the COUNTERs they emailed us: the latest from each guest, while it
 * still counters the event as it stands. A counter for a series must name its occurrence, as
 * counterProposalProblem requires in the invitation header.
 */
export async function proposedTimesFor(occurrence: EventOccurrence): Promise<ProposedTime[]> {
  const { organizer } = occurrence;
  if (!occurrence.isMine || !organizer || occurrence.isCancelled) return [];
  const guests = occurrence.attendees.filter(
    (a) => a.email && !Utils.emailIsEquivalent(a.email, organizer.email)
  );
  if (guests.length === 0) return [];

  const row = await DatabaseStore.find<Event>(
    Event,
    CalendarUtils.parseOccurrenceId(occurrence.id).eventId
  );
  if (!row) return [];
  const slot = occurrenceSlot(occurrence);
  const ours = CalendarUtils.parseICSString(row.ics).root.getAllSubcomponents('vevent');
  const current =
    ours.find((v) => unixOf(v, 'recurrence-id') === slot) ||
    ours.find((v) => !v.hasProperty('recurrence-id'));
  const sequence = Number(current?.getFirstPropertyValue('sequence') || 0);
  const named = occurrence.isRecurring || occurrence.isException;

  const files = await DatabaseStore.findAll<File>(File).where([
    File.attributes.accountId.equal(occurrence.accountId),
    File.attributes.filename.like('.ics'),
  ]);
  if (files.length === 0) return [];
  const messages = await DatabaseStore.findAll<Message>(Message).where([
    Message.attributes.id.in(files.map((f) => f.messageId)),
  ]);

  const latest = new Map<string, { date: Date; proposal: ProposedTime }>();
  for (const message of messages) {
    const sender = message.from[0];
    const guest = sender && guests.find((g) => Utils.emailIsEquivalent(g.email, sender.email));
    if (!guest) continue;
    const seen = latest.get(guest.email.toLowerCase());
    if (seen && seen.date >= message.date) continue;

    for (const file of files.filter((f) => f.messageId === message.id)) {
      let vevent: ICAL.Component;
      try {
        const data = await fs.promises.readFile(
          await AttachmentStore.resolvePathForFile(file),
          'utf8'
        );
        const { root } = CalendarUtils.parseICSString(data);
        if (String(root.getFirstPropertyValue('method')).toUpperCase() !== 'COUNTER') continue;
        vevent = root.getFirstSubcomponent('vevent');
      } catch (e) {
        continue; // not downloaded, or not a calendar file
      }
      const recurrenceId = vevent && unixOf(vevent, 'recurrence-id');
      if (
        !vevent ||
        vevent.getFirstPropertyValue('uid') !== row.icsuid ||
        (named ? recurrenceId !== slot : recurrenceId !== undefined) ||
        Number(vevent.getFirstPropertyValue('sequence') || 0) < sequence
      ) {
        continue;
      }
      // ICAL.Event reads an end given as a DURATION too.
      const counter = new ICAL.Event(vevent);
      const proposal = {
        from: { email: guest.email, name: guest.name || sender.name || guest.email },
        start: counter.startDate.toJSDate().getTime() / 1000,
        end: counter.endDate.toJSDate().getTime() / 1000,
        isAllDay: counter.startDate.isDate,
        note: String(vevent.getFirstPropertyValue('comment') || ''),
      };
      latest.set(guest.email.toLowerCase(), { date: message.date, proposal });
    }
  }
  const { start, end } = occurrenceTimes(occurrence);
  return [...latest.values()]
    .map(({ proposal }) => proposal)
    .filter((p) => p.start !== start || p.end !== end);
}

function unixOf(vevent: ICAL.Component, property: string): number | undefined {
  const time = vevent.getFirstPropertyValue(property) as ICAL.Time;
  return time ? time.toJSDate().getTime() / 1000 : undefined;
}

/**
 * Opens the time picker for a counter-proposal, anchored on `anchor`, else on the event in the
 * grid, or on the window's centre when the grid has scrolled it out of view.
 */
export function openProposeNewTimePopover(occurrence: EventOccurrence, anchor?: HTMLElement): void {
  const eventEl = anchor || document.getElementById(occurrence.id);
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
