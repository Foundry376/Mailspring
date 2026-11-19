import { localized } from 'mailspring-exports';

/** The event's TRANSP value, which is all iCalendar records about busy and free. */
export type ShowAsOption = 'OPAQUE' | 'TRANSPARENT';

/**
 * Show As for a new event: Free all day, Busy otherwise. Google Calendar, Apple Calendar, Outlook
 * and Thunderbird (calendar.events.defaultTransparency.*) all start events this way, so an
 * all-day reminder or birthday does not block the day in free/busy lookups.
 */
export function defaultShowAs(isAllDay: boolean): ShowAsOption {
  return isAllDay ? 'TRANSPARENT' : 'OPAQUE';
}

const SHOW_AS_OPTIONS: { value: ShowAsOption; label: string }[] = [
  { value: 'OPAQUE', label: localized('Busy') },
  { value: 'TRANSPARENT', label: localized('Free') },
];

export function showAsLabel(option: ShowAsOption): string {
  return SHOW_AS_OPTIONS.find((opt) => opt.value === option).label;
}
