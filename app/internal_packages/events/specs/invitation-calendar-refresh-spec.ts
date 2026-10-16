import { DatabaseStore, File, Message } from 'mailspring-exports';
import { InvitationCalendarRefresh } from '../lib/invitation-calendar-refresh';

const SINCE = Date.UTC(2026, 9, 9, 14, 0, 0);
const MINUTE = 60 * 1000;

const invite = () => new File({ filename: 'invite.ics', contentType: 'application/ics' } as any);

function message({
  id = 'm1',
  accountId = 'a1',
  date = new Date(SINCE + MINUTE),
  files = [invite()],
} = {}) {
  return new Message({ id, accountId, date, files } as any);
}

// A delta as the engine sends it: rulesReady marks the delta on which an incoming message
// first has its body and attachments.
function delta(messages: Message[], { rulesReady = true } = {}) {
  return {
    type: 'persist',
    objectClass: 'Message',
    objects: messages,
    objectsRawJSON: messages.map((m) => ({ id: m.id, ...(rulesReady ? { rulesReady } : {}) })),
  } as any;
}

describe('InvitationCalendarRefresh', function () {
  let refresh: jasmine.Spy;
  let refresher: InvitationCalendarRefresh;

  beforeEach(function () {
    refresh = jasmine.createSpy('refresh');
    refresher = new InvitationCalendarRefresh(refresh, SINCE);
  });

  it('refreshes the calendars of the account an invitation arrives in', function () {
    refresher.onDatabaseChanged(delta([message({ accountId: 'a2' })]));
    expect(refresh.calls.length).toBe(1);
    expect(refresh).toHaveBeenCalledWith('a2');
  });

  it('ignores later changes to an invitation that has already arrived', function () {
    refresher.onDatabaseChanged(delta([message()], { rulesReady: false }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ignores invitations sent before the app started, which sync in as backlog', function () {
    refresher.onDatabaseChanged(delta([message({ date: new Date(SINCE - MINUTE) })]));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ignores mail without a calendar attachment', function () {
    const pdf = new File({ filename: 'agenda.pdf', contentType: 'application/pdf' } as any);
    refresher.onDatabaseChanged(delta([message({ files: [pdf] })]));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes an account once for a burst of invitations, and once more when the minute ends', function () {
    refresher.onDatabaseChanged(delta([message({ id: 'm1' })]));
    refresher.onDatabaseChanged(delta([message({ id: 'm2' })]));
    refresher.onDatabaseChanged(delta([message({ id: 'm3' })]));
    expect(refresh.calls.length).toBe(1);
    advanceClock(MINUTE);
    expect(refresh.calls.length).toBe(2);
    advanceClock(10 * MINUTE);
    expect(refresh.calls.length).toBe(2);
  });

  it("does not hold one account's refresh behind another's", function () {
    refresher.onDatabaseChanged(delta([message({ id: 'm1', accountId: 'a1' })]));
    refresher.onDatabaseChanged(delta([message({ id: 'm2', accountId: 'a2' })]));
    expect(refresh.calls.map((c) => c.args[0])).toEqual(['a1', 'a2']);
  });
});

describe('events package: refreshing on invitations', function () {
  const main = require('../lib/main');
  let listener: (record: any) => void;
  let unlisten: jasmine.Spy;

  beforeEach(function () {
    unlisten = jasmine.createSpy('unlisten');
    spyOn(DatabaseStore, 'listen').andCallFake((fn) => {
      listener = fn;
      return unlisten;
    });
    spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
  });

  afterEach(function () {
    main.deactivate();
  });

  it('asks the engine to sync that account when an invitation arrives in the main window', function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    main.activate();
    listener(delta([message({ accountId: 'a3', date: new Date(Date.now() + MINUTE) })]));
    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('a3');
  });

  it('stops listening when deactivated', function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    main.activate();
    main.deactivate();
    expect(unlisten).toHaveBeenCalled();
  });

  it('leaves other windows to the main window', function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(false);
    main.activate();
    expect(DatabaseStore.listen).not.toHaveBeenCalled();
  });
});
