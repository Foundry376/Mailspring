import { CalendarUtils } from 'mailspring-exports';
import { EventChange, EventPropertyEdit } from './recurring-event-actions';
import { EventOccurrence, coveredDates } from './calendar-data-source';

type Times = NonNullable<EventChange['times']>;

/** Edits to an event with guests, held until the organizer sends them as one update. */
export interface UnsentChange extends EventChange {
  eventId: string;
}

function unlessEmpty(change: UnsentChange): UnsentChange | null {
  return change.times || change.edits.length ? change : null;
}

/** The change with `edit` in place of any earlier edit to its property, or without it when it puts back the stored value. */
export function withEdit(
  change: UnsentChange | null,
  eventId: string,
  edit: EventPropertyEdit,
  stored: string | null
): UnsentChange | null {
  const base = change ?? { eventId, edits: [] };
  const edits = base.edits.filter((e) => e.property !== edit.property);
  if (edit.value !== stored) edits.push(edit);
  return unlessEmpty({ ...base, edits });
}

export function withTimes(
  change: UnsentChange | null,
  eventId: string,
  times: Times,
  stored: Times
): UnsentChange | null {
  const base = change ?? { eventId, edits: [] };
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

/** `events` with the change's event drawn as it will be once sent; a new repeat rule isn't. */
export function withUnsentChange(
  events: EventOccurrence[],
  change: UnsentChange | null
): EventOccurrence[] {
  if (!change) return events;
  return events.map((e) =>
    CalendarUtils.parseOccurrenceId(e.id).eventId === change.eventId ? drawnWith(e, change) : e
  );
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
  const { times } = change;
  if (!times) return shown;
  const dates = coveredDates(times.start, times.end, times.isAllDay);
  return times.isAllDay
    ? { ...shown, ...dates, isAllDay: true }
    : { ...shown, ...dates, isAllDay: false, start: times.start, end: times.end };
}
