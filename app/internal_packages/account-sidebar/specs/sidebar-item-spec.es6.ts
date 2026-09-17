import { Folder, Actions, DatabaseStore, ChangeUnreadTask } from 'mailspring-exports';
import SidebarItem from '../lib/sidebar-item';

describe('sidebar-item', function sidebarItemSpec() {
  it('preserves nested labels on rename', () => {
    const queueTask = spyOn(Actions, 'queueTask');
    const categories = [new Folder({ path: 'a.b/c', accountId: TEST_ACCOUNT_ID })];
    AppEnv.savedState.sidebarKeysCollapsed = {};
    const item = SidebarItem.forCategories(categories) as any;
    item.onEdited(item, 'd');

    const task = queueTask.calls[0].args[0];
    const { existingPath, path } = task;
    expect(existingPath).toBe('a.b/c');
    expect(path).toBe('a.b/d');
  });
  it('preserves labels on rename', () => {
    const queueTask = spyOn(Actions, 'queueTask');
    const categories = [new Folder({ path: 'a', accountId: TEST_ACCOUNT_ID })];
    AppEnv.savedState.sidebarKeysCollapsed = {};
    const item = SidebarItem.forCategories(categories);
    item.onEdited(item, 'b') as any;

    const task = queueTask.calls[0].args[0];
    const { existingPath, path } = task;
    expect(existingPath).toBe('a');
    expect(path).toBe('b');
  });

  describe('onMarkAllAsRead', () => {
    beforeEach(() => {
      AppEnv.savedState.sidebarKeysCollapsed = {};
    });

    it('queues a ChangeUnreadTask for unread threads in the category', () => {
      const unreadThreads = [
        { id: 'thread-1', accountId: TEST_ACCOUNT_ID },
        { id: 'thread-2', accountId: TEST_ACCOUNT_ID },
      ];
      spyOn(DatabaseStore, 'findAll').andCallFake(() => ({
        where() {
          return this;
        },
        then(callback) {
          return Promise.resolve(callback(unreadThreads));
        },
      }));
      const queueTask = spyOn(Actions, 'queueTask');
      const categories = [new Folder({ path: 'a', accountId: TEST_ACCOUNT_ID })];
      const item = SidebarItem.forCategories(categories) as any;

      item.onMarkAllAsRead(item);

      expect(queueTask).toHaveBeenCalled();
      const task = queueTask.calls[0].args[0];
      expect(task instanceof ChangeUnreadTask).toBe(true);
      expect(task.unread).toBe(false);
      expect(task.threadIds).toEqual(['thread-1', 'thread-2']);
      expect(task.source).toBe('Sidebar Context Menu: Mark All As Read');
    });

    it('is a no-op when there are no unread threads', () => {
      spyOn(DatabaseStore, 'findAll').andCallFake(() => ({
        where() {
          return this;
        },
        then(callback) {
          return Promise.resolve(callback([]));
        },
      }));
      const queueTask = spyOn(Actions, 'queueTask');
      const categories = [new Folder({ path: 'a', accountId: TEST_ACCOUNT_ID })];
      const item = SidebarItem.forCategories(categories) as any;

      item.onMarkAllAsRead(item);

      expect(queueTask).not.toHaveBeenCalled();
    });

    it('is present on items built via forCategories', () => {
      const categories = [new Folder({ path: 'a', accountId: TEST_ACCOUNT_ID })];
      const item = SidebarItem.forCategories(categories) as any;
      expect(item.onMarkAllAsRead).toBeDefined();
    });

    it('is not present on items built via forUnread', () => {
      const item = SidebarItem.forUnread([TEST_ACCOUNT_ID]) as any;
      expect(item.onMarkAllAsRead).toBeUndefined();
    });

    it('is not present on items built via forStarred', () => {
      const item = SidebarItem.forStarred([TEST_ACCOUNT_ID]) as any;
      expect(item.onMarkAllAsRead).toBeUndefined();
    });

    it('is not present on items built via forDrafts', () => {
      const item = SidebarItem.forDrafts([TEST_ACCOUNT_ID], { name: 'test' }) as any;
      expect(item.onMarkAllAsRead).toBeUndefined();
    });
  });
});
