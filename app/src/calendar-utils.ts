import { AccountStore, RegExpUtils } from 'mailspring-exports';

type ICAL = typeof import('ical.js').default;
type ICALComponent = InstanceType<ICAL['Component']>;
type ICALProperty = InstanceType<ICAL['Property']>;
type ICALEvent = InstanceType<ICAL['Event']>;

let ICAL: ICAL = null;

export type ICSParticipantStatus =
  | 'NEEDS-ACTION'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'TENTATIVE'
  | 'DELEGATED'
  | 'COMPLETED'
  | 'IN-PROCESS';

export interface ICSParticipant {
  email: string | null;
  role: 'CHAIR' | 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'NON-PARTICIPANT';
  status: ICSParticipantStatus;
  component: ICALProperty;
}

function fixJCalDatesWithoutTimes(jCal) {
  jCal[1].forEach((property) => {
    if (
      property[0] === 'dtstart' ||
      property[0] === 'dtend' ||
      property[0] === 'exdate' ||
      property[0] === 'rdate'
    ) {
      if (!property[1].value && property[2] === 'date-time' && /T::$/.test(property[3])) {
        property[2] = 'date';
        property[3] = property[3].replace(/T::$/, '');
      }
    }
  });
  jCal[2].forEach(fixJCalDatesWithoutTimes);
}

export function parseICSString(ics: string) {
  if (!ICAL) {
    ICAL = require('ical.js');
  }
  const jcalData = ICAL.parse(ics);

  // workaround https://github.com/mozilla-comm/ical.js/issues/186
  fixJCalDatesWithoutTimes(jcalData);

  const root = new ICAL.Component(jcalData);
  // Before ICAL.Event: relating the exceptions reads each RECURRENCE-ID, and a value read once
  // keeps the zone it was read with.
  registerTimezones(root);
  const event = new ICAL.Event(root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent'));
  return { root, event };
}

/**
 * Registers a VCALENDAR's VTIMEZONEs with the ICAL.js TimezoneService, so `toJSDate()` on a
 * TZID-relative time gives the instant it names, and describes any zone a VEVENT refers to
 * without one. RFC 7809 lets a server omit the VTIMEZONE for an IANA zone, and ical.js has no
 * zone data of its own, so such a value would otherwise read as floating local time. The
 * synthesised zone is the fixed offset in force at the property's own date, and the registry is
 * process-wide: the first file to name a zone without its VTIMEZONE fixes that offset for every
 * later file that also omits it, so a December Vienna file parsed after a July one reads 17:00 as
 * 15:00Z instead of 16:00Z. A file that carries the VTIMEZONE replaces it. An identifier
 * moment-timezone does not know is left alone.
 */
function registerTimezones(vcalendar: ICALComponent): void {
  for (const vtz of vcalendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(vtz);
  }

  const momentTz = require('moment-timezone');
  for (const vevent of vcalendar.getAllSubcomponents('vevent')) {
    for (const prop of vevent.getAllProperties()) {
      const tzid = prop.getParameter('tzid');
      if (typeof tzid !== 'string' || ICAL.TimezoneService.has(tzid)) continue;
      if (!momentTz.tz.zone(tzid)) continue;
      // Read the date off the raw value: hydrating it here would cache it as floating.
      const [, y, m, d] = /^(\d{4})(\d{2})(\d{2})/.exec(String(prop.toJSON()[3])) || [];
      const at = y ? new Date(Date.UTC(+y, +m - 1, +d)) : new Date();
      ICAL.TimezoneService.register(
        new ICAL.Component(
          ICAL.parse(
            `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${createVTIMEZONEString(tzid, at)}\r\nEND:VCALENDAR`
          )
        ).getFirstSubcomponent('vtimezone')
      );
    }
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

export function emailFromParticipantURI(uri: string): string | null {
  if (!uri) {
    return null;
  }

  // Normalize to lowercase for comparison
  const uriLower = uri.toLowerCase();

  // Handle mailto: URI format (most common)
  // e.g., "mailto:user@example.com" or "MAILTO:user@example.com"
  if (uriLower.startsWith('mailto:')) {
    const email = uri.slice(7).toLowerCase(); // preserve original then lowercase
    if (email.includes('@')) {
      return email;
    }
    return null;
  }

  // Handle bare email addresses (no mailto: prefix)
  // Some calendar systems just use "user@example.com" directly
  // Use RegExpUtils.emailRegex which supports international characters,
  // and verify the match covers the entire string to reject malformed inputs
  const emailRegex = RegExpUtils.emailRegex();
  const bareMatch = emailRegex.exec(uri);
  if (bareMatch && bareMatch.index === 0 && bareMatch[0].length === uri.length) {
    return uri.toLowerCase();
  }

  // Try to extract an email pattern from the string as a last resort.
  // This handles edge cases like "invalid:user@example.com" or other
  // non-standard formats where the email is embedded in the string.
  emailRegex.lastIndex = 0; // Reset regex state since it has the 'g' flag
  const embeddedMatch = emailRegex.exec(uri);
  if (embeddedMatch) {
    return embeddedMatch[0].toLowerCase();
  }

  return null;
}

export function cleanParticipants(icsEvent: ICALEvent): ICSParticipant[] {
  return icsEvent.attendees.map((a) => ({
    component: a,
    status: (a.getParameter('partstat') || 'NEEDS-ACTION') as ICSParticipantStatus,
    role: (a.getParameter('role') || 'REQ-PARTICIPANT') as ICSParticipant['role'],
    email:
      a
        .getValues()
        .map(emailFromParticipantURI)
        .find((v) => !!v) || null,
  }));
}

export function selfParticipant(
  icsEvent: ICALEvent,
  accountId: string
): ICSParticipant | undefined {
  const me = cleanParticipants(icsEvent).find((a) => {
    const acct = AccountStore.accountForEmail(a.email);
    return acct && acct.id === accountId;
  });
  return me;
}
