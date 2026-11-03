import { CalendarUtils, Utils, localized } from 'mailspring-exports';
import { ChangeScope, EventChange, EventPropertyEdit } from './recurring-event-actions';
import {
  EventAttendee,
  EventOccurrence,
  occurrenceAt,
  occurrenceSlot,
} from './calendar-data-source';

type Times = NonNullable<EventChange['times']>;

/**
 * Edits made in the panel to one event, sent as one update; or, on an invitation, the new time
 * a guest proposes to the organizer, with their comment, or their own Show as for their copy.
 */
export interface UnsentChange extends EventChange {
  eventId: string;
  slot?: number;
  guestCopy?: boolean;
  proposal?: { comment: string };
}

export function isUnsentChangeFor(change: UnsentChange | null, occurrence: EventOccurrence) {
  return (
    !!change &&
    change.eventId === CalendarUtils.parseOccurrenceId(occurrence.id).eventId &&
    (change.slot === undefined || change.slot === occurrenceSlot(occurrence))
  );
}

/** A guest's own Show as, held for This occurrence only / All occurrences, goes before any proposal. */
export function showAsWaitsForScope(change: UnsentChange | null) {
  return !!change?.guestCopy && change.edits.length > 0;
}

// Only the organizer changes a meeting (RFC 5546 section 2.1); a guest's change proposes one.
export function emptyChange(occurrence: EventOccurrence): UnsentChange {
  const { eventId } = CalendarUtils.parseOccurrenceId(occurrence.id);
  return {
    eventId,
    ...(occurrence.isRecurring && { slot: occurrenceSlot(occurrence) }),
    edits: [],
    ...(!occurrence.isMine && { guestCopy: true }),
  };
}

/** The occurrences a series' change may go to: one occurrence can't carry a repeat rule of its own. */
export function scopesFor(change: UnsentChange): ChangeScope[] {
  return unsentEdit(change, 'rrule') ? ['all-occurrences'] : ['this-occurrence', 'all-occurrences'];
}

export function scopeLabel(scope: ChangeScope) {
  return scope === 'this-occurrence'
    ? localized('This occurrence only')
    : localized('All occurrences');
}

function unlessEmpty(change: UnsentChange): UnsentChange | null {
  return change.times || change.edits.length || change.attendees ? change : null;
}

/**
 * The change with `edit` in place of any earlier edit to its property, or without it when it
 * puts back the stored value.
 */
export function withEdit(
  change: UnsentChange | null,
  occurrence: EventOccurrence,
  edit: EventPropertyEdit,
  stored: string | null
): UnsentChange | null {
  const base = change ?? emptyChange(occurrence);
  const edits = base.edits.filter((e) => e.property !== edit.property);
  if (edit.value !== stored) edits.push(edit);
  return unlessEmpty({ ...base, edits });
}

export function withTimes(
  change: UnsentChange | null,
  occurrence: EventOccurrence,
  times: Times,
  stored: Times
): UnsentChange | null {
  const base = change ?? emptyChange(occurrence);
  const same =
    times.start === stored.start && times.end === stored.end && times.isAllDay === stored.isAllDay;
  return unlessEmpty({
    ...base,
    ...(base.guestCopy && { proposal: base.proposal ?? { comment: '' } }),
    times: same ? undefined : times,
  });
}

const without = (attendees: EventAttendee[], others: EventAttendee[]) =>
  attendees.filter((a) => !others.some((o) => Utils.emailIsEquivalent(a.email, o.email)));

/** The change with the guests `attendees` adds to and removes from `stored`. */
export function withAttendees(
  change: UnsentChange | null,
  occurrence: EventOccurrence,
  attendees: EventAttendee[],
  stored: EventAttendee[]
): UnsentChange | null {
  const base = change ?? emptyChange(occurrence);
  const added = without(attendees, stored).filter(
    (a, i, all) => all.findIndex((o) => Utils.emailIsEquivalent(o.email, a.email)) === i
  );
  const removed = without(stored, attendees);
  return unlessEmpty({
    ...base,
    attendees: added.length || removed.length ? { added, removed } : undefined,
  });
}

/** `stored` as it will be once the change is sent, new guests last. */
export function attendeesWith(
  stored: EventAttendee[],
  change: UnsentChange | null
): EventAttendee[] {
  if (!change?.attendees) return stored;
  const { added, removed } = change.attendees;
  return [...without(stored, removed), ...added];
}

export function unsentEdit(
  change: UnsentChange | null,
  property: EventPropertyEdit['property']
): EventPropertyEdit | undefined {
  return change?.edits.find((e) => e.property === property);
}

/**
 * `events` with the change's occurrence drawn as it will be once sent; a new repeat rule isn't,
 * nor a series' other occurrences, which the change reaches only if sent to all of them.
 */
export function withUnsentChange(
  events: EventOccurrence[],
  change: UnsentChange | null
): EventOccurrence[] {
  if (!change) return events;
  return events.map((e) => (isUnsentChangeFor(change, e) ? drawnWith(e, change) : e));
}

function drawnWith(occurrence: EventOccurrence, change: UnsentChange): EventOccurrence {
  const edited = (property: 'summary' | 'location' | 'description' | 'transp') =>
    unsentEdit(change, property)?.value;
  const transp = edited('transp');
  const shown = {
    ...occurrence,
    title: edited('summary') ?? occurrence.title,
    location: edited('location') ?? occurrence.location,
    description: edited('description') ?? occurrence.description,
    isFree: transp === undefined ? occurrence.isFree : transp === 'TRANSPARENT',
  };
  return change.times ? occurrenceAt(shown, change.times) : shown;
}
