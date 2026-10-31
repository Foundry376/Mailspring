import { SyncbackEventTask } from '../../src/flux/tasks/syncback-event-task';

describe('SyncbackEventTask', () => {
  describe('onError', () => {
    let showErrorDialog: jasmine.Spy;

    beforeEach(() => {
      showErrorDialog = spyOn(AppEnv, 'showErrorDialog');
      spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
    });

    it('refreshes the calendar and says so when the server holds a newer copy', () => {
      const task = new SyncbackEventTask({ accountId: 'account-1' } as any);

      task.onError({ key: 'etag-conflict', debuginfo: 'Event was modified by another client.' });

      const [{ title, message }, { detail }] = showErrorDialog.mostRecentCall.args;
      expect(title).toBe('Unable to save event');
      expect(message).toContain('changed since it was last loaded');
      expect(message).toContain('The calendar has been refreshed');
      expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).toHaveBeenCalledWith('account-1');
      expect(detail).toBe('Event was modified by another client.');
    });

    it('explains a series whose exceptions the edit would have erased', () => {
      const task = new SyncbackEventTask({ accountId: 'account-1' } as any);

      task.onError({ key: 'ics-incomplete', debuginfo: 'send the whole resource' });

      expect(showErrorDialog.mostRecentCall.args[0].message).toContain('modified occurrences');
    });

    it('shows the engine key when it has no text for it', () => {
      const task = new SyncbackEventTask({ accountId: 'account-1' } as any);

      task.onError({ key: 'Invalid Response Code: 507', debuginfo: 'PUT https://example.test' });

      const [{ message }, { detail }] = showErrorDialog.mostRecentCall.args;
      expect(message).toContain('Invalid Response Code: 507');
      expect(detail).toBe('PUT https://example.test');
    });
  });
});
