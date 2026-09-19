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
 * synthesised zone carries the rules in force around the property's own date, and the registry is
 * process-wide: the first file to name a zone without its VTIMEZONE fixes those rules for every
 * later file that also omits it. A file that carries the VTIMEZONE replaces it. An identifier
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
 * Builds a VTIMEZONE describing an IANA zone's offset rules.
 *
 * RFC 5545 section 3.2.19 requires a VTIMEZONE for every TZID an object references, and
 * section 3.6.5 makes it the authority for resolving those times. Servers with their own zone
 * database resolve by TZID name and ignore the body, but ical.js, and every recipient reading
 * the object directly, compute from what is written here: a body claiming one fixed offset puts
 * every occurrence on the other side of a DST transition an hour out.
 *
 * The rules come from moment-timezone rather than being invented: the two transitions bracketing
 * `referenceDate` give the STANDARD and DAYLIGHT offsets, and each yearly RRULE is derived from
 * its transition date. A zone with no DST in that era yields a single STANDARD.
 *
 * Each rule's DTSTART is its first occurrence in 1970, the same anchor vzic and the ical-expander
 * zone database use, rather than the reference year's transition: ical.js matches a date before
 * the earliest DTSTART to no rule at all and reads its wall clock as UTC, so a component anchored
 * in July 2024 would put a February 2024 occurrence six hours out.
 *
 * A pair of transitions is only read as a DST year when they fall within 366 days of each other,
 * and the rules are bounded with UNTIL when moment knows of no transition after them, so that a
 * permanent offset change and an abolished DST regime both settle on a fixed offset rather than
 * repeating forever. What remains undescribed is a zone whose transitions are not an nth-weekday
 * rule at all: Morocco tracks Ramadan, America/Santiago changes on the Sunday on or after 2
 * September so a rule taken from one year is a week out in others, and Asia/Tehran used fixed
 * calendar dates. Those read an hour out for part of the year; vzic writes them as several
 * blocks with explicit RDATEs.
 *
 * @param tzId - IANA timezone identifier (e.g. 'America/Chicago'), reproduced verbatim as the TZID
 * @param referenceDate - The era whose rules are described; zones change theirs over time
 * @returns A VTIMEZONE ICS string (no surrounding VCALENDAR wrapper)
 */
export function createVTIMEZONEString(tzId: string, referenceDate: Date): string {
  const momentTz = require('moment-timezone');

  const formatOffset = (utcOffsetMin: number) => {
    // Pre-1900 dates read the zone's LMT offset, which has seconds in it: America/Chicago is
    // -5:50:36. Section 3.3.19 admits only whole minutes.
    const abs = Math.round(Math.abs(utcOffsetMin));
    const sign = utcOffsetMin >= 0 ? '+' : '-';
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(
      2,
      '0'
    )}`;
  };

  // The nth (or, for a negative nth, the last) given weekday of the month in 1970.
  const dayIn1970 = (month: number, nth: number, weekday: number) => {
    const first = momentTz.utc([1970, month - 1, 1]);
    if (nth > 0) {
      return first.add(((weekday - first.day() + 7) % 7) + 7 * (nth - 1), 'days');
    }
    const last = first.endOf('month');
    return last.subtract((last.day() - weekday + 7) % 7, 'days');
  };

  // Section 3.6.5: DTSTART is the wall clock at which the rule takes effect, read in the offset
  // being left (TZOFFSETFROM).
  const sample = (at: Date, offsetFromMin: number) => {
    const local = momentTz(at).utcOffset(offsetFromMin);
    const after = momentTz(at).tz(tzId);
    const month = local.month() + 1;
    // The EU switches on the *last* Sunday of the month, which is the fifth in some years and
    // the fourth in others; BYDAY=-1SU is the rule those zones mean.
    const nth =
      local.clone().add(7, 'days').month() !== local.month() ? -1 : Math.ceil(local.date() / 7);
    return {
      dtstart: `${dayIn1970(month, nth, local.day()).format('YYYYMMDD')}T${local.format('HHmmss')}`,
      month,
      nth,
      weekday: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][local.day()],
      offsetTo: after.utcOffset(),
      offsetFrom: offsetFromMin,
      name: after.zoneAbbr(),
      instant: at
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, ''),
    };
  };

  const block = (kind: 'STANDARD' | 'DAYLIGHT', t: ReturnType<typeof sample>, until?: string) => [
    `BEGIN:${kind}`,
    `DTSTART:${t.dtstart}`,
    `RRULE:FREQ=YEARLY;BYMONTH=${t.month};BYDAY=${t.nth}${t.weekday}` +
      (until ? `;UNTIL=${until}` : ''),
    `TZOFFSETFROM:${formatOffset(t.offsetFrom)}`,
    `TZOFFSETTO:${formatOffset(t.offsetTo)}`,
    `TZNAME:${t.name}`,
    `END:${kind}`,
  ];

  // moment-timezone's `untils` are the instants each offset stops applying; the two bracketing
  // the reference date are the DST rules in force around it.
  const zone = momentTz.tz.zone(tzId);
  const untils: number[] = (zone && zone.untils) || [];
  const refMs = referenceDate.getTime();
  const idx = untils.findIndex((u) => u !== null && u > refMs);
  const transitions: Date[] = [];
  if (idx > 0) {
    for (const u of [untils[idx - 1], untils[idx]]) {
      if (u !== null && isFinite(u)) transitions.push(new Date(u));
    }
  }
  const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
  // An offset that outlasts a year, or that moment knows no end for, is not one half of a DST
  // year. moment's last `untils` entry is Infinity.
  const lasts = (from: number, to: number) => !isFinite(to) || to - from > YEAR_MS;

  // Transitions over a year apart delimit permanent offsets rather than the halves of a DST
  // year: Europe/Moscow's 2011 and 2014 moves bracket a June 2014 date, and read as a pair they
  // invent perpetual summer time for a zone that has observed none since 2011.
  let permanentChange: Date | null = null;
  if (transitions.length === 2 && lasts(transitions[0].getTime(), transitions[1].getTime())) {
    // Only when the new offset itself sticks: a 1900 reference brackets America/Chicago's 1883
    // and 1918 changes, and the later one is the first day of a DST year.
    if (lasts(transitions[1].getTime(), untils[idx + 1])) permanentChange = transitions[1];
    transitions.length = 0;
  }

  // moment knows of no later transition, so this pair is the zone's last DST year: bound each
  // rule at its own final transition. Section 3.6.5 continues the last observance indefinitely,
  // so a reader then holds the standard offset — what America/Mexico_City, which abolished DST
  // after 2022, actually does, rather than being an hour out every summer since.
  const isFinalDSTYear = transitions.length === 2 && !isFinite(untils[idx + 1]);

  const samples = transitions.map((at) =>
    // One millisecond before the transition is the offset being left behind.
    sample(
      at,
      momentTz(new Date(at.getTime() - 1))
        .tz(tzId)
        .utcOffset()
    )
  );
  const daylight = samples.find((t) => samples.some((o) => t.offsetTo > o.offsetTo));
  const standard = samples.find((t) => t !== daylight);

  const body: string[] = [];
  if (daylight && standard) {
    body.push(
      ...block('STANDARD', standard, isFinalDSTYear ? standard.instant : undefined),
      ...block('DAYLIGHT', daylight, isFinalDSTYear ? daylight.instant : undefined)
    );
  } else {
    // No DST in this era: one STANDARD at the offset in force, and no RRULE because there is no
    // recurring transition to describe.
    const m = momentTz(referenceDate).tz(tzId);
    body.push(
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      `TZOFFSETFROM:${formatOffset(m.utcOffset())}`,
      `TZOFFSETTO:${formatOffset(m.utcOffset())}`,
      `TZNAME:${m.zoneAbbr()}`,
      'END:STANDARD'
    );
    if (permanentChange) {
      // A second observance for the move the era ends at. The registry is process-wide (see
      // registerTimezones), so without it one historical invite would hold every later date the
      // session reads in this zone at the superseded offset.
      const after = momentTz(permanentChange).tz(tzId);
      const at = momentTz(permanentChange).utcOffset(m.utcOffset());
      body.push(
        'BEGIN:STANDARD',
        `DTSTART:${at.format('YYYYMMDDTHHmmss')}`,
        `TZOFFSETFROM:${formatOffset(m.utcOffset())}`,
        `TZOFFSETTO:${formatOffset(after.utcOffset())}`,
        `TZNAME:${after.zoneAbbr()}`,
        'END:STANDARD'
      );
    }
  }

  return ['BEGIN:VTIMEZONE', `TZID:${tzId}`, ...body, 'END:VTIMEZONE'].join('\r\n');
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
