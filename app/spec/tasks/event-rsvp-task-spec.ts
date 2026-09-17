import { EventRSVPTask } from '../../src/flux/tasks/event-rsvp-task';
import { Message } from '../../src/flux/models/message';
import * as Actions from '../../src/flux/actions';
import DatabaseStore from '../../src/flux/stores/database-store';
import { SyncbackMetadataTask } from '../../src/flux/tasks/syncback-metadata-task';

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
