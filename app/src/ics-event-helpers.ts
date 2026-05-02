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
  timezone?: string; // Optional IANA timezone to set (overrides event's original timezone)
}

/**
 * Result of creating a recurrence exception
 */
export interface RecurrenceExceptionResult {
  /** Updated master ICS with the exception VEVENT embedded inline */
  masterIcs: string;
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
 * Adds an EXDATE property to a VEVENT, preserving the TZID parameter when needed.
 *
 * ICAL.js's `addPropertyWithValue('exdate', time)` does NOT set the TZID parameter
 * even when the time has a timezone attached. This causes ical-expander to fail to
 * match the EXDATE against zoned occurrences (the EXDATE is serialized as floating
 * time instead of zoned time). We must manually create the property and set TZID.
 */
function addExdateProperty(
  vevent: ICALComponent,
  exdateTime: ICALTime,
  ical: ICAL,
  zone?: ICALTimezone | null
): void {
  const exProp = new ical.Property('exdate', vevent);
  if (zone && zone.tzid && zone.tzid !== 'UTC' && zone.tzid !== 'floating') {
    exProp.setParameter('tzid', zone.tzid);
  }
  exProp.setValue(exdateTime);
  vevent.addProperty(exProp);
}

/**
 * Registers all VTIMEZONE subcomponents from a VCALENDAR with the ICAL.js
 * TimezoneService so that subsequent `toJSDate()` calls on TZID-relative times
 * resolve correctly. Duplicate registrations are silently ignored.
 */
function registerTimezones(vcalendar: ICALComponent, ical: ICAL): void {
  for (const vtz of vcalendar.getAllSubcomponents('vtimezone')) {
    try {
      ical.TimezoneService.register(vtz);
    } catch (_) {
      // Ignore duplicate registrations (same TZID registered more than once)
    }
  }
}

/**
 * Removes an existing exception VEVENT from a VCALENDAR that matches the given
 * target time (in UTC milliseconds). Uses `toJSDate().getTime()` for comparison
 * after registering timezones, so TZID-formatted and UTC-formatted RECURRENCE-IDs
 * are both correctly identified as the same moment. Falls back to string comparison
 * if `toJSDate()` throws (e.g., unregistered timezone).
 *
 * This implements the "upsert" behaviour: re-editing an existing exception replaces
 * the old VEVENT rather than adding a duplicate.
 *
 * @param vcalendar - The VCALENDAR component to search within
 * @param targetMs - The expected RECURRENCE-ID moment in UTC milliseconds
 * @param recurrenceId - The formatted RECURRENCE-ID string (used as a string fallback)
 * @param isAllDay - Whether the event is all-day (affects string-fallback comparison)
 * @param ical - The ICAL library reference
 */
function removeExistingExceptionVevent(
  vcalendar: ICALComponent,
  targetMs: number,
  recurrenceId: string,
  isAllDay: boolean,
  ical: ICAL
): void {
  registerTimezones(vcalendar, ical);

  for (const existing of vcalendar.getAllSubcomponents('vevent')) {
    const ridValue = existing.getFirstPropertyValue('recurrence-id') as any;
    if (!ridValue) continue;

    try {
      if (ridValue.toJSDate().getTime() === targetMs) {
        vcalendar.removeSubcomponent(existing);
        break;
      }
    } catch (_) {
      // Fallback: string comparison (e.g., if toJSDate throws for an unknown timezone)
      const ridStr =
        typeof ridValue.toString === 'function' ? ridValue.toString() : String(ridValue);
      const ridFormatted = isAllDay
        ? ridStr.replace(/[^0-9]/g, '').substring(0, 8)
        : ridStr.replace(/[^0-9TZ]/g, '');
      const targetFormatted = recurrenceId.replace(/[^0-9TZ]/g, '');
      if (ridFormatted === targetFormatted || ridStr === recurrenceId) {
        vcalendar.removeSubcomponent(existing);
        break;
      }
    }
  }
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
 * Creates a minimal VTIMEZONE ICS string for the given IANA timezone.
 *
 * RFC 5545 requires a VTIMEZONE block whenever TZID is referenced. Most modern
 * CalDAV servers use the TZID name to look up their own DST rules, so the content
 * just needs to be present and well-formed. We derive the UTC offset from
 * moment-timezone for the given reference date (so the abbreviation and sign are
 * accurate for that point in time).
 *
 * @param tzId - IANA timezone identifier (e.g. 'America/Chicago')
 * @param referenceDate - Date used to determine the current UTC offset / abbreviation
 * @returns A VTIMEZONE ICS string (no surrounding VCALENDAR wrapper)
 */
export function createVTIMEZONEString(tzId: string, referenceDate: Date): string {
  const momentTz = require('moment-timezone');
  const m = momentTz(referenceDate).tz(tzId);
  const utcOffsetMin = m.utcOffset(); // e.g. -360 for CST (UTC-6)
  const absMin = Math.abs(utcOffsetMin);
  const sign = utcOffsetMin >= 0 ? '+' : '-';
  const offsetStr = `${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}${String(
    absMin % 60
  ).padStart(2, '0')}`;
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${tzId}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offsetStr}`,
    `TZOFFSETTO:${offsetStr}`,
    `TZNAME:${m.zoneAbbr()}`,
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join('\r\n');
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

  if (!isAllDay && options.timezone) {
    // ical.js TimezoneService only knows UTC/GMT/Z by default — IANA timezone names
    // like "America/Chicago" are never registered, so we can't use it for conversion.
    // Instead, use moment-timezone to extract the correct local time components and
    // create a floating ICAL.Time, then manually stamp the TZID onto the property.
    // This produces: DTSTART;TZID=America/Chicago:20240115T140000
    //
    // RFC 5545 requires a VTIMEZONE component to be present whenever TZID is used.
    // Without it, some servers (Yahoo, etc.) ignore the TZID and treat the wall-clock
    // time as UTC. We generate a minimal VTIMEZONE using the current UTC offset from
    // moment-timezone — the TZID name is what most modern servers actually use to look
    // up DST rules; the VTIMEZONE content just needs to be present and well-formed.
    const momentTz = require('moment-timezone');
    const startM = momentTz(options.start).tz(options.timezone);
    const endM = momentTz(options.end).tz(options.timezone);

    const vtimezoneComp = new ical.Component(
      ical.parse(
        `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${createVTIMEZONEString(
          options.timezone,
          options.start
        )}\r\nEND:VCALENDAR`
      )
    ).getFirstSubcomponent('vtimezone');
    calendar.addSubcomponent(vtimezoneComp);

    event.startDate = new ical.Time(
      {
        year: startM.year(),
        month: startM.month() + 1, // moment months are 0-indexed
        day: startM.date(),
        hour: startM.hour(),
        minute: startM.minute(),
        second: startM.second(),
        isDate: false,
      },
      ical.Timezone.localTimezone
    );
    event.endDate = new ical.Time(
      {
        year: endM.year(),
        month: endM.month() + 1,
        day: endM.date(),
        hour: endM.hour(),
        minute: endM.minute(),
        second: endM.second(),
        isDate: false,
      },
      ical.Timezone.localTimezone
    );

    vevent.getFirstProperty('dtstart')?.setParameter('tzid', options.timezone);
    vevent.getFirstProperty('dtend')?.setParameter('tzid', options.timezone);
  } else {
    // All-day or no-timezone: use existing path
    const eventTimezone: ICALTimezone | null = null;
    event.startDate = createICALTime(options.start, isAllDay, ical, eventTimezone);
    event.endDate = createICALTime(options.end, isAllDay, ical, eventTimezone);
  }

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

  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  if (!isAllDay && options.timezone) {
    // User selected a specific timezone — encode wall-clock time in that zone.
    // This mirrors the timezone path in createICSString.
    const momentTz = require('moment-timezone');
    const startM = momentTz(startDate).tz(options.timezone);
    const endM = momentTz(endDate).tz(options.timezone);

    event.startDate = new ical.Time(
      {
        year: startM.year(),
        month: startM.month() + 1,
        day: startM.date(),
        hour: startM.hour(),
        minute: startM.minute(),
        second: startM.second(),
        isDate: false,
      },
      ical.Timezone.localTimezone
    );
    event.endDate = new ical.Time(
      {
        year: endM.year(),
        month: endM.month() + 1,
        day: endM.date(),
        hour: endM.hour(),
        minute: endM.minute(),
        second: endM.second(),
        isDate: false,
      },
      ical.Timezone.localTimezone
    );

    // Stamp TZID on the date properties
    vevent.getFirstProperty('dtstart')?.setParameter('tzid', options.timezone);
    vevent.getFirstProperty('dtend')?.setParameter('tzid', options.timezone);

    // Ensure a VTIMEZONE component exists in the parent VCALENDAR
    const vcalendar = root.name === 'vcalendar' ? root : null;
    if (vcalendar) {
      // Remove existing VTIMEZONE components and add the current one
      for (const vtz of vcalendar.getAllSubcomponents('vtimezone')) {
        vcalendar.removeSubcomponent(vtz);
      }
      const vtimezoneComp = new ical.Component(
        ical.parse(
          `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${createVTIMEZONEString(
            options.timezone,
            startDate
          )}\r\nEND:VCALENDAR`
        )
      ).getFirstSubcomponent('vtimezone');
      vcalendar.addSubcomponent(vtimezoneComp);
    }
  } else {
    // Preserve the original timezone for timed events, or use floating for all-day
    const originalStartZone = event.startDate?.zone;
    const originalEndZone = event.endDate?.zone;
    event.startDate = createICALTime(startDate, isAllDay, ical, originalStartZone);
    event.endDate = createICALTime(endDate, isAllDay, ical, originalEndZone);
  }

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
 * Creates an exception instance for a recurring event by embedding the exception
 * VEVENT inline in the master VCALENDAR (RFC 4791 §4.1 / RFC 5545 compliant).
 *
 * Unlike the old approach (separate VCALENDAR + EXDATE), this embeds the exception
 * VEVENT directly into the master's VCALENDAR so the entire updated master ICS can
 * be PUT to the same resource as a single update task.
 *
 * Upsert semantics: if a VEVENT with the same RECURRENCE-ID already exists in the
 * master VCALENDAR (e.g. re-editing an already-excepted occurrence), it is replaced.
 *
 * @param masterIcs - The master event's ICS data
 * @param originalOccurrenceStart - The original start time of the occurrence being modified (unix seconds)
 * @param newStart - New start time (unix seconds)
 * @param newEnd - New end time (unix seconds)
 * @param isAllDay - Whether this is an all-day event
 * @returns Object with updated master ICS (exception embedded inline) and the RECURRENCE-ID string
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

  // masterRoot must be a VCALENDAR (not a bare VEVENT) for inline embedding
  const vcalendar = masterRoot.name === 'vcalendar' ? masterRoot : null;
  const masterVevent = vcalendar
    ? vcalendar.getFirstSubcomponent('vevent')
    : masterRoot.name === 'vevent'
      ? masterRoot
      : null;

  if (!masterVevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  // Upsert: remove any existing exception VEVENT with this RECURRENCE-ID so that
  // re-editing a previously excepted occurrence replaces the old VEVENT rather than
  // accumulating duplicates. The helper compares by UTC milliseconds so TZID-formatted
  // and UTC-formatted RECURRENCE-IDs are recognised as the same moment.
  const targetMs = originalDate.getTime();
  if (vcalendar) {
    removeExistingExceptionVevent(vcalendar, targetMs, recurrenceId, isAllDay, ical);
  }

  // Deep-clone the master VEVENT for the exception.
  // ical.Component.toJSON() returns a reference to the internal jCal array, NOT a copy.
  // Without JSON.parse/stringify the cloned component shares the same array as the master,
  // so every mutation below (removeAllProperties, updatePropertyWithValue, etc.) silently
  // mutates the master VEVENT too, producing two identical exception VEVENTs and no master.
  const exceptionVevent = new ical.Component(JSON.parse(JSON.stringify(masterVevent.toJSON())));

  // Remove recurrence rule and exclusion dates from the exception (it's a single instance)
  exceptionVevent.removeAllProperties('rrule');
  exceptionVevent.removeAllProperties('rdate');
  exceptionVevent.removeAllProperties('exdate');

  // Set RECURRENCE-ID using UTC format so it is unambiguous and matches the returned
  // recurrenceId string (which is also UTC via formatDateTimeUTC).
  // Using createICALTime with a named timezone produces a floating-time serialization
  // (no TZID parameter on the property) because updatePropertyWithValue does not auto-set TZID.
  const recIdTime = isAllDay
    ? createAllDayTime(originalDate, ical)
    : ical.Time.fromJSDate(originalDate, true); // UTC → serializes as YYYYMMDDTHHMMSSz
  exceptionVevent.updatePropertyWithValue('recurrence-id', recIdTime);

  // Set new times on the exception (preserve timezone)
  const newStartDate = new Date(newStart * 1000);
  const newEndDate = new Date(newEnd * 1000);
  const exceptionICALEvent = new ical.Event(exceptionVevent);
  exceptionICALEvent.startDate = createICALTime(newStartDate, isAllDay, ical, originalStartZone);
  exceptionICALEvent.endDate = createICALTime(newEndDate, isAllDay, ical, originalStartZone);

  // Update DTSTAMP and increment SEQUENCE on the exception
  const now = ical.Time.now();
  masterVevent.updatePropertyWithValue('dtstamp', now);
  exceptionVevent.updatePropertyWithValue('dtstamp', now);
  const sequence = exceptionVevent.getFirstPropertyValue('sequence');
  exceptionVevent.updatePropertyWithValue('sequence', (parseInt(String(sequence), 10) || 0) + 1);

  // Embed the exception VEVENT inline in the master VCALENDAR
  if (vcalendar) {
    vcalendar.addSubcomponent(exceptionVevent);
  }

  return {
    masterIcs: masterRoot.toString(),
    recurrenceId,
  };
}

/**
 * Applies property edits (summary, location, description, attendees) to an inline
 * exception VEVENT inside a master VCALENDAR ICS string.
 *
 * This is needed because `updateEventProperty` and `updateAttendees` target the
 * first VEVENT (the master), not a specific exception VEVENT identified by RECURRENCE-ID.
 *
 * @param masterIcs - Master VCALENDAR ICS containing the inline exception VEVENT
 * @param recurrenceId - The RECURRENCE-ID string of the exception to edit
 * @param edits - Property values to apply
 * @returns Updated master ICS string
 */
export function applyEditsToException(
  masterIcs: string,
  recurrenceId: string,
  edits: {
    summary?: string;
    location?: string;
    description?: string;
    attendees?: Array<{ email: string; name?: string | null; partstat?: string }>;
  }
): string {
  const ical = getICAL();
  const { root } = parseICSString(masterIcs);

  const vcalendar = root.name === 'vcalendar' ? root : null;
  if (!vcalendar) {
    throw new Error('Invalid ICS: expected VCALENDAR root');
  }

  // Find the exception VEVENT by RECURRENCE-ID
  let exceptionVevent: ICALComponent | null = null;
  for (const vevent of vcalendar.getAllSubcomponents('vevent')) {
    const rid = vevent.getFirstPropertyValue('recurrence-id');
    if (rid) {
      const ridStr =
        typeof rid === 'string'
          ? rid
          : typeof (rid as any).toString === 'function'
            ? (rid as any).toString()
            : String(rid);
      if (
        ridStr === recurrenceId ||
        ridStr.replace(/[^0-9TZ]/g, '') === recurrenceId.replace(/[^0-9TZ]/g, '')
      ) {
        exceptionVevent = vevent;
        break;
      }
    }
  }

  if (!exceptionVevent) {
    throw new Error(`No exception VEVENT found with RECURRENCE-ID matching ${recurrenceId}`);
  }

  const exceptionICALEvent = new ical.Event(exceptionVevent);

  if (edits.summary !== undefined) {
    exceptionICALEvent.summary = edits.summary;
  }
  if (edits.description !== undefined) {
    exceptionICALEvent.description = edits.description;
  }
  if (edits.location !== undefined) {
    exceptionICALEvent.location = edits.location;
  }
  if (edits.attendees !== undefined) {
    exceptionVevent.removeAllProperties('attendee');
    for (const attendee of edits.attendees) {
      const prop = exceptionVevent.addProperty('attendee' as any);
      prop.setValue(`mailto:${attendee.email}`);
      if (attendee.name) {
        prop.setParameter('cn', attendee.name);
      }
      prop.setParameter('partstat', attendee.partstat || 'NEEDS-ACTION');
      prop.setParameter('role', 'REQ-PARTICIPANT');
    }
  }

  exceptionVevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  return root.toString();
}

/**
 * Shifts the RECURRENCE-ID of all inline exception VEVENTs within a master VCALENDAR
 * by the given time delta (in milliseconds). This keeps inline exceptions correctly
 * mapped to their corresponding RRULE-generated slots after the master series is shifted.
 *
 * Exception DTSTART/DTEND are intentionally NOT shifted: preserving the user's explicit
 * exception times (e.g., an exception at 2AM remains at 2AM after shifting the base
 * series from 1AM to 3AM). Only RECURRENCE-ID shifts so ical-expander can still
 * substitute the exception for the correct (now-shifted) occurrence slot.
 *
 * @param ics - Master VCALENDAR ICS containing inline exception VEVENTs
 * @param deltaMs - Time delta in milliseconds (positive = forward, negative = backward)
 * @returns Updated ICS string with shifted RECURRENCE-IDs
 */
export function shiftInlineExceptions(ics: string, deltaMs: number): string {
  if (deltaMs === 0) return ics;

  const ical = getICAL();
  const { root } = parseICSString(ics);

  const vcalendar = root.name === 'vcalendar' ? root : null;
  if (!vcalendar) return ics;

  // Register VTIMEZONE components so toJSDate() converts TZID-relative times correctly.
  registerTimezones(vcalendar, ical);

  for (const vevent of vcalendar.getAllSubcomponents('vevent')) {
    const ridProp = vevent.getFirstProperty('recurrence-id');
    if (!ridProp) continue; // Skip the master VEVENT (no RECURRENCE-ID)

    const ridValue = ridProp.getFirstValue() as any;
    if (!ridValue || typeof ridValue.toJSDate !== 'function') continue;

    const ridDate = ridValue.toJSDate();
    const newRidDate = new Date(ridDate.getTime() + deltaMs);

    const newRidTime = (ridValue.isDate as boolean)
      ? createAllDayTime(newRidDate, ical)
      : ical.Time.fromJSDate(newRidDate, true); // Keep as UTC (same format as createRecurrenceException)

    vevent.updatePropertyWithValue('recurrence-id', newRidTime);
    vevent.updatePropertyWithValue('dtstamp', ical.Time.now());
  }

  return root.toString();
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
  addExdateProperty(vevent, exdateTime, ical, originalZone);

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
 * Sets, updates, or removes the recurrence rule (RRULE) on an event's ICS data.
 *
 * @param ics - The original ICS string
 * @param rruleString - The RRULE string (e.g., 'FREQ=DAILY'), or null/empty to remove
 * @returns The modified ICS string
 */
export function updateRecurrenceRule(ics: string, rruleString: string | null): string {
  const ical = getICAL();
  const { root } = parseICSString(ics);

  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  // Remove existing RRULE(s)
  vevent.removeAllProperties('rrule');

  if (rruleString) {
    // Add new RRULE
    vevent.addPropertyWithValue('rrule', ical.Recur.fromString(rruleString));
  } else {
    // Removing recurrence entirely — also clean up EXDATE and RDATE
    // which are meaningless without an RRULE (RFC 5545)
    vevent.removeAllProperties('exdate');
    vevent.removeAllProperties('rdate');
  }

  // Increment SEQUENCE if present (for proper sync per RFC 5545)
  const sequence = vevent.getFirstPropertyValue('sequence');
  if (sequence !== null) {
    vevent.updatePropertyWithValue('sequence', (parseInt(String(sequence), 10) || 0) + 1);
  }

  // Update DTSTAMP to indicate modification
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  return root.toString();
}

/**
 * Updates the attendees (ATTENDEE properties) on an event's ICS data.
 * Replaces all existing attendees with the provided list.
 *
 * @param ics - The original ICS string
 * @param attendees - Array of attendee objects
 * @returns The modified ICS string
 */
export function updateAttendees(
  ics: string,
  attendees: Array<{ email: string; name?: string | null; partstat?: string }>
): string {
  const ical = getICAL();
  const { root } = parseICSString(ics);

  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  if (!vevent) {
    throw new Error('Invalid ICS: no VEVENT component found');
  }

  // Remove all existing attendees
  vevent.removeAllProperties('attendee');

  // Add new attendees
  for (const attendee of attendees) {
    const prop = vevent.addProperty('attendee' as any);
    prop.setValue(`mailto:${attendee.email}`);
    if (attendee.name) {
      prop.setParameter('cn', attendee.name);
    }
    prop.setParameter('partstat', attendee.partstat || 'NEEDS-ACTION');
    prop.setParameter('role', 'REQ-PARTICIPANT');
  }

  // Update DTSTAMP
  vevent.updatePropertyWithValue('dtstamp', ical.Time.now());

  return root.toString();
}

/**
 * Returns the IANA timezone identifier (TZID) from the event's DTSTART, or null
 * if the event uses UTC/floating time.
 */
export function getEventTimezone(ics: string): string | null {
  const { event } = parseICSString(ics);
  const zone = event.startDate?.zone;
  if (zone && zone.tzid && zone.tzid !== 'UTC' && zone.tzid !== 'floating') {
    return zone.tzid;
  }
  return null;
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
