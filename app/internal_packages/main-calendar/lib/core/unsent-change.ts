import { EventChange, EventPropertyEdit } from './recurring-event-actions';

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
