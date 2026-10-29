import { CalendarUtils, localized } from 'mailspring-exports';
import { ChangeScope, EventChange, EventPropertyEdit } from './recurring-event-actions';
import { EventOccurrence, occurrenceAt, occurrenceSlot } from './calendar-data-source';

type Times = NonNullable<EventChange['times']>;

/** Edits made in the panel to one event, sent as one update. */
export interface UnsentChange extends EventChange {
  eventId: string;
  slot?: number;
}

export function isUnsentChangeFor(change: UnsentChange | null, occurrence: EventOccurrence) {
  return (
    !!change &&
    change.eventId === CalendarUtils.parseOccurrenceId(occurrence.id).eventId &&
    (change.slot === undefined || change.slot === occurrenceSlot(occurrence))
  );
}

export function emptyChange(occurrence: EventOccurrence): UnsentChange {
  const { eventId } = CalendarUtils.parseOccurrenceId(occurrence.id);
  return occurrence.isRecurring
    ? { eventId, slot: occurrenceSlot(occurrence), edits: [] }
    : { eventId, edits: [] };
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
