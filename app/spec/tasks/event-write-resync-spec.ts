import { SyncbackEventTask } from '../../src/flux/tasks/syncback-event-task';
import { DestroyEventTask } from '../../src/flux/tasks/destroy-event-task';

describe('re-reading the calendar after an event write', () => {
  beforeEach(() => {
    spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
  });

  it('polls the account a saved event belongs to once the server has it', async () => {
    const task = new SyncbackEventTask({ accountId: 'account-1' } as any);

    await task.onSuccess();

    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
  });

  it("polls the account after a failed save, so the server's copy replaces the edit", async () => {
    spyOn(AppEnv, 'showErrorDialog');
    for (const key of ['etag-conflict', 'not-found', 'no-calendar', 'invalid-ics']) {
      const task = new SyncbackEventTask({ accountId: 'account-1' } as any);
      (AppEnv.mailsyncBridge.sendSyncCalendarNow as jasmine.Spy).reset();

      await task.onError({ key, debuginfo: '' });

      expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
    }
    expect((AppEnv.showErrorDialog as jasmine.Spy).callCount).toBe(4);
  });

  it('polls the account a deleted event belonged to once the server has the deletion', async () => {
    const task = new DestroyEventTask({ accountId: 'account-2' } as any);

    await task.onSuccess();

    expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-2');
  });
});
