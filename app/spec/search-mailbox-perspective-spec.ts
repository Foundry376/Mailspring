import { AccountStore, CategoryStore, Label, Thread } from 'mailspring-exports';
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
  });
});
