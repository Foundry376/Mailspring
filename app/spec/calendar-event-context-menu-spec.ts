import { AccountStore } from 'mailspring-exports';
import { CalendarEventContextMenu } from '../internal_packages/main-calendar/lib/core/calendar-event-context-menu';
import {
  canRespondToEvent,
  myParticipationStatus,
} from '../internal_packages/main-calendar/lib/core/calendar-rsvp';

const ME = 'brian@example.com';

function occurrence(overrides: any = {}) {
  return {
    id: 'event-1-e1772460000',
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: 'Design Review',
    isAllDay: false,
    start: 1772460000,
    end: 1772463600,
    organizer: { email: 'ada@example.com' }, // normalised by the data source
    isMine: false,
    attendees: [
      { email: 'ada@example.com', name: 'Ada', partstat: 'ACCEPTED' },
      { email: ME, name: 'Me', partstat: 'NEEDS-ACTION' },
    ],
    ...overrides,
  } as any;
}

/** An event we organize ourselves, which is the only kind the menu offers to edit. */
function myOwnEvent(overrides: any = {}) {
  return occurrence({ organizer: { email: ME }, isMine: true, ...overrides });
}

const labels = (menu: CalendarEventContextMenu) =>
  menu
    .template()
    .map((i: any) => (i.type === 'separator' ? '---' : i.label))
    .filter((l) => l !== '---');

function menuFor(occ: any, readOnly = false) {
  return new CalendarEventContextMenu({
    occurrence: occ,
    readOnly,
    // Mirrors how MailspringCalendar derives it: a writable calendar and a meeting of ours.
    editable: !readOnly && occ.isMine,
    onOpen: () => {},
    onDelete: () => {},
    onProposeNewTime: () => {},
  });
}

describe('calendar RSVP helpers', function () {
  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) => {
      if (!email) return null;
      // Two connected accounts: only acct-1 owns the events in these fixtures.
      if (email.toLowerCase() === ME) return { id: 'acct-1' } as any;
      if (email.toLowerCase() === 'other@example.com') return { id: 'acct-2' } as any;
      return null;
    });
  });

  it('lets us answer an invitation someone else organized', function () {
    expect(canRespondToEvent(occurrence())).toBe(true);
  });

  it('does not offer an RSVP on an event we organize', function () {
    expect(canRespondToEvent(occurrence({ organizer: { email: ME } }))).toBe(false);
  });

  it('recognises us as organizer even if the address arrives as a mailto: URI', function () {
    expect(canRespondToEvent(occurrence({ organizer: { email: `mailto:${ME}` } }))).toBe(false);
  });

  it('ignores a guest line belonging to a different connected account', function () {
    // accountForEmail resolves it, but not to the account this event is synced under, so
    // answering as them would write a status that account cannot act on.
    const other = occurrence({
      attendees: [{ email: 'other@example.com', partstat: 'NEEDS-ACTION' }],
    });
    expect(canRespondToEvent(other)).toBe(false);
  });

  it('does not offer an RSVP when we are not a guest', function () {
    const notMine = occurrence({
      attendees: [{ email: 'ada@example.com', partstat: 'ACCEPTED' }],
    });
    expect(canRespondToEvent(notMine)).toBe(false);
  });

  it('reads back our own participation status', function () {
    expect(myParticipationStatus(occurrence())).toBe('NEEDS-ACTION');
    const accepted = occurrence({
      attendees: [{ email: ME, partstat: 'ACCEPTED' }],
    });
    expect(myParticipationStatus(accepted)).toBe('ACCEPTED');
  });

  it('treats a missing partstat as awaiting a response', function () {
    expect(myParticipationStatus(occurrence({ attendees: [{ email: ME }] }))).toBe('NEEDS-ACTION');
  });

  it('has no status to report when we are not a guest', function () {
    expect(myParticipationStatus(occurrence({ attendees: [] }))).toBe(null);
  });
});

describe('CalendarEventContextMenu', function () {
  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) => {
      if (!email) return null;
      // Two connected accounts: only acct-1 owns the events in these fixtures.
      if (email.toLowerCase() === ME) return { id: 'acct-1' } as any;
      if (email.toLowerCase() === 'other@example.com') return { id: 'acct-2' } as any;
      return null;
    });
  });

  it('offers viewing, the responses, a counter-proposal, and delete on an invitation', function () {
    // Not "Edit": only the organizer revises a meeting (RFC 5546 section 2.1.4). Proposing a
    // new time is the affordance that replaces editing for an attendee. Deleting is still
    // ours - that removes our own copy, it doesn't change anyone else's.
    expect(labels(menuFor(occurrence()))).toEqual([
      'View Event',
      'Accept',
      'Maybe',
      'Decline',
      'Propose New Time...',
      'Delete Event',
    ]);
  });

  it('offers a counter-proposal even on a read-only calendar', function () {
    // It only mails the organizer; there is nothing local to write, so writability is
    // irrelevant here - unlike the responses, which are disabled.
    expect(labels(menuFor(occurrence(), true))).toContain('Propose New Time...');
  });

  it('does not offer a counter-proposal on a meeting we organize', function () {
    // The organizer changes the time; they do not ask themselves for it.
    expect(labels(menuFor(myOwnEvent()))).not.toContain('Propose New Time...');
  });

  it('offers editing on a meeting we organize', function () {
    expect(labels(menuFor(myOwnEvent()))).toEqual(['Edit Event...', 'Delete Event']);
  });

  it('offers editing on an event that names no organizer', function () {
    // An event with no ORGANIZER is nobody's meeting but ours, which is what the data
    // source means by isMine - so it is editable, and there is no one to RSVP to.
    expect(labels(menuFor(occurrence({ organizer: null, isMine: true })))).toEqual([
      'Edit Event...',
      'Accept',
      'Maybe',
      'Decline',
      'Propose New Time...',
      'Delete Event',
    ]);
  });

  it('checks the response we have already given', function () {
    const accepted = occurrence({ attendees: [{ email: ME, partstat: 'ACCEPTED' }] });
    const items = menuFor(accepted).template() as any[];
    const accept = items.find((i) => i.label === 'Accept');
    const decline = items.find((i) => i.label === 'Decline');
    expect(accept.checked).toBe(true);
    expect(decline.checked).toBe(false);
  });

  it('omits the responses on an event we organize', function () {
    expect(labels(menuFor(myOwnEvent()))).toEqual(['Edit Event...', 'Delete Event']);
  });

  it('never offers editing on a read-only calendar, even for our own meeting', function () {
    expect(labels(menuFor(myOwnEvent(), true))).toEqual(['View Event']);
  });

  it('offers only viewing on a read-only calendar', function () {
    expect(labels(menuFor(occurrence(), true))).toEqual([
      'View Event',
      'Accept',
      'Maybe',
      'Decline',
      'Propose New Time...',
    ]);
  });

  it('disables the responses on a read-only calendar, since they have to be written', function () {
    const items = menuFor(occurrence(), true).template() as any[];
    expect(items.filter((i) => i.type === 'checkbox').every((i) => i.enabled === false)).toBe(true);
  });

  it('never leaves a separator dangling at either edge', function () {
    for (const menu of [
      menuFor(occurrence()),
      menuFor(occurrence(), true),
      menuFor(myOwnEvent()),
      menuFor(occurrence({ attendees: [] }), true),
    ]) {
      const items = menu.template() as any[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].type).not.toBe('separator');
      expect(items[items.length - 1].type).not.toBe('separator');
    }
  });

  it('never emits two separators in a row', function () {
    const items = menuFor(myOwnEvent()).template() as any[];
    const doubled = items.some(
      (item, i) => i > 0 && item.type === 'separator' && items[i - 1].type === 'separator'
    );
    expect(doubled).toBe(false);
  });
});
