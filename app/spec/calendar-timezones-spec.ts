import ICAL from 'ical.js';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { parseICSString } from '../src/calendar-utils';
import * as ICSEventHelpers from '../src/ics-event-helpers';
import { occurrencesForEvents } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

// Mexico abolished DST in October 2022, so 12:00 in Mexico City on 1 July 2026 is 18:00Z. The
// VTIMEZONE below still describes the old rules, as invitations written from older zone databases
// do, and would read it as 17:00Z.
const STALE_MEXICO_CITY = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Mexico_City',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'DTSTART:19700405T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function calendar(lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    ...lines,
    'END:VCALENDAR',
  ].join('\r\n');
}

function vevent(tzid: string, start: string, extra: string[] = []): string[] {
  return [
    'BEGIN:VEVENT',
    'UID:zone-test@test',
    `DTSTART;TZID=${tzid}:${start}`,
    `DTEND;TZID=${tzid}:${start.replace(/T12/, 'T13')}`,
    'SUMMARY:Planning',
    'DTSTAMP:20260101T000000Z',
    ...extra,
    'END:VEVENT',
  ];
}

const startOf = (ics: string) => parseICSString(ics).event.startDate.toJSDate().toISOString();

describe('resolving a TZID', function () {
  it('reads a zone tzdata knows through tzdata, whatever VTIMEZONE the file carries', function () {
    const ics = calendar([
      ...STALE_MEXICO_CITY,
      ...vevent('America/Mexico_City', '20260701T120000'),
    ]);
    expect(startOf(ics)).toBe('2026-07-01T18:00:00.000Z');
  });

  it("never lets one file's VTIMEZONE move another file's times", function () {
    startOf(calendar([...STALE_MEXICO_CITY, ...vevent('America/Mexico_City', '20260701T120000')]));
    const withoutBody = calendar(vevent('America/Mexico_City', '20260701T120000'));
    expect(startOf(withoutBody)).toBe('2026-07-01T18:00:00.000Z');
  });

  it('reads a Windows zone name through the zone tzdata maps it to', function () {
    const ics = calendar(vevent('Pacific Standard Time', '20260701T120000'));
    expect(startOf(ics)).toBe('2026-07-01T19:00:00.000Z');
  });

  it('reads a name tzdata does not know through the VTIMEZONE the file defines', function () {
    const ics = calendar([
      'BEGIN:VTIMEZONE',
      'TZID:Customized Time Zone',
      'BEGIN:STANDARD',
      'DTSTART:16010101T000000',
      'TZOFFSETFROM:+0530',
      'TZOFFSETTO:+0530',
      'END:STANDARD',
      'END:VTIMEZONE',
      ...vevent('Customized Time Zone', '20260701T120000'),
    ]);
    expect(startOf(ics)).toBe('2026-07-01T06:30:00.000Z');
  });

  it("seeds the zone cache ical.js keeps on a file's root component", function () {
    // resolveTimezones relies on this private field to outrank a file's own VTIMEZONE. If an
    // ical.js release renames it, the first spec above fails too; this one says why.
    const { root } = parseICSString(calendar(vevent('America/Mexico_City', '20260701T120000')));
    const cache = (root as any)._timezoneCache;
    expect(cache instanceof Map).toBe(true);
    expect(cache.get('America/Mexico_City')).toBe(ICAL.TimezoneService.get('America/Mexico_City'));
  });
});

describe('expanding a zoned series', function () {
  const SERIES = calendar([
    ...STALE_MEXICO_CITY,
    ...vevent('America/Mexico_City', '20260701T120000', ['RRULE:FREQ=WEEKLY;COUNT=4']),
    'BEGIN:VEVENT',
    'UID:zone-test@test',
    'RECURRENCE-ID;TZID=America/Mexico_City:20260708T120000',
    'DTSTART;TZID=America/Mexico_City:20260708T150000',
    'DTEND;TZID=America/Mexico_City:20260708T160000',
    'SUMMARY:Planning, moved',
    'DTSTAMP:20260101T000000Z',
    'END:VEVENT',
  ]);
  const JULY_START = Date.UTC(2026, 6, 1) / 1000;
  const JULY_END = Date.UTC(2026, 7, 1) / 1000;

  it('places each occurrence where parseICSString reads the series', function () {
    const starts = ICSEventHelpers.expandBetween(SERIES, JULY_START, JULY_START, JULY_END)
      .map((e) => e.startDate.toJSDate().toISOString())
      .sort();
    expect(starts).toEqual([
      '2026-07-01T18:00:00.000Z',
      '2026-07-08T21:00:00.000Z',
      '2026-07-15T18:00:00.000Z',
      '2026-07-22T18:00:00.000Z',
    ]);
    expect(starts[0]).toBe(startOf(SERIES));
  });

  // The engine stores the whole resource on every row, the exception's included, and computes
  // recurrenceStart itself; here it is an hour out, as a stale zone reading would leave it.
  const rows = () => [
    new MailspringEvent({
      id: 'master',
      accountId: 'account-1',
      calendarId: 'calendar-1',
      icsuid: 'zone-test@test',
      ics: SERIES,
      recurrenceStart: Date.parse('2026-07-01T17:00:00Z') / 1000,
    } as any),
    new MailspringEvent({
      id: 'exception',
      accountId: 'account-1',
      calendarId: 'calendar-1',
      icsuid: 'zone-test@test',
      recurrenceId: '20260708T120000',
      ics: SERIES,
      recurrenceStart: Date.parse('2026-07-08T20:00:00Z') / 1000,
    } as any),
  ];

  it('draws an inline exception once, whatever its row says it starts at', function () {
    const shown = occurrencesForEvents(rows(), { startUnix: JULY_START, endUnix: JULY_END })
      .map((o) => `${new Date((o as any).start * 1000).toISOString()} ${o.title}`)
      .sort();
    expect(shown).toEqual([
      '2026-07-01T18:00:00.000Z Planning',
      '2026-07-08T21:00:00.000Z Planning, moved',
      '2026-07-15T18:00:00.000Z Planning',
      '2026-07-22T18:00:00.000Z Planning',
    ]);
  });

  it('draws an exception moved in from outside the window as the exception, not the master', function () {
    // The window holds the moved 15:00 but not the original 12:00 slot it replaces.
    const from = Date.parse('2026-07-08T20:30:00Z') / 1000;
    const shown = occurrencesForEvents(rows(), { startUnix: from, endUnix: from + 3600 });
    expect(shown.map((o) => o.title)).toEqual(['Planning, moved']);
  });
});
