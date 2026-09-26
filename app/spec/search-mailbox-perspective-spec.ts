import {
  AccountStore,
  CategoryStore,
  ChangeFolderTask,
  ChangeLabelsTask,
  Folder,
  Label,
  Thread,
} from 'mailspring-exports';
import SearchMailboxPerspective from '../internal_packages/thread-search/lib/search-mailbox-perspective';

describe('SearchMailboxPerspective', function searchMailboxPerspective() {
  beforeEach(() => {
    this.sourcePerspective = { accountIds: ['a1'], name: 'Inbox' };
    this.perspective = new SearchMailboxPerspective(this.sourcePerspective, 'from:ben');
    this.thread = new Thread({ id: 't1', accountId: 'a1' });
  });

  describe('tasksForRemovingItems', () => {
    it('builds a valid ChangeLabelsTask (with labelsToAdd) when the preferred removal destination is a Label', () => {
      const inboxCategory = new Label({ id: 'inbox', accountId: 'a1', role: 'inbox' });
      spyOn(AccountStore, 'accountForId').andReturn({
        id: 'a1',
        preferredRemovalDestination: () => new Label({ id: 'all', accountId: 'a1', role: 'all' }),
      });
      spyOn(CategoryStore, 'getInboxCategory').andReturn(inboxCategory);

      const tasks = this.perspective.tasksForRemovingItems([this.thread], 'Dragged out of list');

      expect(tasks.length).toBe(1);
      const [task] = tasks;
      expect(task.labelsToAdd).toEqual([]);
      expect(task.labelsToRemove).toEqual([inboxCategory]);

      // Regression test for MAILSPRING-CLIENT-AC: willBeQueued() previously threw
      // "Assertion Failure: ChangeLabelsTask requires labelsToAdd" because labelsToAdd
      // was never passed to the task and so was `undefined`, not `[]`.
      expect(() => task.willBeQueued()).not.toThrow();
    });

    it('archives a Gmail result by removing the Inbox label, not by moving it to All Mail', () => {
      const inbox = new Label({ id: 'inbox', accountId: 'a1', role: 'inbox' });
      const allMail = new Folder({ id: 'all', accountId: 'a1', role: 'all' });
      spyOn(AccountStore, 'accountForId').andReturn({
        id: 'a1',
        preferredRemovalDestination: () => allMail,
      });
      spyOn(CategoryStore, 'getInboxCategory').andReturn(inbox);
      spyOn(CategoryStore, 'getArchiveCategory').andReturn(allMail);

      const tasks = this.perspective.tasksForRemovingItems([this.thread]);

      expect(tasks.length).toBe(1);
      expect(tasks[0] instanceof ChangeLabelsTask).toBe(true);
      expect(tasks[0].labelsToRemove).toEqual([inbox]);
      expect(tasks[0].labelsToAdd).toEqual([]);
    });

    it('archives a folder-based result without scoping it to a folder', () => {
      const inbox = new Folder({ id: 'inbox', accountId: 'a1', role: 'inbox' });
      const archive = new Folder({ id: 'archive', accountId: 'a1', role: 'archive' });
      spyOn(AccountStore, 'accountForId').andReturn({
        id: 'a1',
        preferredRemovalDestination: () => archive,
      });
      spyOn(CategoryStore, 'getInboxCategory').andReturn(inbox);
      spyOn(CategoryStore, 'getArchiveCategory').andReturn(archive);

      const [task] = this.perspective.tasksForRemovingItems([this.thread]);

      expect(task instanceof ChangeFolderTask).toBe(true);
      expect(task.folder).toBe(archive);
      expect(task.sourceFolderIds).toEqual([]);
    });

    it('moves the result to Trash when that is the preferred destination', () => {
      const trash = new Folder({ id: 'trash', accountId: 'a1', role: 'trash' });
      spyOn(AccountStore, 'accountForId').andReturn({
        id: 'a1',
        preferredRemovalDestination: () => trash,
      });
      spyOn(CategoryStore, 'getInboxCategory').andReturn(
        new Label({ id: 'inbox', accountId: 'a1', role: 'inbox' })
      );
      spyOn(CategoryStore, 'getTrashCategory').andReturn(trash);

      const [task] = this.perspective.tasksForRemovingItems([this.thread]);

      expect(task instanceof ChangeFolderTask).toBe(true);
      expect(task.folder).toBe(trash);
    });
  });
});
