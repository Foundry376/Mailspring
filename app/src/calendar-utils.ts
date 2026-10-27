import { AccountStore, Calendar, Event, Matcher, RegExpUtils, Utils } from 'mailspring-exports';
import { findOneIana } from 'windows-iana';

type ICAL = typeof import('ical.js').default;
type ICALComponent = InstanceType<ICAL['Component']>;
type ICALProperty = InstanceType<ICAL['Property']>;
type ICALEvent = InstanceType<ICAL['Event']>;
type ICALTimezone = InstanceType<ICAL['Timezone']>;

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
  resolveTimezones(root);
  const event = new ICAL.Event(root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent'));
  return { root, event };
}

const WHOLE_HISTORY = new Date(Date.UTC(1601, 0, 1));
const UTC_NAMES = ['utc', 'gmt', 'etc/utc', 'etc/gmt', 'z'];
const knownZones = new Map<string, ICALTimezone | null>();

/**
 * The zone tzdata gives a TZID, or null when resolveIanaZone cannot place it. One zone serves
 * every file that names it, so it describes the zone's whole history, and it is written into no
 * file, so it keeps tzdata's forecast too. It is registered under the TZID as written for
 * components detached from their file (an exception copied out of its series), which ical.js
 * resolves through the TimezoneService alone.
 */
function knownZone(tzid: string): ICALTimezone | null {
  if (UTC_NAMES.includes(tzid.trim().toLowerCase())) return ICAL.Timezone.utcTimezone;
  if (!knownZones.has(tzid)) {
    const vtimezone = createVTIMEZONEString(tzid, WHOLE_HISTORY, Infinity);
    const component = vtimezone
      ? new ICAL.Component(
          ICAL.parse(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${vtimezone}\r\nEND:VCALENDAR`)
        ).getFirstSubcomponent('vtimezone')
      : null;
    knownZones.set(tzid, component ? new ICAL.Timezone({ component, tzid }) : null);
  }
  const zone = knownZones.get(tzid);
  if (zone && ICAL.TimezoneService.get(tzid) !== zone) ICAL.TimezoneService.register(zone, tzid);
  return zone;
}

/**
 * Settles the zone every TZID in a calendar object reads through, before any of its times is
 * read: a value keeps the zone it was first read with. This is the one place the app resolves a
 * TZID, in the order the sync engine does:
 *
 * 1. A name tzdata knows (IANA, or a Windows name Outlook writes; see resolveIanaZone) or a UTC
 *    name reads through moment-timezone's tzdata, whatever VTIMEZONE the file carries. A sender's
 *    VTIMEZONE is a copy of some zone database as of when it was written, and those go stale:
 *    Mexico abolished DST in 2022, and invitations still describe it. Thunderbird and
 *    sabre/vobject resolve a known name from their own tables the same way.
 * 2. Any other name reads through the file's own VTIMEZONE (RFC 5545 section 3.2.19), which
 *    ical.js finds itself. It is also registered process-wide as a fallback for detached
 *    components, but never under a name tzdata knows, so no file can move another's times.
 * 3. Anything else reads as floating local time.
 *
 * ical.js asks the root component's getTimeZoneByID before the TimezoneService
 * (Time.fromDateTimeString), so step 1 seeds the root's zone cache. That cache is private to
 * ical.js; calendar-timezones-spec fails if a release renames it.
 */
function resolveTimezones(root: ICALComponent): void {
  const isCalendar = root.name === 'vcalendar';
  const fileZones = isCalendar ? root.getAllSubcomponents('vtimezone') : [];
  const components = isCalendar
    ? root.getAllSubcomponents().filter((c) => c.name !== 'vtimezone')
    : [root];

  const tzids = new Set(fileZones.map((vtz) => String(vtz.getFirstPropertyValue('tzid'))));
  for (const component of components) {
    for (const prop of component.getAllProperties()) {
      const tzid = prop.getParameter('tzid');
      if (typeof tzid === 'string') tzids.add(tzid);
    }
  }

  const rootZoneCache = (root as unknown as { _timezoneCache?: Map<string, ICALTimezone> })
    ._timezoneCache;
  for (const tzid of tzids) {
    const zone = knownZone(tzid);
    if (zone) rootZoneCache?.set(tzid, zone);
  }
  for (const vtz of fileZones) {
    if (!knownZone(String(vtz.getFirstPropertyValue('tzid')))) ICAL.TimezoneService.register(vtz);
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
 * The IANA zone whose rules a TZID describes, or null if none can be identified.
 *
 * A TZID is an opaque name (RFC 5545 section 3.2.19), and Outlook and Exchange write Windows
 * zone names: "Central Standard Time" rather than "America/Chicago". moment-timezone has no
 * data for those, and `moment().tz('Central Standard Time')` logs an error and hands back a
 * moment in the machine's own zone, so an event authored in Outlook and edited here would be
 * rewritten at the wrong wall clock by the difference between the two. windows-iana carries
 * the CLDR mapping that closes it. What it does not carry are the display names Outlook also
 * writes, "(UTC-06:00) Central Time (US & Canada)" and "Customized Time Zone" among them, which
 * fall through to null.
 *
 * UTC and its aliases are refused as well, so the writers take their UTC path: a trailing Z is the
 * form RFC 5545 section 3.3.5 gives UTC, and needs no VTIMEZONE. A machine whose moment.tz.guess()
 * is 'UTC' reaches this.
 */
export function resolveIanaZone(tzId: string): string | null {
  if (!tzId) return null;
  if (UTC_NAMES.includes(tzId.trim().toLowerCase())) return null;
  const momentTz = require('moment-timezone');
  if (momentTz.tz.zone(tzId)) return tzId;
  const mapped = findOneIana(tzId);
  return mapped && momentTz.tz.zone(mapped) ? mapped : null;
}

// "2,3,4,5,6,7,8" for 2: the days of a week-long BYMONTHDAY window starting on each day.
const WEEK_FROM = Array.from({ length: 29 }, (_, first) =>
  Array.from({ length: 7 }, (__, k) => first + k).join(',')
);
// "26,27,28,29,30,31" for 26 and 31: a window the month's end or start cuts short.
const DAYS_FROM_TO = Array.from({ length: 32 }, (_, from) =>
  Array.from({ length: 32 }, (__, to) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (___, k) => from + k).join(',')
  )
);
const vtimezoneCache = new Map<string, string>();
const ENUMERATED_YEARS = 10;

/**
 * Builds a VTIMEZONE describing an IANA zone's offset rules.
 *
 * RFC 5545 section 3.2.19 requires a VTIMEZONE for every TZID an object references, and
 * section 3.6.5 makes it the authority for resolving those times. Servers with their own zone
 * database resolve by TZID name and ignore the body, but ical.js, and every recipient reading
 * the object directly, compute from what is written here: a body claiming one fixed offset puts
 * every occurrence on the other side of a DST transition an hour out.
 *
 * Every offset change moment-timezone knows from the segment before the reference's to
 * `enumeratedYears` past it is written, so a time in that span reads exactly as moment reads it.
 * Years whose change falls on the same yearly rule share one RRULE: the nth or last weekday of a
 * month (the US, the EU), a weekday on or after a date (America/Santiago's Sunday on or after 2
 * September), a weekday among days the month's end or start cuts short, or a fixed date. A rule
 * that stops carries UNTIL at its last change, and the rule the data runs out on carries none.
 * A change no rule covers is an RDATE: Morocco's Ramadan suspensions, Asia/Tehran's 21 March in
 * leap years, a final year whose date drifted (America/Asuncion's 24 March 2024).
 *
 * Past that span a zone continues only if every later change falls on a rule already in force;
 * otherwise the offset in force at its end holds. The rest is tzdata's forecast, which governments
 * revise (Asia/Gaza's Ramadan-dependent changes run to 2086), and this component is the authority
 * for readers that honour it.
 *
 * The rules in force at `referenceDate` start in 1970, the anchor vzic and Mozilla's zone
 * database use, rather than at their real first year: ical.js matches a date before the earliest
 * DTSTART to no rule and reads its wall clock as UTC, and a created event's component should look
 * like everyone else's two-rule zone. An earlier `referenceDate` anchors in the year before it, so
 * the component can describe a zone's whole history.
 *
 * @param tzId - Timezone identifier, IANA or a Windows name Outlook wrote (see resolveIanaZone).
 *   It is reproduced verbatim as the component's TZID: an Exchange server understands its own
 *   names, and RFC 5545 asks only that whatever name is used be defined in the same object.
 * @param referenceDate - The instant the component is written for
 * @param enumeratedYears - How far either side of the reference changes are written
 * @returns A VTIMEZONE ICS string (no surrounding VCALENDAR wrapper), or null when the
 *   identifier names no zone we can describe; inventing rules for it would be worse than
 *   leaving the calendar's own component alone.
 */
export function createVTIMEZONEString(
  tzId: string,
  referenceDate: Date,
  enumeratedYears = ENUMERATED_YEARS
): string | null {
  const momentTz = require('moment-timezone');
  const zoneId = resolveIanaZone(tzId);
  if (!zoneId) return null;
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
  const zone = momentTz.tz.zone(zoneId);
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
  const enumeratedSpan = enumeratedYears * 365.2425 * 24 * 60 * 60 * 1000;
  const enumeratedFrom = referenceDate.getTime() - enumeratedSpan;
  const enumeratedUntil = referenceDate.getTime() + enumeratedSpan;
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
    // A window the month's end or start cuts short, so some years hold no such weekday:
    // Africa/Cairo changes after the last Thursday of October, on the Friday of its last six days
    // or 1 November. Days count from the start, since ical.js expands a negative BYMONTHDAY with
    // BYDAY to nothing; February's end moves, so it has none.
    for (let first = daysInMonth - 5; c.month !== 2 && first <= c.day; first++) {
      rules.push(`BYMONTHDAY=${DAYS_FROM_TO[first][daysInMonth]};BYDAY=${wd}`);
    }
    for (let last = c.day; last <= 6; last++) {
      rules.push(`BYMONTHDAY=${DAYS_FROM_TO[1][last]};BYDAY=${wd}`);
    }
    rules.push(`BYMONTHDAY=${c.day}`);
    return rules;
  };

  // The day a rule gives in a year, or null in a year it skips.
  const ruleDate = (year: number, month: number, rule: string) => {
    const first = momentTz.utc([year, month - 1, 1]);
    const daysInMonth = first.daysInMonth();
    const byDay = /BYDAY=(-?\d)?(\w\w)/.exec(rule);
    const byMonthDay = /BYMONTHDAY=([\d,]+)/.exec(rule);
    const days = byMonthDay
      ? byMonthDay[1]
          .split(',')
          .map(Number)
          .filter((d) => d <= daysInMonth)
      : [];
    if (!byDay) return days.length ? first.date(days[0]) : null;
    const weekday = WEEKDAYS.indexOf(byDay[2]);
    if (byMonthDay) {
      const day = days.find((d) => first.clone().date(d).day() === weekday);
      return day ? first.date(day) : null;
    }
    if (byDay[1] === '-1') {
      const last = first.clone().endOf('month').startOf('day');
      return last.subtract((last.day() - weekday + 7) % 7, 'days');
    }
    const start = first.date(7 * (+byDay[1] - 1) + 1);
    return start.add((weekday - start.day() + 7) % 7, 'days');
  };
  const skips = (rule: string, month: number, fromYear: number, toYear: number) => {
    for (let year = fromYear; year <= toYear; year++) {
      if (ruleDate(year, month, rule)) return false;
    }
    return true;
  };

  // Section 3.6.5: an RRULE's UNTIL in a VTIMEZONE is always UTC.
  const utc = (at: number) =>
    new Date(at)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  if (!untils.length) {
    const m = momentTz(referenceDate).tz(zoneId);
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

  // Runs of years whose change has the same offsets, wall clock and rule, and whose rule gives no
  // day in the years between them.
  type Run = { changes: Change[]; rules: string[] };
  const ruleKey = (c: Change) =>
    [c.offsetFrom, c.offsetTo, c.name, c.time, c.month, c.daylight].join('|');
  const lastOf = (run: Run) => run.changes[run.changes.length - 1];
  const runsOut = (run: Run) =>
    skips(run.rules[0], lastOf(run).month, lastOf(run).year + 1, horizon - 1);
  const runsFrom = (firstChange: number) => {
    const runs: Run[] = [];
    const open = new Map<string, Run>();
    for (let i = firstChange; i < untils.length; i++) {
      const c = change(i);
      // The data stops rather than the zone, and the last change sits on the open-ended segment.
      if (c.year >= horizon) break;
      const key = ruleKey(c);
      const run = open.get(key);
      const own = rulesFor(c);
      const after = run ? lastOf(run).year : c.year;
      const rules =
        run && c.year > after
          ? run.rules.filter((r) => own.includes(r) && skips(r, c.month, after + 1, c.year - 1))
          : [];
      if (rules.length) {
        run.changes.push(c);
        run.rules = rules;
      } else {
        const fresh = { changes: [c], rules: own };
        runs.push(fresh);
        open.set(key, fresh);
      }
    }
    // Past the enumerated years a zone continues only on rules already in force; anything else
    // there is forecast, so the offset in force at the end holds instead.
    const beyond = runs.filter((run) => lastOf(run).at > enumeratedUntil);
    if (beyond.every((run) => runsOut(run) && run.changes[0].at <= enumeratedUntil)) return runs;
    return runs
      .map((run) => ({ ...run, changes: run.changes.filter((c) => c.at <= enumeratedUntil) }))
      .filter((run) => run.changes.length);
  };
  const isRule = (run: Run) => run.changes.length > 1;

  const current = untils.findIndex((u) => u > referenceDate.getTime());
  const abbrAtReference = momentTz(referenceDate).tz(zoneId).zoneAbbr();
  // Every reference inside one segment gives the same component, save the abbreviation in force.
  const span = [enumeratedFrom, enumeratedUntil].map((t) => untils.findIndex((u) => u > t));
  const cacheKey = [tzId, current, ...span, anchorYear, abbrAtReference].join('|');
  if (vtimezoneCache.has(cacheKey)) return vtimezoneCache.get(cacheKey);

  // A reference in the middle of a DST year anchors the rules its two halves run on. Anything else
  // starts with the changes into its segment and the one before, those inside the span:
  // Asia/Tokyo's 1951 summer stays out of a component written today.
  const inDSTYear =
    current >= 1 && isFinite(untils[current]) && untils[current] - untils[current - 1] <= YEAR_MS;
  let runs = inDSTYear ? runsFrom(current) : [];
  const anchored = runs.slice(0, 2).filter(isRule);
  let firstChange = current + 1;
  while (firstChange - 1 >= Math.max(1, current - 1) && untils[firstChange - 2] >= enumeratedFrom) {
    firstChange--;
  }
  if (!anchored.length) runs = runsFrom(firstChange);

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
    const until = runsOut(run) ? '' : `;UNTIL=${utc(untilAt)}`;
    return `RRULE:FREQ=YEARLY;BYMONTH=${run.changes[0].month};${run.rules[0]}${until}`;
  };
  const stamp = (c: Change) => c.local.format('YYYYMMDD[T]HHmmss');

  // The rules projected back from the reference miss a previous change on another date: the US
  // left DST on 29 October 2006, a week before the rule it adopted in 2007 gives.
  if (anchored.length && current >= 2 && untils[current - 2] >= enumeratedFrom) {
    const before = change(current - 1);
    const onRule = anchored.some(
      (run) =>
        ruleKey(run.changes[0]) === ruleKey(before) &&
        ruleDate(before.year, before.month, run.rules[0])?.date() === before.day
    );
    if (!onRule) runs.unshift({ changes: [before], rules: [] });
  }

  const head: string[][] = [];
  if (anchored.length) {
    for (const run of anchored) {
      const first = run.changes[0];
      let year = anchorYear;
      while (!ruleDate(year, first.month, run.rules[0])) year++;
      const day = ruleDate(year, first.month, run.rules[0]).format('YYYYMMDD');
      head.push(observance(first, `${day}T${first.time}`, [rrule(run)]));
    }
    // STANDARD first, as every other writer orders the pair.
    head.sort((a, b) => (a[0] === b[0] ? 0 : a[0] === 'BEGIN:STANDARD' ? -1 : 1));
  } else {
    const offset = formatOffset(-offsets[firstChange - 1]);
    // Opens before the first change written, which for a reference in the 1970s can predate 1970.
    const opening =
      firstChange < untils.length ? Math.min(anchorYear, change(firstChange).year - 1) : anchorYear;
    head.push([
      'BEGIN:STANDARD',
      `DTSTART:${opening}0101T000000`,
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${firstChange - 1 === current ? abbrAtReference : names[firstChange - 1]}`,
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

/**
 * DAV:owner (RFC 3744 section 5.1) when the server gave one. Otherwise the calendar is ours when
 * it is named after one of the account's addresses, as Google and Fastmail name the default one.
 */
export function isOwnCalendar(calendar: Calendar, addresses: string[]): boolean {
  if (calendar.ownership === 'mine') return true;
  if (calendar.ownership === 'other') return false;
  return addresses.some((address) => Utils.emailIsEquivalent(calendar.name, address));
}

/**
 * True only when the server named an owner and it was not us. Unlike `!isOwnCalendar`, a
 * calendar the server said nothing about is not ruled out.
 */
export function isSomeoneElsesCalendar(calendar: Calendar | undefined | null): boolean {
  return !!calendar && calendar.ownership === 'other';
}

/**
 * Stored events whose span touches the range: one-off events, and recurring masters whose series
 * (recurrenceStart..recurrenceEnd) overlaps it, which the caller then expands into occurrences.
 */
export function eventsInRangeMatcher(startUnix: number, endUnix: number) {
  const end = Event.attributes.recurrenceEnd;
  const start = Event.attributes.recurrenceStart;
  return new Matcher.Or([
    new Matcher.And([start.lte(endUnix), end.gte(startUnix)]),
    new Matcher.And([start.lte(endUnix), start.gte(startUnix)]),
    new Matcher.And([end.gte(startUnix), end.lte(endUnix)]),
    new Matcher.And([end.gte(endUnix), start.lte(startUnix)]),
  ]);
}

/** The id an occurrence expanded from `eventId`'s ICS is drawn under; a move gives it a new one. */
export function occurrenceId(eventId: string, start: number): string {
  return `${eventId}-e${Math.round(start)}`;
}

/**
 * The stored event and start an occurrence id names. The start can be negative (an event before
 * 1970); an id without the suffix is an event id already, and comes back with a null start.
 */
export function parseOccurrenceId(id: string): { eventId: string; start: number | null } {
  const match = id.match(/^(.+)-e(-?\d+)$/);
  return match ? { eventId: match[1], start: Number(match[2]) } : { eventId: id, start: null };
}

/** Video meeting providers, by a pattern their links match and the name to show for them. */
const MEETING_URL_PATTERNS: { pattern: RegExp; display: string }[] = [
  { pattern: /zoom\.us/i, display: 'zoom.us' },
  { pattern: /meet\.google\.com/i, display: 'meet.google.com' },
  { pattern: /teams\.microsoft\.com/i, display: 'teams.microsoft.com' },
  { pattern: /teams\.live\.com/i, display: 'teams.live.com' },
  { pattern: /webex\.com/i, display: 'webex.com' },
  { pattern: /gotomeeting\.com/i, display: 'gotomeeting.com' },
  { pattern: /whereby\.com/i, display: 'whereby.com' },
  { pattern: /around\.co/i, display: 'around.co' },
  { pattern: /meet\.jit\.si/i, display: 'meet.jit.si' },
  { pattern: /discord\.gg/i, display: 'discord.gg' },
  { pattern: /slack\.com\/calls/i, display: 'slack.com' },
  { pattern: /chime\.aws/i, display: 'chime.aws' },
  { pattern: /bluejeans\.com/i, display: 'bluejeans.com' },
  { pattern: /appear\.in/i, display: 'appear.in' },
  { pattern: /livestorm\.co/i, display: 'livestorm.co' },
  { pattern: /hopin\.com/i, display: 'hopin.com' },
  { pattern: /loom\.com/i, display: 'loom.com' },
  { pattern: /tuple\.app/i, display: 'tuple.app' },
  { pattern: /pop\.com/i, display: 'pop.com' },
  { pattern: /cal\.com/i, display: 'cal.com' },
  { pattern: /calendly\.com/i, display: 'calendly.com' },
  { pattern: /facetime:/i, display: 'FaceTime' },
];

const LINK_IN_TEXT = /(?:https?:\/\/|facetime:)[^\s<>"')\]]+/gi;

/** The first video meeting link in an event's location or description, or null. */
export function extractMeetingUrl(location: string, description: string): string | null {
  const links = `${location || ''} ${description || ''}`.match(LINK_IN_TEXT) || [];
  return (
    links.find((link) => MEETING_URL_PATTERNS.some(({ pattern }) => pattern.test(link))) || null
  );
}

/**
 * The meeting provider's name ("zoom.us", "FaceTime") from an event's location or description,
 * falling back on the domain of any link in the location. Null when there is neither.
 */
export function extractMeetingDomain(location: string, description: string): string | null {
  const textToSearch = `${location || ''} ${description || ''}`;
  for (const { pattern, display } of MEETING_URL_PATTERNS) {
    if (pattern.test(textToSearch)) {
      return display;
    }
  }
  const urlMatch = (location || '').match(/https?:\/\/([^/\s]+)/i);
  return urlMatch ? urlMatch[1].toLowerCase().replace(/^www\./, '') : null;
}
