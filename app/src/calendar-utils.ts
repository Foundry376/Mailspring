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

const WHOLE_HISTORY = new Date(Date.UTC(1601, 0, 1));

/**
 * Registers a VCALENDAR's VTIMEZONEs with the ICAL.js TimezoneService, so `toJSDate()` on a
 * TZID-relative time gives the instant it names, and describes any zone a VEVENT refers to
 * without one. RFC 7809 lets a server omit the VTIMEZONE for an IANA zone, and ical.js has no
 * zone data of its own, so such a value would otherwise read as floating local time. The registry
 * is process-wide, so the synthesised zone describes the zone's whole history: whichever file names
 * it first, a later file's older dates read right. A file that carries the VTIMEZONE replaces it.
 * An identifier moment-timezone does not know is left alone.
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
      ICAL.TimezoneService.register(
        new ICAL.Component(
          ICAL.parse(
            `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${createVTIMEZONEString(
              tzid,
              WHOLE_HISTORY
            )}\r\nEND:VCALENDAR`
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

// "2,3,4,5,6,7,8" for 2: the days of a week-long BYMONTHDAY window starting on each day.
const WEEK_FROM = Array.from({ length: 29 }, (_, first) =>
  Array.from({ length: 7 }, (__, k) => first + k).join(',')
);
const vtimezoneCache = new Map<string, string>();

/**
 * Builds a VTIMEZONE describing an IANA zone's offset rules.
 *
 * RFC 5545 section 3.2.19 requires a VTIMEZONE for every TZID an object references, and
 * section 3.6.5 makes it the authority for resolving those times. Servers with their own zone
 * database resolve by TZID name and ignore the body, but ical.js, and every recipient reading
 * the object directly, compute from what is written here: a body claiming one fixed offset puts
 * every occurrence on the other side of a DST transition an hour out.
 *
 * Every offset change moment-timezone knows from `referenceDate` on is written, so a time on or
 * after it reads exactly as moment reads it. Consecutive years whose change falls on the same
 * yearly rule share one RRULE: the nth or last weekday of a month (the US, the EU), a weekday on
 * or after a date (America/Santiago's Sunday on or after 2 September), or a fixed date. A rule
 * that stops carries UNTIL at its last change, and the rule the data runs out on carries none.
 * A change no rule covers is an RDATE: Morocco's Ramadan suspensions, Asia/Tehran's 21 March in
 * leap years, a final year whose date drifted (America/Asuncion's 24 March 2024).
 *
 * The rules in force at `referenceDate` start in 1970, the anchor vzic and the ical-expander zone
 * database use, rather than at their real first year: ical.js matches a date before the earliest
 * DTSTART to no rule and reads its wall clock as UTC, and a created event's component should look
 * like everyone else's two-rule zone. An earlier `referenceDate` anchors in the year before it, so
 * the component can describe a zone's whole history.
 *
 * @param tzId - IANA timezone identifier (e.g. 'America/Chicago'), reproduced verbatim as the TZID
 * @param referenceDate - The first instant the component must read correctly
 * @returns A VTIMEZONE ICS string (no surrounding VCALENDAR wrapper)
 */
export function createVTIMEZONEString(tzId: string, referenceDate: Date): string {
  const momentTz = require('moment-timezone');
  const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  // Pre-1900 dates read the zone's LMT offset, which has seconds in it: America/Chicago is
  // -5:50:36. ical.js reads whole minutes only.
  const wholeMinutes = (utcOffsetMin: number) =>
    Math.sign(utcOffsetMin) * Math.round(Math.abs(utcOffsetMin));
  const formatOffset = (utcOffsetMin: number) => {
    const abs = Math.abs(wholeMinutes(utcOffsetMin));
    const sign = utcOffsetMin >= 0 ? '+' : '-';
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(
      2,
      '0'
    )}`;
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

  const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
  const horizon = dataHorizonYear(momentTz);
  const anchorYear = Math.min(1970, referenceDate.getUTCFullYear() - 1);

  // The change into segment i. Section 3.6.5: DTSTART is the wall clock at which it takes effect,
  // read in the offset being left (TZOFFSETFROM).
  const change = (i: number) => {
    const offsetFrom = -offsets[i - 1];
    // Shifted by hand: moment's utcOffset(n) reads |n| < 16 as hours, which Europe/Paris's
    // +00:09:21 LMT is not.
    const local = momentTz.utc(untils[i - 1] + offsetFrom * 60 * 1000);
    return {
      i,
      at: untils[i - 1],
      local,
      year: local.year(),
      month: local.month() + 1,
      day: local.date(),
      weekday: local.day(),
      time: local.format('HHmmss'),
      offsetFrom,
      offsetTo: -offsets[i],
      name: names[i],
      // Half of a DST year, which is shorter than a year, at the greater of the two offsets.
      daylight: -offsets[i] > offsetFrom && untils[i] - untils[i - 1] <= YEAR_MS,
    };
  };
  type Change = ReturnType<typeof change>;

  // The yearly rules a change falls on, most conventional first, as RRULE parts after BYMONTH.
  const rulesFor = (c: Change) => {
    const daysInMonth = new Date(Date.UTC(c.year, c.month, 0)).getUTCDate();
    const shortestMonth = c.month === 2 ? 28 : daysInMonth;
    const wd = WEEKDAYS[c.weekday];
    const rules: string[] = [];
    if (c.day <= 28) rules.push(`BYDAY=${Math.ceil(c.day / 7)}${wd}`);
    if (c.day + 7 > daysInMonth) rules.push(`BYDAY=-1${wd}`);
    for (let first = Math.max(1, c.day - 6); first <= c.day; first++) {
      if (first + 6 > shortestMonth) break;
      rules.push(`BYMONTHDAY=${WEEK_FROM[first]};BYDAY=${wd}`);
    }
    rules.push(`BYMONTHDAY=${c.day}`);
    return rules;
  };

  // The day a rule gives in another year, for anchoring a rule earlier than its first change.
  const ruleDay = (year: number, month: number, rule: string) => {
    const first = momentTz.utc([year, month - 1, 1]);
    const byDay = /BYDAY=(-?\d)?(\w\w)/.exec(rule);
    const byMonthDay = /BYMONTHDAY=(\d+)/.exec(rule);
    if (!byDay) return first.date(+byMonthDay[1]);
    const weekday = WEEKDAYS.indexOf(byDay[2]);
    if (byDay[1] === '-1') {
      const last = first.clone().endOf('month').startOf('day');
      return last.subtract((last.day() - weekday + 7) % 7, 'days');
    }
    const from = byMonthDay ? +byMonthDay[1] : 7 * (+byDay[1] - 1) + 1;
    const start = first.date(from);
    return start.add((weekday - start.day() + 7) % 7, 'days');
  };

  // Section 3.6.5: an RRULE's UNTIL in a VTIMEZONE is always UTC.
  const utc = (at: number) =>
    new Date(at)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  if (!untils.length) {
    const m = momentTz(referenceDate).tz(tzId);
    const offset = formatOffset(m.utcOffset());
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${tzId}`,
      'BEGIN:STANDARD',
      `DTSTART:${anchorYear}0101T000000`,
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${m.zoneAbbr()}`,
      'END:STANDARD',
      'END:VTIMEZONE',
    ].join('\r\n');
  }

  // Runs of consecutive years whose change has the same offsets, wall clock and rule.
  type Run = { changes: Change[]; rules: string[] };
  const runsFrom = (firstChange: number) => {
    const runs: Run[] = [];
    const open = new Map<string, Run>();
    for (let i = firstChange; i < untils.length; i++) {
      const c = change(i);
      // The data stops rather than the zone, and the last change sits on the open-ended segment.
      if (c.year >= horizon) break;
      const key = [c.offsetFrom, c.offsetTo, c.name, c.time, c.month, c.daylight].join('|');
      const run = open.get(key);
      const own = rulesFor(c);
      const rules = run ? run.rules.filter((r) => own.includes(r)) : [];
      if (run && run.changes[run.changes.length - 1].year === c.year - 1 && rules.length) {
        run.changes.push(c);
        run.rules = rules;
      } else {
        const fresh = { changes: [c], rules: own };
        runs.push(fresh);
        open.set(key, fresh);
      }
    }
    return runs;
  };
  const isRule = (run: Run) => run.changes.length > 1;

  const current = untils.findIndex((u) => u > referenceDate.getTime());
  const abbrAtReference = momentTz(referenceDate).tz(tzId).zoneAbbr();
  // Every reference inside one segment gives the same component, save the abbreviation in force.
  const cacheKey = [tzId, current, anchorYear, abbrAtReference].join('|');
  if (vtimezoneCache.has(cacheKey)) return vtimezoneCache.get(cacheKey);

  // A reference in the middle of a DST year anchors the rules its two halves run on; anything else
  // starts from the offset in force at the reference.
  const inDSTYear =
    current >= 1 && isFinite(untils[current]) && untils[current] - untils[current - 1] <= YEAR_MS;
  let runs = inDSTYear ? runsFrom(current) : [];
  const anchored = runs.slice(0, 2).filter(isRule);
  if (!anchored.length) runs = runsFrom(current + 1);

  const observance = (c: Change, start: string, extra: string[]) => {
    const kind = c.daylight ? 'DAYLIGHT' : 'STANDARD';
    return [
      `BEGIN:${kind}`,
      `DTSTART:${start}`,
      ...extra,
      `TZOFFSETFROM:${formatOffset(c.offsetFrom)}`,
      `TZOFFSETTO:${formatOffset(c.offsetTo)}`,
      `TZNAME:${c.name}`,
      `END:${kind}`,
    ];
  };
  const rrule = (run: Run) => {
    const last = run.changes[run.changes.length - 1];
    // ical.js reads UNTIL back through the TZOFFSETFROM as written, so it is taken from that
    // rounded offset: America/St_Johns's -3:30:52 would otherwise drop the rule's last year.
    const untilAt = last.local.valueOf() - wholeMinutes(last.offsetFrom) * 60 * 1000;
    const until = last.year >= horizon - 1 ? '' : `;UNTIL=${utc(untilAt)}`;
    return `RRULE:FREQ=YEARLY;BYMONTH=${run.changes[0].month};${run.rules[0]}${until}`;
  };
  const stamp = (c: Change) => c.local.format('YYYYMMDD[T]HHmmss');

  const head: string[][] = [];
  if (anchored.length) {
    for (const run of anchored) {
      const first = run.changes[0];
      const day = ruleDay(anchorYear, first.month, run.rules[0]).format('YYYYMMDD');
      head.push(observance(first, `${day}T${first.time}`, [rrule(run)]));
    }
    // STANDARD first, as every other writer orders the pair.
    head.sort((a, b) => (a[0] === b[0] ? 0 : a[0] === 'BEGIN:STANDARD' ? -1 : 1));
  } else {
    const offset = formatOffset(-offsets[current]);
    head.push([
      'BEGIN:STANDARD',
      `DTSTART:${anchorYear}0101T000000`,
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${abbrAtReference}`,
      'END:STANDARD',
    ]);
  }

  // A change no rule covers joins the other one-off changes between the same offsets as an RDATE.
  // ical.js stops counting an observance's DTSTART as an onset once it has an RDATE, so the first
  // change is listed as one too.
  const tail: { at: number; block: string[] }[] = [];
  const oneOffs = new Map<string, Change[]>();
  for (const run of runs) {
    if (anchored.includes(run)) continue;
    const first = run.changes[0];
    if (isRule(run)) {
      tail.push({ at: first.at, block: observance(first, stamp(first), [rrule(run)]) });
    } else {
      const key = [first.offsetFrom, first.offsetTo, first.name, first.daylight].join('|');
      oneOffs.set(key, [...(oneOffs.get(key) || []), first]);
    }
  }
  for (const group of oneOffs.values()) {
    const rdates = group.length > 1 ? group.map((c) => `RDATE:${stamp(c)}`) : [];
    tail.push({ at: group[0].at, block: observance(group[0], stamp(group[0]), rdates) });
  }
  tail.sort((a, b) => a.at - b.at);
  const blocks = [...head, ...tail.map((t) => t.block)];

  const vtimezone = ['BEGIN:VTIMEZONE', `TZID:${tzId}`, ...blocks.flat(), 'END:VTIMEZONE'].join(
    '\r\n'
  );
  vtimezoneCache.set(cacheKey, vtimezone);
  return vtimezone;
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
