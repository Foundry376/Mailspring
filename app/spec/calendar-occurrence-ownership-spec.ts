import { AccountStore, Event } from 'mailspring-exports';
import { occurrencesForEvents } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

/*
Whether an occurrence is "mine" decides editing and, with the organizer-only rules, dragging;
"pending" decides the styling of an invitation still to answer. Both are read against the
account the event belongs to, not against every connected account.
*/

const ME = 'me@example.com';
const MY_OTHER_ACCOUNT = 'other@example.net';

function eventWith(lines: string[]): Event {
  return new Event({
    id: 'e1',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    icsuid: 'uid@test',
    recurrenceStart: Date.UTC(2026, 2, 10, 14) / 1000,
    recurrenceEnd: Date.UTC(2026, 2, 10, 15) / 1000,
    ics: [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'UID:uid@test',
      'DTSTART:20260310T140000Z',
      'DTEND:20260310T150000Z',
      'SUMMARY:Planning',
      'DTSTAMP:20260101T000000Z',
      ...lines,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  } as any);
}

const window = { startUnix: Date.UTC(2026, 2, 9) / 1000, endUnix: Date.UTC(2026, 2, 12) / 1000 };
const only = (event: Event) => occurrencesForEvents([event], window)[0];

describe('occurrence ownership', function () {
  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) => {
      const lowered = email.toLowerCase();
      if (lowered === ME) return { id: 'acct-1', emailAddress: ME } as any;
      if (lowered === MY_OTHER_ACCOUNT)
        return { id: 'acct-2', emailAddress: MY_OTHER_ACCOUNT } as any;
      return null;
    });
  });

  it('is mine when the organizer is the account the event belongs to', function () {
    expect(only(eventWith([`ORGANIZER:mailto:${ME}`])).isMine).toBe(true);
  });

  it('is mine when the event names no organizer, since nobody invited me to it', function () {
    expect(only(eventWith([])).isMine).toBe(true);
  });

  it('is not mine when somebody else organizes it', function () {
    expect(only(eventWith(['ORGANIZER:mailto:ada@example.com'])).isMine).toBe(false);
  });

  it('is not mine when another of my connected accounts organizes it', function () {
    expect(only(eventWith([`ORGANIZER:mailto:${MY_OTHER_ACCOUNT}`])).isMine).toBe(false);
  });

  it('is pending while this account has not answered', function () {
    expect(
      only(
        eventWith([
          'ORGANIZER:mailto:ada@example.com',
          `ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:${ME}`,
        ])
      ).isPending
    ).toBe(true);
  });

  it('is not pending because another of my accounts has not answered', function () {
    expect(
      only(
        eventWith([
          'ORGANIZER:mailto:ada@example.com',
          `ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:${MY_OTHER_ACCOUNT}`,
          `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${ME}`,
        ])
      ).isPending
    ).toBe(false);
  });
});
