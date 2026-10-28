import * as ICSEventHelpers from '../src/ics-event-helpers';

// expandBetween follows ical-expander's between(). These are that package's own cases
// (ical-expander 3.2.0, test/ical-expander.js and its fixtures), run against expandBetween.
// Its floating times assumed TZ=Etc/UTC; the windows over floating fixtures here are local
// times instead, which is the same question on any runner.

const unix = (date: Date) => date.getTime() / 1000;
const iso = (time: { toJSDate(): Date }) => time.toJSDate().toISOString();
const expand = (ics: string, after: Date, before: Date) =>
  ICSEventHelpers.expandBetween(ics, unix(after), unix(after), unix(before));
const summaryOf = (entry: ICSEventHelpers.ExpandedOccurrence) =>
  ICSEventHelpers.expandedEvent(entry).summary;
const isOccurrence = (entry: ICSEventHelpers.ExpandedOccurrence) => 'item' in entry;

// ical.js issue 257: a weekly series with an EXDATE, an exception that keeps its slot, and an
// exception for the first occurrence.
const ISSUE_257 = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'BEGIN:VEVENT',
  'UID:9fda684c-373b-4f58-9fc7-6db9f06218b5',
  'SUMMARY:Test-Event',
  'RRULE:FREQ=WEEKLY;UNTIL=20160912T080000Z',
  'EXDATE:20160808T080000Z',
  'DTSTART;TZID=Europe/Berlin:20160725T100000',
  'DTEND;TZID=Europe/Berlin:20160725T110000',
  'DTSTAMP:20160728T122120Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:9fda684c-373b-4f58-9fc7-6db9f06218b5',
  'SUMMARY:Test-Event - Reccurence #2',
  'RECURRENCE-ID;TZID=Europe/Berlin:20160801T100000',
  'DTSTART;TZID=Europe/Berlin:20160801T100000',
  'DTEND;TZID=Europe/Berlin:20160801T110000',
  'DTSTAMP:20160728T115048Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:9fda684c-373b-4f58-9fc7-6db9f06218b5',
  'SUMMARY:Test-Event',
  'RECURRENCE-ID;TZID=Europe/Berlin:20160725T100000',
  'DTSTART;TZID=Europe/Berlin:20160725T100000',
  'DTEND;TZID=Europe/Berlin:20160725T113000',
  'DTSTAMP:20160728T122231Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// ical.js issue 285: the third of four weekly occurrences moved from Tuesday to Wednesday.
const ISSUE_285 = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Apple Inc.//Mac OS X 10.12.2//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'DTSTART:19810329T020000',
  'TZOFFSETTO:+0200',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'DTSTART:19961027T030000',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:99C096E7-0A03-48C2-B606-0BC558147842',
  'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=4',
  'DTEND;TZID=Europe/Berlin:20170103T100000',
  'SUMMARY:test event',
  'DTSTART;TZID=Europe/Berlin:20170103T090000',
  'DTSTAMP:20170119T180700Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:99C096E7-0A03-48C2-B606-0BC558147842',
  'DTEND;TZID=Europe/Berlin:20170118T100000',
  'SUMMARY:test event',
  'DTSTART;TZID=Europe/Berlin:20170118T090000',
  'DTSTAMP:20170119T180706Z',
  'RECURRENCE-ID;TZID=Europe/Berlin:20170117T090000',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// Floating and all-day events around 2 May 2018; the uid says which should overlap that day.
const BETWEEN_DATES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  ...[
    ['1', 'DTSTART;VALUE=DATE:20180501', 'DTEND;VALUE=DATE:20180502'],
    ['2', 'DTSTART:20180503T090000', 'DTEND:20180503T100000'],
    ['3', 'DTSTART:20180502T090000', 'DTEND:20180502T100000'],
    ['4', 'DTSTART:20180501T200000', 'DTEND:20180502T143000'],
    ['5', 'DTSTART:20180502T220000', 'DTEND:20180503T020000'],
    ['6', 'DTSTART;VALUE=DATE:20180430', 'DTEND;VALUE=DATE:20180505'],
    ['7', 'DTSTART:20180502T160000', 'DTEND:20180502T170000'],
    ['8', 'DTSTART:20180430T110000', 'DTEND:20180430T120000', 'RRULE:FREQ=DAILY;COUNT=5'],
    [
      '9',
      'DTSTART:20180430T090000',
      'DTEND:20180430T100000',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO,TU,TH,FR',
    ],
    ['10', 'DTSTART;VALUE=DATE:20180503', 'DTEND;VALUE=DATE:20180504'],
  ].flatMap(([uid, ...props]) => [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    ...props,
    'DTSTAMP:20180518T165619Z',
    'END:VEVENT',
  ]),
  'END:VCALENDAR',
].join('\r\n');

// A weekly all-day series with no end beside a one-off timed event.
const OPEN_ENDED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20170323',
  'DTEND;VALUE=DATE:20170324',
  'RRULE:FREQ=WEEKLY;BYDAY=TH',
  'DTSTAMP:20170323T230627Z',
  'UID:qdm32vss2jugkokaf9ja69pjs0@google.com',
  'SUMMARY:',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20170322T180000Z',
  'DTEND:20170322T200000Z',
  'DTSTAMP:20170323T230627Z',
  'UID:0ir2mhbf4i7m882oo4r3a23i80@google.com',
  'SUMMARY:test recurring',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// DATE values written without VALUE=DATE, which ical.js reads as a broken DATE-TIME.
const INVALID_DATES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  ...[
    [
      'Wrong dates #1',
      'DTSTART;TZID=America/Chicago:20170325',
      'DTEND;TZID=America/Chicago:20170326',
    ],
    [
      'Valid dates #1',
      'DTSTART;TZID=America/Chicago:20170624T073000',
      'DTEND;TZID=America/Chicago:20170624T130000',
    ],
    [
      'Wrong dates #3',
      'DTSTART;TZID=America/Chicago:20170702',
      'DTEND;TZID=America/Chicago:20170703',
    ],
    [
      'Valid dates #2',
      'DTSTART;TZID=America/Chicago:20160826T190000',
      'DTEND;TZID=America/Chicago:20160826T213000',
    ],
  ].flatMap(([summary, ...props], i) => [
    'BEGIN:VEVENT',
    `UID:invalid-${i}`,
    `SUMMARY:${summary}`,
    ...props,
    'DTSTAMP:20170202T143211Z',
    'END:VEVENT',
  ]),
  'END:VCALENDAR',
].join('\r\n');

describe('ICSEventHelpers.expandBetween, on the cases ical-expander covers', function () {
  it('shows an exception for the first occurrence as itself', function () {
    const entries = expand(
      ISSUE_257,
      new Date('2016-07-24T00:00:00Z'),
      new Date('2016-07-26T00:00:00Z')
    );
    expect(entries.map(summaryOf)).toEqual(['Test-Event']);
    expect(entries.filter(isOccurrence).length).toBe(0);
  });

  it('shows an exception that keeps its slot in place of that occurrence', function () {
    const entries = expand(
      ISSUE_257,
      new Date('2016-07-31T00:00:00Z'),
      new Date('2016-08-02T00:00:00Z')
    );
    expect(entries.map(summaryOf)).toEqual(['Test-Event - Reccurence #2']);
    expect(entries.filter(isOccurrence).length).toBe(0);
  });

  it('shows nothing for an occurrence an EXDATE removes', function () {
    const entries = expand(
      ISSUE_257,
      new Date('2016-08-07T00:00:00Z'),
      new Date('2016-08-10T00:00:00Z')
    );
    expect(entries).toEqual([]);
  });

  it('places a moved exception at its new time, as an occurrence of the series', function () {
    const entries = expand(
      ISSUE_285,
      new Date('2017-01-03T00:00:00Z'),
      new Date('2017-01-25T00:00:00Z')
    );
    expect(entries.every(isOccurrence)).toBe(true);
    expect(entries.map((e) => iso(e.startDate))).toEqual([
      '2017-01-03T08:00:00.000Z',
      '2017-01-10T08:00:00.000Z',
      '2017-01-18T08:00:00.000Z',
      '2017-01-24T08:00:00.000Z',
    ]);
  });

  it('finds a moved exception in a window that holds only its new time', function () {
    const entries = expand(
      ISSUE_285,
      new Date('2017-01-18T00:00:00Z'),
      new Date('2017-01-19T00:00:00Z')
    );
    expect(entries.length).toBe(1);
    expect(isOccurrence(entries[0])).toBe(true);
    expect(summaryOf(entries[0])).toBe('test event');
  });

  it('keeps expanding past an occurrence moved beyond the window', function () {
    // Not one of ical-expander's cases, and one it got wrong: it stopped at the first
    // occurrence whose moved start was past the window, so the rest of the series vanished.
    const firstMovedToMarch = ISSUE_285.replace(
      'RECURRENCE-ID;TZID=Europe/Berlin:20170117T090000',
      'RECURRENCE-ID;TZID=Europe/Berlin:20170103T090000'
    )
      .replace(
        'DTSTART;TZID=Europe/Berlin:20170118T090000',
        'DTSTART;TZID=Europe/Berlin:20170301T090000'
      )
      .replace(
        'DTEND;TZID=Europe/Berlin:20170118T100000',
        'DTEND;TZID=Europe/Berlin:20170301T100000'
      );
    const entries = expand(
      firstMovedToMarch,
      new Date('2017-01-09T00:00:00Z'),
      new Date('2017-01-25T00:00:00Z')
    );
    expect(entries.map((e) => iso(e.startDate))).toEqual([
      '2017-01-10T08:00:00.000Z',
      '2017-01-17T08:00:00.000Z',
      '2017-01-24T08:00:00.000Z',
    ]);
  });

  it('stops an endless series at the iteration budget', function () {
    // The budget grows with the window, so only one past its ceiling truncates: a thousand
    // years of a weekly series is more than 50,000 steps.
    const seriesStart = unix(new Date('2017-03-23T00:00:00Z'));
    const to = unix(new Date('3000-01-01T00:00:00Z'));
    const entries = ICSEventHelpers.expandBetween(OPEN_ENDED, seriesStart, 0, to);
    const budget = ICSEventHelpers.expansionIterationBudget(OPEN_ENDED, seriesStart, to);
    expect(budget).toBe(50000);
    expect(entries.filter(isOccurrence).length).toBe(budget);
    expect(entries.filter((e) => !isOccurrence(e)).map(summaryOf)).toEqual(['test recurring']);
  });

  it('includes every event that overlaps the window, however little', function () {
    const entries = expand(
      BETWEEN_DATES,
      new Date(2018, 4, 2, 0, 0, 0),
      new Date(2018, 4, 2, 23, 59, 59, 999)
    );
    const uids = (list: ICSEventHelpers.ExpandedOccurrence[]) =>
      list.map((e) => ICSEventHelpers.expandedEvent(e).uid).sort();
    expect(uids(entries.filter((e) => !isOccurrence(e)))).toEqual(['3', '4', '5', '6', '7']);
    expect(uids(entries.filter(isOccurrence))).toEqual(['8']);
  });

  it('reads a DATE written without VALUE=DATE as a date rather than failing', function () {
    // ical-expander could only drop these (skipInvalidDates); parseICSString repairs them.
    const entries = expand(
      INVALID_DATES,
      new Date('2016-01-01T00:00:00Z'),
      new Date('2018-01-01T00:00:00Z')
    );
    expect(entries.map(summaryOf).sort()).toEqual([
      'Valid dates #1',
      'Valid dates #2',
      'Wrong dates #1',
      'Wrong dates #3',
    ]);
    const wrong = entries.find((e) => summaryOf(e) === 'Wrong dates #1');
    expect(wrong.startDate.isDate).toBe(true);
  });
});
