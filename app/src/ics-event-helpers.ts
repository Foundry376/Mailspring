import { parseICSString } from './calendar-utils';

type ICAL = typeof import('ical.js').default;
type ICALComponent = InstanceType<ICAL['Component']>;
type ICALTime = InstanceType<ICAL['Time']>;
type ICALTimezone = InstanceType<ICAL['Timezone']>;

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
  timezone?: string; // IANA timezone identifier (e.g., 'America/New_York')
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
 * Uses LOCAL date components since all-day events represent a day in the user's timezone
 */
function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formats a Date as an ICS datetime string in UTC (YYYYMMDDTHHMMSSZ)
 */
function formatDateTimeUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Creates an ICAL.Time for an all-day event (DATE type, no time component)
 * Uses local date since all-day events represent a calendar day in user's timezone
 */
function createAllDayTime(date: Date, ical: ICAL): ICALTime {
  const time = new ical.Time(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      isDate: true,
    },
    null // timezone parameter (null for floating/all-day)
  );
  return time;
}

/**
 * Creates an ICAL.Time from a Date, optionally preserving a specific timezone.
 * For timed events, this properly handles timezone conversion.
 *
 * @param date - JavaScript Date (represents a moment in time)
 * @param isAllDay - Whether this is an all-day event
 * @param ical - The ICAL library reference
 * @param preserveZone - Optional timezone to use (from original event)
 */
function createICALTime(
  date: Date,
  isAllDay: boolean,
  ical: ICAL,
  preserveZone?: ICALTimezone | null
): ICALTime {
  if (isAllDay) {
    return createAllDayTime(date, ical);
  }

  // For timed events with a timezone to preserve
  if (
    preserveZone &&
    preserveZone.tzid &&
    preserveZone.tzid !== 'UTC' &&
    preserveZone.tzid !== 'floating'
  ) {
    // Create the time in UTC first, then convert to the target timezone
    // This ensures the moment in time is preserved correctly
    const utcTime = ical.Time.fromJSDate(date, true); // true = use UTC

    // Convert to target timezone
    // Note: This adjusts the wall-clock time to show the same moment in the target zone
    const zonedTime = utcTime.convertToZone(preserveZone);
    return zonedTime;
  }

  // Default: create time in UTC (floating time)
  return ical.Time.fromJSDate(date, true);
}

/**
 * Validates timestamp options and throws if invalid
 */
function validateTimestamps(start: number, end: number): void {
  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error('Invalid timestamps: start and end must be numbers');
  }
  if (start < 0 || end < 0) {
    throw new Error('Invalid timestamps: must be positive');
  }
  if (end < start) {
    throw new Error('Invalid timestamps: end time must be after or equal to start time');
  }
}

/**
 * Creates a new ICS string for an event
 *
 * @param options - Event creation options including title, times, and optional timezone
 * @returns A valid ICS string representing the event
 */
export function createICSString(options: CreateEventOptions): string {
  const ical = getICAL();
  const isAllDay = options.isAllDay ?? false;

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

  // Resolve timezone if specified (for timed events only)
  let eventTimezone: ICALTimezone | null = null;
  if (!isAllDay && options.timezone) {
    try {
      // Try to get the timezone from ICAL's built-in timezone service
      eventTimezone = ical.TimezoneService.get(options.timezone);
    } catch {
      // If timezone lookup fails, we'll use UTC
      console.warn(`Could not resolve timezone: ${options.timezone}, using UTC`);
    }
  }

  // Set times with timezone support
  event.startDate = createICALTime(options.start, isAllDay, ical, eventTimezone);
  event.endDate = createICALTime(options.end, isAllDay, ical, eventTimezone);

  // Set optional properties
  if (options.description) {
    event.description = options.description;
  }
  if (options.location) {
    event.location = options.location;
  }

  // Set organizer
  if (options.organizer) {
    const organizer = vevent.addProperty('organizer' as any);
    organizer.setValue(`mailto:${options.organizer.email}`);
    if (options.organizer.name) {
      organizer.setParameter('cn', options.organizer.name);
    }
  }

  // Set attendees
  if (options.attendees) {
    for (const attendee of options.attendees) {
      const prop = vevent.addProperty('attendee' as any);
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
 * Preserves all other event properties and properly handles timezone conversion.
 *
 * @param ics - The original ICS string
 * @param options - New start/end times and whether it's an all-day event
 * @returns The modified ICS string
 */
export function updateEventTimes(ics: string, options: UpdateTimesOptions): string {
  // Validate inputs
  validateTimestamps(options.start, options.end);

  const ical = getICAL();
  const { root, event } = parseICSString(ics);

  const startDate = new Date(options.start * 1000);
  const endDate = new Date(options.end * 1000);
  const isAllDay = options.isAllDay ?? false;

  // Get the original timezone to preserve it for timed events
  const originalStartZone = event.startDate?.zone;
  const originalEndZone = event.endDate?.zone;

  // Create new times, preserving timezone for timed events
  event.startDate = createICALTime(startDate, isAllDay, ical, originalStartZone);
  event.endDate = createICALTime(endDate, isAllDay, ical, originalEndZone);

  // Update DTSTAMP to indicate modification
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }
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
  // Validate inputs
  validateTimestamps(newStart, newEnd);

  const ical = getICAL();
  const { root: masterRoot, event: masterEvent } = parseICSString(masterIcs);

  // Get the original timezone from the master event to preserve it
  const originalStartZone = masterEvent.startDate?.zone;

  // Create RECURRENCE-ID value from original occurrence start
  const originalDate = new Date(originalOccurrenceStart * 1000);
  const recurrenceId = isAllDay ? formatDateOnly(originalDate) : formatDateTimeUTC(originalDate);

  // Get the master VEVENT component
  const masterVevent =
    masterRoot.name === 'vevent' ? masterRoot : masterRoot.getFirstSubcomponent('vevent');

  if (!masterVevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  // Add EXDATE to master to exclude this occurrence (preserve timezone)
  const exdateTime = createICALTime(originalDate, isAllDay, ical, originalStartZone);
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

  // Set RECURRENCE-ID to link this exception to the master (preserve timezone)
  const recIdTime = createICALTime(originalDate, isAllDay, ical, originalStartZone);
  exceptionVevent.updatePropertyWithValue('recurrence-id', recIdTime);

  // Set new times on the exception (preserve timezone)
  const newStartDate = new Date(newStart * 1000);
  const newEndDate = new Date(newEnd * 1000);

  const exceptionEvent = new ical.Event(exceptionVevent);
  exceptionEvent.startDate = createICALTime(newStartDate, isAllDay, ical, originalStartZone);
  exceptionEvent.endDate = createICALTime(newEndDate, isAllDay, ical, originalStartZone);

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

  if (!vevent) {
    return false;
  }

  return !!(vevent.getFirstPropertyValue('rrule') || vevent.getFirstPropertyValue('rdate'));
}

/**
 * Gets information about the recurrence pattern
 */
export function getRecurrenceInfo(ics: string): RecurrenceInfo {
  const { root } = parseICSString(ics);
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  if (!vevent) {
    return { isRecurring: false };
  }

  const rrule = vevent.getFirstPropertyValue('rrule');
  if (!rrule) {
    return { isRecurring: false };
  }

  // rrule is an ICAL.Recur object when present
  const recur = rrule as InstanceType<ICAL['Recur']>;
  return {
    isRecurring: true,
    rule: recur.toString(),
    frequency: recur.freq,
  };
}

/**
 * Adds an EXDATE to a recurring event to exclude a specific occurrence.
 * Used when deleting a single occurrence of a recurring event.
 * Preserves the original event's timezone.
 *
 * @param ics - The master event's ICS data
 * @param occurrenceStart - The start time of the occurrence to exclude (unix seconds)
 * @param isAllDay - Whether this is an all-day event
 * @returns The modified ICS string with the EXDATE added
 */
export function addExclusionDate(ics: string, occurrenceStart: number, isAllDay: boolean): string {
  const ical = getICAL();
  const { root, event } = parseICSString(ics);

  // Get the VEVENT component
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  // Get the original timezone from the event to preserve it
  const originalZone = event.startDate?.zone;

  // Create EXDATE time from occurrence start (preserve timezone)
  const occurrenceDate = new Date(occurrenceStart * 1000);
  const exdateTime = createICALTime(occurrenceDate, isAllDay, ical, originalZone);
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
  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  return root.toString();
}
