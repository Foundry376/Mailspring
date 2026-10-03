import { counterProposalProblem } from '../internal_packages/events/lib/rsvp-target';

/*
A COUNTER arrives as an email attachment, so everything in it - the UID, the ORGANIZER, the
guest list - is written by its sender, and a UID is not a secret. Accepting one rewrites the
meeting's time and re-invites every guest, so the decision is taken from our own synced copy.
*/

const ME = 'me@example.com';
const ALIAS = 'me.alias@example.com';
const GUEST = 'guest@example.org';
const STRANGER = 'stranger@example.net';

function icsWith({ organizer, attendees }: { organizer?: string; attendees: string[] }): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:counter-uid@test',
    'DTSTART:20260622T150000Z',
    'DTEND:20260622T160000Z',
    ...(organizer ? [`ORGANIZER;CN=Organizer:mailto:${organizer}`] : []),
    ...attendees.map((a) => `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${a}`),
    'SUMMARY:Weekly Sync',
    'DTSTAMP:20260101T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

const ourMeeting = icsWith({ organizer: ME, attendees: [ME, GUEST] });

describe('counterProposalProblem', function () {
  it('allows a guest to propose a new time for a meeting we organize', function () {
    expect(counterProposalProblem({ ics: ourMeeting, senderEmail: GUEST, addresses: [ME] })).toBe(
      null
    );
  });

  it('recognises us as the organizer through an alias', function () {
    expect(
      counterProposalProblem({
        ics: icsWith({ organizer: ALIAS, attendees: [ALIAS, GUEST] }),
        senderEmail: GUEST,
        addresses: [ME, ALIAS],
      })
    ).toBe(null);
  });

  it('refuses a proposal from someone who is not on the guest list', function () {
    expect(
      counterProposalProblem({ ics: ourMeeting, senderEmail: STRANGER, addresses: [ME] })
    ).toBe('not-from-a-guest');
  });

  it('refuses a proposal from a message with no sender', function () {
    expect(counterProposalProblem({ ics: ourMeeting, senderEmail: null, addresses: [ME] })).toBe(
      'not-from-a-guest'
    );
  });

  it('refuses a meeting somebody else organizes, even when the sender is a guest', function () {
    expect(
      counterProposalProblem({
        ics: icsWith({ organizer: STRANGER, attendees: [ME, GUEST] }),
        senderEmail: GUEST,
        addresses: [ME],
      })
    ).toBe('not-our-meeting');
  });

  it('refuses an event that names no organizer', function () {
    expect(
      counterProposalProblem({
        ics: icsWith({ attendees: [ME, GUEST] }),
        senderEmail: GUEST,
        addresses: [ME],
      })
    ).toBe('not-our-meeting');
  });

  it('refuses a copy it cannot parse rather than treating it as ours', function () {
    expect(
      counterProposalProblem({
        ics: 'not an icalendar object',
        senderEmail: GUEST,
        addresses: [ME],
      })
    ).toBe('not-our-meeting');
  });
});
