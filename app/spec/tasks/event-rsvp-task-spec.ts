import { EventRSVPTask } from '../../src/flux/tasks/event-rsvp-task';
import { AccountStore } from '../../src/flux/stores/account-store';
import { Message } from '../../src/flux/models/message';
import * as Actions from '../../src/flux/actions';
import DatabaseStore from '../../src/flux/stores/database-store';
import { SyncbackMetadataTask } from '../../src/flux/tasks/syncback-metadata-task';

const ACCOUNT_ID = 'acct-1';
const ME = 'brian@example.com';

/**
 * An invitation to a series whose second occurrence was moved, so the calendar carries a
 * master VEVENT and an inline exception - both with the full guest list.
 */
const SERIES_INVITE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:series@example.com',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260301T140000Z',
  'DTEND:20260301T150000Z',
  'RRULE:FREQ=DAILY;COUNT=5',
  'SUMMARY:Standup',
  'ORGANIZER:mailto:ada@example.com',
  'ATTENDEE;CN=Ada;PARTSTAT=ACCEPTED:mailto:ada@example.com',
  `ATTENDEE;CN=Brian;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${ME}`,
  'ATTENDEE;CN=Carol;PARTSTAT=DECLINED:mailto:carol@example.com',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series@example.com',
  'RECURRENCE-ID:20260302T140000Z',
  'DTSTAMP:20260101T000000Z',
  'DTSTART:20260302T160000Z',
  'DTEND:20260302T170000Z',
  'SUMMARY:Standup (moved)',
  'ORGANIZER:mailto:ada@example.com',
  'ATTENDEE;CN=Ada;PARTSTAT=ACCEPTED:mailto:ada@example.com',
  `ATTENDEE;CN=Brian;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${ME}`,
  'ATTENDEE;CN=Carol;PARTSTAT=DECLINED:mailto:carol@example.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

/** The ATTENDEE lines of each VEVENT, in document order. */
function attendeesPerVevent(ics: string): string[][] {
  const unfolded = ics.replace(/\r\n[ \t]/g, '');
  return unfolded
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('ATTENDEE'))
        .map((l) => l.trim())
    );
}

describe('EventRSVPTask.forReplying', function () {
  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email && email.toLowerCase() === ME ? ({ id: ACCOUNT_ID } as any) : null
    );
  });

  const reply = (status: any = 'ACCEPTED') =>
    EventRSVPTask.forReplying({
      accountId: ACCOUNT_ID,
      to: 'ada@example.com',
      icsOriginalData: SERIES_INVITE,
      icsRSVPStatus: status,
    });

  it('leaves exactly one ATTENDEE in every VEVENT, not just the master', function () {
    const perVevent = attendeesPerVevent(reply().ics);
    expect(perVevent.length).toBe(2);
    for (const attendees of perVevent) {
      expect(attendees.length).toBe(1);
      expect(attendees[0]).toContain(ME);
    }
  });

  it('records the answer in every VEVENT it kept', function () {
    for (const attendees of attendeesPerVevent(reply('DECLINED').ics)) {
      expect(attendees[0]).toContain('PARTSTAT=DECLINED');
    }
  });

  it('drops RSVP=TRUE, since the answer has now been given', function () {
    for (const attendees of attendeesPerVevent(reply().ics)) {
      expect(attendees[0]).not.toContain('RSVP=TRUE');
    }
  });

  it('keeps the organizer, which is what the reply is matched against', function () {
    expect(reply().ics).toContain('ORGANIZER:mailto:ada@example.com');
  });

  it('declares itself a REPLY', function () {
    const task = reply();
    expect(task.ics).toContain('METHOD:REPLY');
  });

  it('refuses to reply on behalf of an account that is not a guest', function () {
    expect(() =>
      EventRSVPTask.forReplying({
        accountId: 'acct-nobody',
        to: 'ada@example.com',
        icsOriginalData: SERIES_INVITE,
        icsRSVPStatus: 'ACCEPTED' as any,
      })
    ).toThrow();
  });
});

describe('EventRSVPTask', () => {
  let queueTask: jasmine.Spy;

  beforeEach(() => {
    spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
    queueTask = spyOn(Actions, 'queueTask');
  });

  it('syncs the account calendar after a response completes', async () => {
    const task = new EventRSVPTask({ accountId: 'account-1' } as any);

    await task.onSuccess();

    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
  });

  it('records the response on the invitation message before syncing', async () => {
    const message = new Message({ id: 'message-1', accountId: 'account-1' });
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(message));
    const task = new EventRSVPTask({
      accountId: 'account-1',
      messageId: 'message-1',
      icsRSVPStatus: 'ACCEPTED',
    } as any);

    await task.onSuccess();

    const queued = queueTask.mostRecentCall.args[0];
    expect(queued instanceof SyncbackMetadataTask).toBe(true);
    expect(queued.value.status).toBe('ACCEPTED');
    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
  });

  it('still syncs when the invitation message is no longer available', async () => {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null));
    const task = new EventRSVPTask({
      accountId: 'account-1',
      messageId: 'missing',
      icsRSVPStatus: 'DECLINED',
    } as any);

    await task.onSuccess();

    expect(queueTask).not.toHaveBeenCalled();
    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
  });
});

describe('EventRSVPTask.forProposingNewTime', function () {
  const propose = () =>
    EventRSVPTask.forProposingNewTime({
      accountId: ACCOUNT_ID,
      to: 'ada@example.com',
      messageId: 'message-1',
      ics: 'BEGIN:VCALENDAR\r\nMETHOD:COUNTER\r\nEND:VCALENDAR',
      summary: 'Standup',
      comment: 'Clashes with my review',
    });

  it('is a COUNTER addressed to the organizer', function () {
    const task = propose();
    expect(task.method).toBe('COUNTER');
    expect((task as any).to).toBe('ada@example.com');
    expect(task.subject).toContain('Standup');
    expect(task.comment).toBe('Clashes with my review');
  });

  it('says what it is doing', function () {
    expect(propose().label()).toBe('Proposing a new time');
    expect(new EventRSVPTask({ accountId: ACCOUNT_ID, method: 'REPLY' } as any).label()).toBe(
      'Sending RSVP'
    );
  });

  it('does not record an answer on the invitation, since a proposal is not one', async function () {
    spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
    const queueTask = spyOn(Actions, 'queueTask');
    const find = spyOn(DatabaseStore, 'find');
    const task = propose();
    (task as any).icsRSVPStatus = 'TENTATIVE'; // even if a status were set

    await task.onSuccess();

    expect(find).not.toHaveBeenCalled();
    expect(queueTask).not.toHaveBeenCalled();
    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith(ACCOUNT_ID);
  });
});
