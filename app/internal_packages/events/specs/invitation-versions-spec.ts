import { Message } from 'mailspring-exports';
import { copyIsBehind, newestInvitation } from '../lib/invitation-versions';

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

const own = (ics: string, minute = 11) => ({ message: email('m-own', minute), ics });

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
    const newest = newestInvitation(own(ORIGINAL), updates);
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
    const newest = newestInvitation(own(ORIGINAL), [updates[1]]);
    expect(vevents(newest.ics).length).toBe(1);
    expect(newest.message.id).toBe('m-series');
  });

  it('is null when no other email revised the invitation', function () {
    expect(
      newestInvitation(own(SERIES_CANCELLED_ONE, 15), [{ message: email('m0', 11), ics: ORIGINAL }])
    ).toBe(null);
    expect(newestInvitation(own(ORIGINAL), [])).toBe(null);
    const sameRevision = { message: email('m-copy', 12), ics: ORIGINAL };
    expect(newestInvitation(own(ORIGINAL), [sameRevision])).toBe(null);
  });

  it('breaks a tie in SEQUENCE on DTSTAMP', function () {
    const restamped = invitation('REQUEST', series(0, '20261031T030000Z'));
    const newest = newestInvitation(own(ORIGINAL), [{ message: email('m1', 30), ics: restamped }]);
    expect(vevents(newest.ics)[0]).toContain('DTSTAMP:20261031T030000Z');
  });

  it('takes nothing from replies or other events', function () {
    const others = [
      { message: email('m-reply', 20), ics: SERIES_CANCELLED_ONE.replace('REQUEST', 'REPLY') },
      {
        message: email('m-other', 22),
        ics: SERIES_CANCELLED_ONE.replace(/standup@google.com/g, 'retro@google.com'),
      },
      { message: email('m-garbled', 23), ics: 'not a calendar' },
    ];
    expect(newestInvitation(own(ORIGINAL), others)).toBe(null);
  });

  it('answers an invitation to one occurrence from mail about that occurrence alone', function () {
    const occurrence = own(invitation('REQUEST', MOVED('20261031T021320Z')), 13);
    expect(newestInvitation(occurrence, [updates[1]])).toBe(null);
    const newest = newestInvitation(occurrence, updates);
    expect(vevents(newest.ics).length).toBe(1);
    expect(vevents(newest.ics)[0]).toContain('DTSTAMP:20261031T021522Z');
    expect(newest.message.id).toBe('m-resent');
  });

  it("takes an earlier email's moved occurrence but names no update when none was sent later", function () {
    const newest = newestInvitation(own(SERIES_CANCELLED_ONE, 15), [updates[0]]);
    expect(vevents(newest.ics).length).toBe(2);
    expect(newest.message).toBe(null);
  });

  it('drops an occurrence the series cancelled or moved away from', function () {
    const MOVED_17 = MOVED('20261031T021320Z').map((l) => l.replace('20261110', '20261117'));
    const cancelled = newestInvitation(own(ORIGINAL), [
      { message: email('m-moved-17', 13), ics: invitation('REQUEST', MOVED_17) },
      updates[1],
    ]);
    expect(vevents(cancelled.ics).length).toBe(1);
    expect(cancelled.message.id).toBe('m-series');

    const rescheduled = invitation(
      'REQUEST',
      series(2, '20261031T030000Z').map((l) =>
        l.replace('T090000', 'T093000').replace('T100000', 'T103000')
      )
    );
    const moved = newestInvitation(own(ORIGINAL), [
      updates[0],
      { message: email('m-rescheduled', 30), ics: rescheduled },
    ]);
    expect(vevents(moved.ics).length).toBe(1);
    expect(moved.message.id).toBe('m-rescheduled');
  });

  describe('cancellations', function () {
    // An organizer that mails a cancelled occurrence as a CANCEL holding it, as Outlook does.
    const OCCURRENCE_17 = (sequence: number, dtstamp: string) => [
      'RECURRENCE-ID;TZID=America/Chicago:20261117T090000',
      'DTSTART;TZID=America/Chicago:20261117T090000',
      'DTEND;TZID=America/Chicago:20261117T100000',
      `DTSTAMP:${dtstamp}`,
      `SEQUENCE:${sequence}`,
    ];
    const CANCEL_17 = invitation('CANCEL', [
      ...OCCURRENCE_17(1, '20261031T021500Z'),
      'STATUS:CANCELLED',
    ]);
    const cancel17 = { message: email('m-cancel-17', 15), ics: CANCEL_17 };

    it('removes a cancelled occurrence from the series, with its override', function () {
      const MOVED_17 = invitation('REQUEST', [
        ...OCCURRENCE_17(1, '20261031T021300Z').filter((l) => !l.startsWith('DTSTART')),
        'DTSTART;TZID=America/Chicago:20261117T103000',
      ]);
      const newest = newestInvitation(own(ORIGINAL), [
        { message: email('m-moved-17', 13), ics: MOVED_17 },
        { ...cancel17, ics: CANCEL_17.replace('SEQUENCE:1', 'SEQUENCE:2') },
      ]);
      const [master, ...rest] = vevents(newest.ics);
      expect(rest.length).toBe(0);
      expect(master).toContain(EXDATE);
      expect(newest.cancelled).toBe(false);
      expect(newest.message.id).toBe('m-cancel-17');
    });

    it('lets a later invitation to a cancelled occurrence restore it', function () {
      const reinvited = invitation('REQUEST', OCCURRENCE_17(2, '20261031T030000Z'));
      const newest = newestInvitation(own(ORIGINAL), [
        cancel17,
        { message: email('m-reinvite', 30), ics: reinvited },
      ]);
      const [master, occurrence, ...rest] = vevents(newest.ics);
      expect(rest.length).toBe(0);
      expect(master).not.toContain('EXDATE');
      expect(occurrence).toContain('SEQUENCE:2');
      expect(newest.message.id).toBe('m-reinvite');
    });

    it('ignores a cancelled occurrence the series was revised after', function () {
      expect(
        newestInvitation(own(invitation('REQUEST', series(2, '20261031T030000Z')), 30), [cancel17])
      ).toBe(null);
    });

    it('reports the event cancelled by a later cancellation of the series', function () {
      const cancelled = invitation('CANCEL', [
        ...series(1, '20261031T021500Z'),
        'STATUS:CANCELLED',
      ]);
      const newest = newestInvitation(own(ORIGINAL), [
        updates[0],
        { message: email('m-cancel', 20), ics: cancelled },
      ]);
      expect(newest.cancelled).toBe(true);
      expect(vevents(newest.ics).length).toBe(1);
      expect(newest.message.id).toBe('m-cancel');
    });

    it('ignores a cancellation of the series older than this invitation', function () {
      const cancelled = invitation('CANCEL', [
        ...series(1, '20261031T021500Z'),
        'STATUS:CANCELLED',
      ]);
      expect(
        newestInvitation(own(invitation('REQUEST', series(2, '20261031T030000Z')), 30), [
          { message: email('m-cancel', 20), ics: cancelled },
        ])
      ).toBe(null);
    });
  });
});

describe('copyIsBehind', function () {
  // Our calendar's copy: what the invitation became when we added it, without METHOD.
  const stored = (...lines: string[][]) =>
    invitation('REQUEST', ...lines).replace('METHOD:REQUEST\r\n', '');
  const at = (hour: string, sequence: number, dtstamp: string, ...extra: string[]) => [
    `DTSTART;TZID=America/Chicago:20261103T${hour}0000`,
    `DTEND;TZID=America/Chicago:20261103T${hour}3000`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${sequence}`,
    ...extra,
  ];
  const ADDED = stored(at('16', 0, '20261031T212451Z'));
  const MOVED_LATER = invitation('REQUEST', at('17', 1, '20261031T213418Z'));

  it('is behind a later revision that moved the meeting, as iCloud leaves it', function () {
    expect(copyIsBehind(ADDED, MOVED_LATER)).toBe(true);
  });

  it('is behind it at the same SEQUENCE, which Yahoo raises on our own writes', function () {
    expect(copyIsBehind(stored(at('16', 1, '20261031T212451Z')), MOVED_LATER)).toBe(true);
  });

  it('is behind a later cancellation', function () {
    const cancelled = invitation('CANCEL', at('16', 1, '20261031T213418Z', 'STATUS:CANCELLED'));
    expect(copyIsBehind(ADDED, cancelled)).toBe(true);
  });

  it('is behind a moved occurrence it holds no override for', function () {
    const weekly = stored(series(0, '20261031T021135Z'));
    expect(copyIsBehind(weekly, OCCURRENCE_MOVED)).toBe(true);
    expect(
      copyIsBehind(
        stored(series(0, '20261031T021135Z'), MOVED('20261031T021320Z')),
        OCCURRENCE_MOVED
      )
    ).toBe(false);
  });

  it('is current once the server applied the revision, whatever its DTSTAMP', function () {
    expect(copyIsBehind(stored(at('17', 1, '20261031T210000Z')), MOVED_LATER)).toBe(false);
  });

  it('is current when it is the newer one', function () {
    expect(copyIsBehind(stored(at('17', 2, '20261031T220000Z')), MOVED_LATER)).toBe(false);
  });

  it("can't be ordered without a SEQUENCE, as Exchange's copies come over Graph", function () {
    const graph = ADDED.replace('SEQUENCE:0\r\n', '');
    expect(copyIsBehind(graph, MOVED_LATER)).toBe(false);
  });
});
