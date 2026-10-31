import { Message } from 'mailspring-exports';
import { newestInvitation } from '../lib/invitation-versions';

// The shapes Google mailed for one weekly series (October 2026): the invitation, then the
// 10 November meeting moved to 10:30 as a REQUEST about that occurrence alone, then the series
// again with 17 November cancelled by an EXDATE, then the moved occurrence once more.
const CHICAGO = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Chicago',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

const GUESTS = [
  'ORGANIZER;CN=Mark:mailto:mark@example.com',
  'ATTENDEE;PARTSTAT=ACCEPTED:mailto:mark@example.com',
  'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com',
];

const invitation = (method: string, ...vevents: string[][]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    `METHOD:${method}`,
    ...CHICAGO,
    ...vevents.flatMap((lines) => [
      'BEGIN:VEVENT',
      'UID:standup@google.com',
      ...lines,
      ...GUESTS,
      'SUMMARY:Standup',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');

const series = (sequence: number, dtstamp: string, ...extra: string[]) => [
  'DTSTART;TZID=America/Chicago:20261103T090000',
  'DTEND;TZID=America/Chicago:20261103T100000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU',
  ...extra,
  `DTSTAMP:${dtstamp}`,
  `SEQUENCE:${sequence}`,
];
const MOVED = (dtstamp: string) => [
  'RECURRENCE-ID;TZID=America/Chicago:20261110T090000',
  'DTSTART;TZID=America/Chicago:20261110T103000',
  'DTEND;TZID=America/Chicago:20261110T113000',
  `DTSTAMP:${dtstamp}`,
  'SEQUENCE:1',
];

const ORIGINAL = invitation('REQUEST', series(0, '20261031T021135Z'));
const OCCURRENCE_MOVED = invitation('REQUEST', MOVED('20261031T021320Z'));
const EXDATE = 'EXDATE;TZID=America/Chicago:20261117T090000';
const SERIES_CANCELLED_ONE = invitation('REQUEST', series(1, '20261031T021507Z', EXDATE));
const OCCURRENCE_RESENT = invitation('REQUEST', MOVED('20261031T021522Z'));

const email = (id: string, minute: number) =>
  new Message({ id, accountId: 'a1', date: new Date(Date.UTC(2026, 9, 31, 2, minute)) } as any);

const vevents = (ics: string) =>
  ics
    .replace(/\r\n[ \t]/g, '')
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((v) => v.split('END:VEVENT')[0]);

describe('newestInvitation', function () {
  const updates = [
    { message: email('m-moved', 13), ics: OCCURRENCE_MOVED },
    { message: email('m-series', 15), ics: SERIES_CANCELLED_ONE },
    { message: email('m-resent', 16), ics: OCCURRENCE_RESENT },
  ];

  it('assembles the series and its moved occurrence from the emails that revised them', function () {
    const newest = newestInvitation(ORIGINAL, updates);
    const [master, moved, ...rest] = vevents(newest.ics);
    expect(rest.length).toBe(0);
    expect(master).toContain(EXDATE);
    expect(master).toContain('SEQUENCE:1');
    expect(moved).toContain('RECURRENCE-ID;TZID=America/Chicago:20261110T090000');
    expect(moved).toContain('DTSTART;TZID=America/Chicago:20261110T103000');
    expect(moved).toContain('DTSTAMP:20261031T021522Z');
    expect(newest.ics).toContain('METHOD:REQUEST');
    expect(newest.ics.match(/BEGIN:VTIMEZONE/g).length).toBe(1);
    expect(newest.message.id).toBe('m-resent');
  });

  it('names the email the series came from when only the series was revised', function () {
    const newest = newestInvitation(ORIGINAL, [updates[1]]);
    expect(vevents(newest.ics).length).toBe(1);
    expect(newest.message.id).toBe('m-series');
  });

  it('is null when no other email revised the invitation', function () {
    expect(
      newestInvitation(SERIES_CANCELLED_ONE, [{ message: email('m0', 11), ics: ORIGINAL }])
    ).toBe(null);
    expect(newestInvitation(ORIGINAL, [])).toBe(null);
    const sameRevision = { message: email('m-copy', 12), ics: ORIGINAL };
    expect(newestInvitation(ORIGINAL, [sameRevision])).toBe(null);
  });

  it('breaks a tie in SEQUENCE on DTSTAMP', function () {
    const restamped = invitation('REQUEST', series(0, '20261031T030000Z'));
    const newest = newestInvitation(ORIGINAL, [{ message: email('m1', 30), ics: restamped }]);
    expect(vevents(newest.ics)[0]).toContain('DTSTAMP:20261031T030000Z');
  });

  it('takes nothing from replies, cancellations or other events', function () {
    const others = [
      { message: email('m-reply', 20), ics: SERIES_CANCELLED_ONE.replace('REQUEST', 'REPLY') },
      { message: email('m-cancel', 21), ics: SERIES_CANCELLED_ONE.replace('REQUEST', 'CANCEL') },
      {
        message: email('m-other', 22),
        ics: SERIES_CANCELLED_ONE.replace(/standup@google.com/g, 'retro@google.com'),
      },
      { message: email('m-garbled', 23), ics: 'not a calendar' },
    ];
    expect(newestInvitation(ORIGINAL, others)).toBe(null);
  });

  it('answers an invitation to one occurrence from mail about that occurrence alone', function () {
    const own = invitation('REQUEST', MOVED('20261031T021320Z'));
    expect(newestInvitation(own, [updates[1]])).toBe(null);
    const newest = newestInvitation(own, updates);
    expect(vevents(newest.ics).length).toBe(1);
    expect(vevents(newest.ics)[0]).toContain('DTSTAMP:20261031T021522Z');
    expect(newest.message.id).toBe('m-resent');
  });
});
