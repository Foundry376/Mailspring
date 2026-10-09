import {
  AccountStore,
  Actions,
  Calendar,
  Contact,
  DatabaseStore,
  Event,
  ICSEventHelpers,
} from 'mailspring-exports';
import { FULL_GRANT } from '../../mcp-server/lib/capabilities/grant';
import { ViewGrant, ViewPermission } from '../lib/bridge/grant';
import { conferenceUrl, eventIdOf, freeBusy, parseRange } from '../lib/bridge/events';
import {
  createEvent,
  deleteEvent,
  listCalendars,
  otherParticipants,
  rsvp,
  updateEvent,
} from '../lib/bridge/calendar';

const grantWith = (permissions: ViewPermission[]): ViewGrant => ({
  viewId: 'spec',
  namespace: 'view:spec',
  permissions: new Set(permissions),
  scope: FULL_GRANT,
});
const WRITE = grantWith(['calendar.read', 'calendar.write']);

async function errorFrom(fn: () => any) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

const ME = 'me@example.com';

function invitationICS({ attendees = [ME, 'guest@example.com'], recurring = false } = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:abc@example.com',
    'DTSTAMP:20261001T000000Z',
    'DTSTART:20261012T170000Z',
    'DTEND:20261012T180000Z',
    'SUMMARY:Planning',
    ...(recurring ? ['RRULE:FREQ=WEEKLY'] : []),
    'ORGANIZER:mailto:boss@example.com',
    ...attendees.map((a) => `ATTENDEE;CN=${a.split('@')[0]};PARTSTAT=NEEDS-ACTION:mailto:${a}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

const occurrence = (overrides: any = {}) => ({
  id: 'ev1-e1792000000',
  eventId: 'ev1',
  calendarId: 'c1',
  start: '2026-10-12T17:00:00.000Z',
  end: '2026-10-12T18:00:00.000Z',
  allDay: false,
  status: 'CONFIRMED',
  myStatus: 'accepted',
  attendees: [],
  organizer: null,
  ...overrides,
});

describe('Views calendar API', function () {
  let dialog: jasmine.Spy;

  beforeEach(() => {
    spyOn(Contact.prototype, 'isMe').andCallFake(function () {
      return this.email === ME;
    });
    dialog = jasmine.createSpy('showMessageBoxSync').andReturn(0);
    const remote = require('@electron/remote');
    spyOn(remote.dialog, 'showMessageBoxSync').andCallFake((...args) => dialog(...args));
    spyOn(Actions, 'queueTask');
  });

  describe('reads', () => {
    it('lists allowed calendars and marks the first writable one per account as default', () => {
      const calendars = [
        new Calendar({ id: 'ro', accountId: 'a1', name: 'Holidays', readOnly: true } as any),
        new Calendar({ id: 'c1', accountId: 'a1', name: 'Work', color: '#f00' } as any),
        new Calendar({ id: 'c2', accountId: 'a1', name: 'Home' } as any),
      ];
      const out = listCalendars(WRITE, calendars);
      expect(out.map((c) => [c.id, c.isDefault, c.readOnly])).toEqual([
        ['ro', false, true],
        ['c1', true, false],
        ['c2', false, false],
      ]);
      expect(out[1].color).toBe('#f00');
    });

    it('parses range filters and rejects bad ones', () => {
      const r = parseRange({
        start: '2026-10-01',
        end: '2026-10-08',
        calendarIds: ['c1'],
        attendee: 'Boss@Example.com',
      });
      expect(r.calendarIds).toEqual(['c1']);
      expect(r.attendee).toBe('boss@example.com');
      expect(r.includeDeclined).toBe(false);
      expect(() =>
        parseRange({ start: '2026-10-01', end: '2026-10-08', calendarIds: 'c1' })
      ).toThrow();
    });

    it('finds video links and the stored event behind an occurrence', () => {
      expect(
        conferenceUrl('Room 4', 'Join: https://us02web.zoom.us/j/123?pwd=x for the call')
      ).toBe('https://us02web.zoom.us/j/123?pwd=x');
      expect(conferenceUrl('https://meet.google.com/abc-defg-hij', '')).toBe(
        'https://meet.google.com/abc-defg-hij'
      );
      expect(conferenceUrl('Cafe', 'no link')).toBe(null);
      expect(eventIdOf('8f2a-e1792000000')).toBe('8f2a');
      expect(eventIdOf('8f2a-e0')).toBe('8f2a');
      expect(eventIdOf('8f2a')).toBe('8f2a');
    });

    it('merges busy time, ignoring declined, cancelled and all-day events', () => {
      const range = parseRange({ start: '2026-10-12T00:00:00Z', end: '2026-10-13T00:00:00Z' });
      const result = freeBusy(
        [
          occurrence(),
          occurrence({ start: '2026-10-12T17:30:00.000Z', end: '2026-10-12T19:00:00.000Z' }),
          occurrence({
            start: '2026-10-12T20:00:00.000Z',
            end: '2026-10-12T21:00:00.000Z',
            myStatus: 'declined',
          }),
          occurrence({
            start: '2026-10-12T21:00:00.000Z',
            end: '2026-10-12T22:00:00.000Z',
            status: 'CANCELLED',
          }),
          occurrence({
            allDay: true,
            start: '2026-10-12T00:00:00.000Z',
            end: '2026-10-13T00:00:00.000Z',
          }),
        ] as any,
        range
      );
      expect(result.busy).toEqual([
        { start: '2026-10-12T17:00:00.000Z', end: '2026-10-12T19:00:00.000Z' },
      ]);
      expect(result.busyMinutes).toBe(120);
    });
  });

  describe('writes', () => {
    let calendar: Calendar;
    let event: Event;

    beforeEach(() => {
      calendar = new Calendar({ id: 'c1', accountId: 'a1', name: 'Work' } as any);
      event = new Event({
        id: 'ev1',
        calendarId: 'c1',
        accountId: 'a1',
        ics: invitationICS(),
        icsuid: 'abc@example.com',
        recurrenceStart: 1792000000,
        recurrenceEnd: 1792003600,
      } as any);
      spyOn(AccountStore, 'accountForEmail').andCallFake((email) =>
        email && email.toLowerCase() === ME ? ({ id: 'a1' } as any) : null
      );
      spyOn(DatabaseStore, 'find').andCallFake((klass, id) =>
        Promise.resolve(
          klass === Calendar ? (id === 'c1' ? calendar : null) : id === 'ev1' ? event : null
        )
      );
    });

    it('names the people a change would email, never the user', () => {
      expect(otherParticipants(invitationICS())).toEqual(['guest@example.com']);
    });

    it('RSVPs like the calendar: records our answer and emails the organizer, once confirmed', async () => {
      await rsvp('spec', WRITE, 'ev1-e1792000000', 'accepted');
      expect(dialog).toHaveBeenCalled();
      expect(dialog.mostRecentCall.args[0].detail).toContain('boss@example.com');
      const tasks = (Actions.queueTask as any as jasmine.Spy).calls.map((c) => c.args[0]);
      const write = tasks.find((t) => t.constructor.name === 'SyncbackEventTask');
      const ics = write.event.ics.replace(/\r?\n /g, '');
      expect(ics).toMatch(/PARTSTAT=ACCEPTED[^\n]*mailto:me@example.com/);
      expect(ics).toMatch(/PARTSTAT=NEEDS-ACTION[^\n]*mailto:guest@example.com/);
      // The emailed REPLY can't be retracted, so the write isn't offered for undo.
      expect(write.canBeUndone).toBe(false);
      const reply = tasks.find((t) => t.constructor.name === 'EventRSVPTask');
      expect(reply).toBeDefined();
      expect(reply.to).toBe('boss@example.com');
    });

    it('does nothing when the user declines the confirmation', async () => {
      dialog.andReturn(1);
      const err = await errorFrom(() => rsvp('spec', WRITE, 'ev1', 'declined'));
      expect(err.code).toBe('cancelled');
      expect(Actions.queueTask).not.toHaveBeenCalled();
    });

    it('refuses RSVPs to events the user is not invited to', async () => {
      event.ics = invitationICS({ attendees: ['guest@example.com'] });
      expect((await errorFrom(() => rsvp('spec', WRITE, 'ev1', 'accepted'))).code).toBe('invalid');
    });

    it('still emails the organizer when our copy of the event is read-only', async () => {
      calendar.readOnly = true;
      await rsvp('spec', WRITE, 'ev1', 'tentative');
      const tasks = (Actions.queueTask as any as jasmine.Spy).calls.map((c) => c.args[0]);
      expect(tasks.map((t) => t.constructor.name)).toEqual(['EventRSVPTask']);
    });

    it('creates private events silently but confirms before inviting guests', async () => {
      const base = {
        calendarId: 'c1',
        title: 'Focus',
        start: '2026-10-13T15:00:00Z',
        end: '2026-10-13T16:00:00Z',
      };
      await createEvent('spec', WRITE, base);
      expect(dialog).not.toHaveBeenCalled();
      expect((Actions.queueTask as any as jasmine.Spy).callCount).toBe(1);

      await createEvent('spec', WRITE, { ...base, attendees: [{ email: 'guest@example.com' }] });
      expect(dialog).toHaveBeenCalled();
      expect((Actions.queueTask as any as jasmine.Spy).callCount).toBe(2);

      const bad = await errorFrom(() => createEvent('spec', WRITE, { ...base, end: base.start }));
      expect(bad.code).toBe('invalid');
    });

    it('edits a whole event with undo but not one occurrence of a series', async () => {
      await updateEvent('spec', WRITE, 'ev1', {
        title: 'Planning (moved)',
        start: '2026-10-12T18:00:00Z',
        end: '2026-10-12T19:00:00Z',
      });
      const task = (Actions.queueTask as any as jasmine.Spy).mostRecentCall.args[0];
      expect(task.canBeUndone).toBe(true);
      expect(task.event.ics).toContain('SUMMARY:Planning (moved)');
      expect(task.event.recurrenceStart).toBe(Date.parse('2026-10-12T18:00:00Z') / 1000);

      event.ics = invitationICS({ recurring: true });
      spyOn(ICSEventHelpers, 'isRecurringEvent').andReturn(true);
      const err = await errorFrom(() =>
        updateEvent('spec', WRITE, 'ev1-e1792000000', { title: 'x' })
      );
      expect(err.code).toBe('unsupported');
    });

    it('always confirms deletes', async () => {
      event.ics = invitationICS({ attendees: [ME] });
      await deleteEvent('spec', WRITE, 'ev1');
      expect(dialog).toHaveBeenCalled();
      expect((Actions.queueTask as any as jasmine.Spy).callCount).toBe(1);
    });
  });
});
