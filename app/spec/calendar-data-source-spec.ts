// Import the function under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import { Event as MailspringEvent } from '../src/flux/models/event';
import { occurrencesForEvents } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

// All-day-ness comes from the ICS DATE type, not from duration — a one-day all-day event
// is only 82800 seconds long across a spring-forward transition, which a duration test
// reads as timed. Only the long-timed-event case below can show that in any timezone.
function makeEvent(ics: string, overrides: Partial<MailspringEvent> = {}): MailspringEvent {
  return new MailspringEvent({
    id: 'event-1',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    icsuid: 'uid@test',
    ics,
    ...overrides,
  } as any);
}

function icsFor(dtstart: string, dtend: string, extra = ''): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:uid@test',
    dtstart,
    dtend,
    extra,
    'SUMMARY:Test Event',
    'DTSTAMP:20260101T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Expand across the whole of 2026 and return the occurrences found */
function expand(event: MailspringEvent) {
  return occurrencesForEvents([event], {
    startUnix: new Date(2026, 0, 1).getTime() / 1000,
    endUnix: new Date(2027, 0, 1).getTime() / 1000,
  });
}

describe('occurrencesForEvents isAllDay classification', function () {
  it('treats a DATE-valued event as all-day on an ordinary day', function () {
    const [occ] = expand(
      makeEvent(icsFor('DTSTART;VALUE=DATE:20260622', 'DTEND;VALUE=DATE:20260623'))
    );
    expect(occ.isAllDay).toBe(true);
  });

  it('does not treat a long timed event as all-day', function () {
    const [occ] = expand(makeEvent(icsFor('DTSTART:20260622T090000Z', 'DTEND:20260623T170000Z')));
    expect(occ.end - occ.start).toBeGreaterThan(86400);
    expect(occ.isAllDay).toBe(false);
  });

  it('does not treat a short timed event as all-day', function () {
    const [occ] = expand(makeEvent(icsFor('DTSTART:20260622T140000Z', 'DTEND:20260622T150000Z')));
    expect(occ.isAllDay).toBe(false);
  });

  it('classifies every occurrence of a recurring all-day series', function () {
    // Weekly from Mar 1 covers Mar 8, the 23-hour day
    const occurrences = expand(
      makeEvent(
        icsFor(
          'DTSTART;VALUE=DATE:20260301',
          'DTEND;VALUE=DATE:20260302',
          'RRULE:FREQ=WEEKLY;COUNT=4'
        )
      )
    );
    expect(occurrences.length).toBe(4);
    occurrences.forEach((occ) => expect(occ.isAllDay).toBe(true));
  });
});
