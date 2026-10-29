import { CalendarUtils } from 'mailspring-exports';
import { EventChange, EventPropertyEdit } from './recurring-event-actions';
import { EventOccurrence, occurrenceAt, occurrenceSlot } from './calendar-data-source';

type Times = NonNullable<EventChange['times']>;

/** Edits to an event with guests, held until the organizer sends them as one update. */
export interface UnsentChange extends EventChange {
  eventId: string;
  /** The occurrence of a series the edits were made to, by its `occurrenceSlot`. */
  slot?: number;
}

/** Whether `change` was made to this occurrence, which a series shares its event with. */
export function isUnsentChangeFor(change: UnsentChange | null, occurrence: EventOccurrence) {
  return (
    !!change &&
    change.eventId === CalendarUtils.parseOccurrenceId(occurrence.id).eventId &&
    (change.slot === undefined || change.slot === occurrenceSlot(occurrence))
  );
}

function emptyChange(occurrence: EventOccurrence): UnsentChange {
  const { eventId } = CalendarUtils.parseOccurrenceId(occurrence.id);
  return occurrence.isRecurring
    ? { eventId, slot: occurrenceSlot(occurrence), edits: [] }
    : { eventId, edits: [] };
}

function unlessEmpty(change: UnsentChange): UnsentChange | null {
  return change.times || change.edits.length ? change : null;
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
  return unlessEmpty({ ...base, times: same ? undefined : times });
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
