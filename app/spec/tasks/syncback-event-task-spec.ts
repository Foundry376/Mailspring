import { SyncbackEventTask } from '../../src/flux/tasks/syncback-event-task';

describe('SyncbackEventTask', () => {
  describe('description', () => {
    const event = () =>
      ({ id: 'e1', ics: 'BEGIN:VCALENDAR', recurrenceStart: 1, recurrenceEnd: 2 }) as any;
    const undoData = { ics: 'BEGIN:VCALENDAR', recurrenceStart: 0, recurrenceEnd: 1 };

    it('uses the description it was given', () => {
      const task = SyncbackEventTask.forUpdating({
        event: event(),
        undoData,
        description: 'Move event',
      });
      expect(task.description()).toBe('Move event');
    });

    it('falls back to a generic line for the undo toast when given none', () => {
      const task = SyncbackEventTask.forUpdating({ event: event(), undoData });
      expect(task.canBeUndone).toBe(true);
      expect(task.description()).toBe('Event saved');
    });
  });

  describe('onError', () => {
    let showErrorDialog: jasmine.Spy;

    beforeEach(() => {
      showErrorDialog = spyOn(AppEnv, 'showErrorDialog');
      spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
    });

    it('tells the user the server holds a newer copy to make the change on', () => {
      const task = new SyncbackEventTask({ accountId: 'account-1' } as any);

      task.onError({ key: 'etag-conflict', debuginfo: 'Event was modified by another client.' });

      const [{ title, message }, { detail }] = showErrorDialog.mostRecentCall.args;
      expect(title).toBe('Unable to save event');
      expect(message).toContain('changed since it was last loaded');
      expect(message).toContain('make your change again on its latest version');
      expect(AppEnv.mailsyncBridge.sendSyncCalendarNow).not.toHaveBeenCalled();
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
