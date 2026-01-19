import { parseICSString } from './calendar-utils';

type ICAL = typeof import('ical.js').default;
type ICALComponent = InstanceType<ICAL['Component']>;
type ICALTime = InstanceType<ICAL['Time']>;

let ICAL: ICAL = null;

function getICAL(): ICAL {
  if (!ICAL) {
    ICAL = require('ical.js');
  }
  return ICAL;
}

/**
 * Options for creating a new ICS event
 */
export interface CreateEventOptions {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  organizer?: { email: string; name?: string };
  attendees?: Array<{ email: string; name?: string; role?: string }>;
  recurrenceRule?: string;
}

/**
 * Options for updating event times
 */
export interface UpdateTimesOptions {
  start: number; // Unix timestamp in seconds
  end: number; // Unix timestamp in seconds
  isAllDay?: boolean;
}

/**
 * Result of creating a recurrence exception
 */
export interface RecurrenceExceptionResult {
  /** Updated master ICS with EXDATE added */
  masterIcs: string;
  /** New exception event ICS */
  exceptionIcs: string;
  /** The RECURRENCE-ID value for the exception */
  recurrenceId: string;
}

/**
 * Information about an event's recurrence
 */
export interface RecurrenceInfo {
  isRecurring: boolean;
  rule?: string;
  frequency?: string;
}

/**
 * Generates a unique ID for calendar events
 */
export function generateUID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}@mailspring`;
}

/**
 * Formats a Date as an ICS date-only string (YYYYMMDD)
 */
function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formats a Date as an ICS datetime string (YYYYMMDDTHHMMSSZ)
 */
function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Creates an ICAL.Time from a Date, handling all-day vs timed events
 */
function createICALTime(date: Date, isAllDay: boolean, ical: ICAL): ICALTime {
  const time = ical.Time.fromJSDate(date, !isAllDay);
  if (isAllDay) {
    time.isDate = true;
  }
  return time;
}

/**
 * Creates a new ICS string for an event
 */
export function createICSString(options: CreateEventOptions): string {
  const ical = getICAL();

  // Create VCALENDAR component
  const calendar = new ical.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('prodid', '-//Mailspring//Calendar//EN');
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('calscale', 'GREGORIAN');

  // Create VEVENT component
  const vevent = new ical.Component('vevent');
  const event = new ical.Event(vevent);

  // Set UID
  event.uid = options.uid || generateUID();

  // Set summary (title)
  event.summary = options.summary;

  // Set times
  const isAllDay = options.isAllDay ?? false;
  event.startDate = createICALTime(options.start, isAllDay, ical);
  event.endDate = createICALTime(options.end, isAllDay, ical);

  // Set optional properties
  if (options.description) {
    event.description = options.description;
  }
  if (options.location) {
    event.location = options.location;
  }

  // Set organizer
  if (options.organizer) {
    const organizer = vevent.addProperty('organizer');
    organizer.setValue(`mailto:${options.organizer.email}`);
    if (options.organizer.name) {
      organizer.setParameter('cn', options.organizer.name);
    }
  }

  // Set attendees
  if (options.attendees) {
    for (const attendee of options.attendees) {
      const prop = vevent.addProperty('attendee');
      prop.setValue(`mailto:${attendee.email}`);
      if (attendee.name) {
        prop.setParameter('cn', attendee.name);
      }
      prop.setParameter('partstat', 'NEEDS-ACTION');
      prop.setParameter('role', attendee.role || 'REQ-PARTICIPANT');
    }
  }

  // Set recurrence rule
  if (options.recurrenceRule) {
    vevent.addPropertyWithValue('rrule', ical.Recur.fromString(options.recurrenceRule));
  }

  // Set timestamp
  vevent.addPropertyWithValue('dtstamp', ical.Time.now());

  calendar.addSubcomponent(vevent);
  return calendar.toString();
}

/**
 * Updates the start/end times in an event's ICS data.
 * Preserves all other event properties.
 *
 * @param ics - The original ICS string
 * @param options - New start/end times and whether it's an all-day event
 * @returns The modified ICS string
 */
export function updateEventTimes(ics: string, options: UpdateTimesOptions): string {
  const ical = getICAL();
  const { root, event } = parseICSString(ics);

  const startDate = new Date(options.start * 1000);
  const endDate = new Date(options.end * 1000);
  const isAllDay = options.isAllDay ?? false;

  if (isAllDay) {
    // For all-day events, use DATE type (no time component)
    const newStart = ical.Time.fromJSDate(startDate, true);
    newStart.isDate = true;
    event.startDate = newStart;

    const newEnd = ical.Time.fromJSDate(endDate, true);
    newEnd.isDate = true;
    event.endDate = newEnd;
  } else {
    // For timed events, try to preserve original timezone
    const originalTz = event.startDate?.zone;

    const newStart = ical.Time.fromJSDate(startDate, false);
    if (originalTz && originalTz.tzid && originalTz.tzid !== 'UTC') {
      newStart.zone = originalTz;
    }
    event.startDate = newStart;

    const newEnd = ical.Time.fromJSDate(endDate, false);
    if (originalTz && originalTz.tzid && originalTz.tzid !== 'UTC') {
      newEnd.zone = originalTz;
    }
    event.endDate = newEnd;
  }

  // Update DTSTAMP to indicate modification
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  // Increment SEQUENCE if present (for proper sync)
  const sequence = vevent.getFirstPropertyValue('sequence');
  if (sequence !== null) {
    vevent.updatePropertyWithValue('sequence', (parseInt(String(sequence), 10) || 0) + 1);
  }

  return root.toString();
}

/**
 * Creates an exception instance for a recurring event.
 * Used when modifying a single occurrence of a recurring event.
 *
 * @param masterIcs - The master event's ICS data
 * @param originalOccurrenceStart - The original start time of the occurrence being modified (unix seconds)
 * @param newStart - New start time (unix seconds)
 * @param newEnd - New end time (unix seconds)
 * @param isAllDay - Whether this is an all-day event
 * @returns Object with modified master ICS (with EXDATE) and new exception ICS
 */
export function createRecurrenceException(
  masterIcs: string,
  originalOccurrenceStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean
): RecurrenceExceptionResult {
  const ical = getICAL();
  const { root: masterRoot, event: masterEvent } = parseICSString(masterIcs);

  // Create RECURRENCE-ID value from original occurrence start
  const originalDate = new Date(originalOccurrenceStart * 1000);
  const recurrenceId = isAllDay ? formatDateOnly(originalDate) : formatDateTime(originalDate);

  // Get the master VEVENT component
  const masterVevent =
    masterRoot.name === 'vevent' ? masterRoot : masterRoot.getFirstSubcomponent('vevent');

  // Add EXDATE to master to exclude this occurrence
  const exdateTime = createICALTime(originalDate, isAllDay, ical);
  masterVevent.addPropertyWithValue('exdate', exdateTime);

  // Create exception VCALENDAR
  const exceptionCal = new ical.Component(['vcalendar', [], []]);
  exceptionCal.updatePropertyWithValue('prodid', '-//Mailspring//Calendar//EN');
  exceptionCal.updatePropertyWithValue('version', '2.0');

  // Clone the VEVENT for the exception
  const exceptionVevent = new ical.Component(masterVevent.toJSON());

  // Remove recurrence rule from exception (it's a single instance)
  exceptionVevent.removeProperty('rrule');
  exceptionVevent.removeProperty('rdate');
  exceptionVevent.removeProperty('exdate');

  // Set RECURRENCE-ID to link this exception to the master
  const recIdTime = createICALTime(originalDate, isAllDay, ical);
  exceptionVevent.updatePropertyWithValue('recurrence-id', recIdTime);

  // Set new times on the exception
  const newStartDate = new Date(newStart * 1000);
  const newEndDate = new Date(newEnd * 1000);

  const exceptionEvent = new ical.Event(exceptionVevent);
  exceptionEvent.startDate = createICALTime(newStartDate, isAllDay, ical);
  exceptionEvent.endDate = createICALTime(newEndDate, isAllDay, ical);

  // Update DTSTAMP on both
  const now = ical.Time.now();
  masterVevent.updatePropertyWithValue('dtstamp', now);
  exceptionVevent.updatePropertyWithValue('dtstamp', now);

  // Increment SEQUENCE on exception
  const sequence = exceptionVevent.getFirstPropertyValue('sequence');
  exceptionVevent.updatePropertyWithValue('sequence', (parseInt(String(sequence), 10) || 0) + 1);

  exceptionCal.addSubcomponent(exceptionVevent);

  return {
    masterIcs: masterRoot.toString(),
    exceptionIcs: exceptionCal.toString(),
    recurrenceId,
  };
}

/**
 * Updates times for all occurrences of a recurring event.
 * Shifts the entire series by the delta between the original occurrence and new times.
 *
 * @param ics - The master event's ICS data
 * @param originalOccurrenceStart - The original start time of the dragged occurrence (unix seconds)
 * @param newStart - New start time for the dragged occurrence (unix seconds)
 * @param newEnd - New end time for the dragged occurrence (unix seconds)
 * @param isAllDay - Whether this is an all-day event
 * @returns The modified ICS string with shifted series times
 */
export function updateRecurringEventTimes(
  ics: string,
  originalOccurrenceStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean
): string {
  const { event } = parseICSString(ics);

  // Calculate the time delta (how much the occurrence was moved)
  const deltaMs = (newStart - originalOccurrenceStart) * 1000;

  // Get current master event times and apply delta
  const currentStart = event.startDate.toJSDate().getTime();
  const currentEnd = event.endDate.toJSDate().getTime();

  const adjustedStart = (currentStart + deltaMs) / 1000;
  const adjustedEnd = (currentEnd + deltaMs) / 1000;

  return updateEventTimes(ics, {
    start: adjustedStart,
    end: adjustedEnd,
    isAllDay,
  });
}

/**
 * Checks if an event has recurrence rules (RRULE or RDATE)
 */
export function isRecurringEvent(ics: string): boolean {
  const { root } = parseICSString(ics);
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  return !!(vevent.getFirstPropertyValue('rrule') || vevent.getFirstPropertyValue('rdate'));
}

/**
 * Gets information about the recurrence pattern
 */
export function getRecurrenceInfo(ics: string): RecurrenceInfo {
  const { root } = parseICSString(ics);
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  const rrule = vevent.getFirstPropertyValue('rrule');
  if (!rrule) {
    return { isRecurring: false };
  }

  return {
    isRecurring: true,
    rule: rrule.toString(),
    frequency: rrule.freq,
  };
}

/**
 * Adds an EXDATE to a recurring event to exclude a specific occurrence.
 * Used when deleting a single occurrence of a recurring event.
 *
 * @param ics - The master event's ICS data
 * @param occurrenceStart - The start time of the occurrence to exclude (unix seconds)
 * @param isAllDay - Whether this is an all-day event
 * @returns The modified ICS string with the EXDATE added
 */
export function addExclusionDate(ics: string, occurrenceStart: number, isAllDay: boolean): string {
  const ical = getICAL();
  const { root } = parseICSString(ics);

  // Get the VEVENT component
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  // Create EXDATE time from occurrence start
  const occurrenceDate = new Date(occurrenceStart * 1000);
  const exdateTime = createICALTime(occurrenceDate, isAllDay, ical);
  vevent.addPropertyWithValue('exdate', exdateTime);

  // Update DTSTAMP to indicate modification
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  // Increment SEQUENCE if present (for proper sync)
  const sequence = vevent.getFirstPropertyValue('sequence');
  if (sequence !== null) {
    vevent.updatePropertyWithValue('sequence', (parseInt(String(sequence), 10) || 0) + 1);
  }

  return root.toString();
}

/**
 * Updates a specific property in the event's ICS data
 */
export function updateEventProperty(
  ics: string,
  property: 'summary' | 'description' | 'location',
  value: string
): string {
  const ical = getICAL();
  const { root, event } = parseICSString(ics);

  switch (property) {
    case 'summary':
      event.summary = value;
      break;
    case 'description':
      event.description = value;
      break;
    case 'location':
      event.location = value;
      break;
  }

  // Update DTSTAMP
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  return root.toString();
}
