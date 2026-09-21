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
 * synthesised zone describes the property's own era and everything after it, and the registry is
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

let momentDataHorizonYear: number | null = null;

/**
 * The last year moment-timezone's data reaches. It runs every rule-based zone out to the same
 * final year (2499 in tzdata 2026c) and then holds the last offset, so a transition in that year
 * means the data stopped, not the zone.
 */
function dataHorizonYear(momentTz): number {
  if (momentDataHorizonYear === null) {
    momentDataHorizonYear = Math.max(
      ...momentTz.tz.names().map((name: string) => {
        const untils = momentTz.tz.zone(name).untils.filter(Number.isFinite);
        return untils.length ? new Date(untils[untils.length - 1]).getUTCFullYear() : 0;
      })
    );
  }
  return momentDataHorizonYear;
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
 * The rules come from moment-timezone rather than being invented: a pair of transitions gives the
 * STANDARD and DAYLIGHT offsets, and each yearly RRULE is derived from its transition date. A
 * zone with no DST in that era yields a single STANDARD. An era still observing DST is described
 * by the rule tzdata projects forward, the one the shipped zone database carries, so a series
 * created under an earlier rule reads right today; an era that ended is described by the pair
 * nearest `referenceDate`, since its final year may be irregular (Egypt's 2010 ends with a
 * Ramadan break).
 *
 * Each rule's DTSTART is its first occurrence in 1970, the same anchor vzic and the ical-expander
 * zone database use, rather than the reference year's transition: ical.js matches a date before
 * the earliest DTSTART to no rule at all and reads its wall clock as UTC, so a component anchored
 * in July 2024 would put a February 2024 occurrence six hours out.
 *
 * Everything moment knows after the reference era is written too, so a series created before its
 * zone dropped DST or moved its clock, and still running, reads right today: the rules carry
 * UNTIL where the era ended, each later permanent offset change is an observance of its own, and
 * a DST era that begins later gets its own pair of rules anchored at its first year. What remains
 * undescribed is a rule change inside an era, whose earlier years read at the later rule (the US
 * moved from the first Sunday of April to the second of March in 2007, so 20 March 2005 reads an
 * hour out), and a zone whose transitions are not an nth-weekday rule at all:
 * Morocco tracks Ramadan, America/Santiago changes on the Sunday on or after 2 September so a
 * rule taken from one year is a week out in others, and Asia/Tehran used fixed calendar dates.
 * Those read an hour out for part of the year; vzic writes them as several blocks with explicit
 * RDATEs.
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

  // moment's `untils` are the instants each offset stops applying: segment i runs from
  // untils[i - 1] to untils[i] at offsets[i], minutes west of UTC, and the last entry is Infinity.
  // A change of abbreviation alone is folded into the segment before it, since only offsets are
  // described here: America/Ciudad_Juarez renamed -06:00 from MDT to CST in October 2022 in the
  // middle of a DST year, and read as a transition that ends the year early.
  const zone = momentTz.tz.zone(tzId);
  const untils: number[] = [];
  const offsets: number[] = [];
  const names: string[] = [];
  ((zone && zone.untils) || []).forEach((until: number, i: number) => {
    if (offsets.length && offsets[offsets.length - 1] === zone.offsets[i]) {
      untils[untils.length - 1] = until;
      names[names.length - 1] = zone.abbrs[i];
    } else {
      untils.push(until);
      offsets.push(zone.offsets[i]);
      names.push(zone.abbrs[i]);
    }
  });

  // The observance the transition into segment i begins. Section 3.6.5: DTSTART is the wall clock
  // at which it takes effect, read in the offset being left (TZOFFSETFROM).
  const observance = (i: number) => {
    const at = untils[i - 1];
    const offsetFrom = -offsets[i - 1];
    const local = momentTz(at).utcOffset(offsetFrom);
    const month = local.month() + 1;
    // The EU switches on the *last* Sunday of the month, which is the fifth in some years and
    // the fourth in others; BYDAY=-1SU is the rule those zones mean.
    const nth =
      local.clone().add(7, 'days').month() !== local.month() ? -1 : Math.ceil(local.date() / 7);
    return {
      day: local.format('YYYYMMDD'),
      epochDay: dayIn1970(month, nth, local.day()).format('YYYYMMDD'),
      time: local.format('HHmmss'),
      rrule: `RRULE:FREQ=YEARLY;BYMONTH=${month};BYDAY=${nth}${
        ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][local.day()]
      }`,
      offsetFrom,
      offsetTo: -offsets[i],
      name: names[i],
    };
  };

  const block = (
    kind: 'STANDARD' | 'DAYLIGHT',
    t: ReturnType<typeof observance>,
    day: string,
    rrule: string | null
  ) => [
    `BEGIN:${kind}`,
    `DTSTART:${day}T${t.time}`,
    ...(rrule ? [rrule] : []),
    `TZOFFSETFROM:${formatOffset(t.offsetFrom)}`,
    `TZOFFSETTO:${formatOffset(t.offsetTo)}`,
    `TZNAME:${t.name}`,
    `END:${kind}`,
  ];

  // Section 3.6.5: an RRULE's UNTIL in a VTIMEZONE is always UTC.
  const utc = (at: number) =>
    new Date(at)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
  // One half of a DST year is shorter than a year; a longer segment, or the open-ended last one,
  // is an offset the zone settled on.
  const isDSTHalf = (i: number) => isFinite(untils[i]) && untils[i] - untils[i - 1] <= YEAR_MS;

  const body: string[] = [];

  // The two observances of a DST year, told apart by which sits at the greater offset.
  const halves = (i: number) => {
    const pair = [observance(i), observance(i + 1)];
    const daylight = pair[0].offsetTo > pair[1].offsetTo ? pair[0] : pair[1];
    return { DAYLIGHT: daylight, STANDARD: pair.find((t) => t !== daylight) };
  };

  // Writes the rule pair for the DST era that half-year `first` belongs to and returns the
  // segment the caller continues from. Each rule starts at the era's first transition of its
  // kind, or in 1970 for the era the reference falls in. An era that moment knows ended has its
  // rules bounded just short of its last transition, which the caller writes as a permanent move:
  // it may land on an offset neither rule names (Europe/Simferopol left its +02:00/+04:00 year
  // for +03:00 in October 2014), and a rule whose date drifted in the final year still fires
  // (America/Asuncion changed on 24 March 2024; the rule its 2023 date gives says the last
  // Sunday, the 31st).
  const describeEra = (first: number, anchor: 'epoch' | 'own'): number => {
    let last = first;
    while (isDSTHalf(last + 1)) last++;
    const ended = new Date(untils[last]).getUTCFullYear() < dataHorizonYear(momentTz);
    // A still-running era takes its latest rule: America/Indiana/Vincennes spent its first year
    // on Central time before settling on Eastern.
    const rules = halves(ended ? first : Math.max(first, last - 1));
    const starts = halves(first);
    const until = ended ? `;UNTIL=${utc(untils[last] - 1000)}` : '';
    for (const kind of ['STANDARD', 'DAYLIGHT'] as const) {
      const t = rules[kind];
      body.push(
        ...block(kind, t, anchor === 'epoch' ? t.epochDay : starts[kind].day, t.rrule + until)
      );
    }
    return ended ? last : last + 1;
  };

  let i = untils.findIndex((u) => u > referenceDate.getTime());
  if (isDSTHalf(i)) {
    i = describeEra(i, 'epoch');
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
  }
  // The registry is process-wide (see registerTimezones), so without what follows one historical
  // invite would hold every later date the session reads in this zone at a superseded offset.
  while (isFinite(untils[i])) {
    if (isDSTHalf(i + 1)) {
      i = describeEra(i + 1, 'own');
    } else {
      const t = observance(i + 1);
      body.push(...block('STANDARD', t, t.day, null));
      i++;
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
