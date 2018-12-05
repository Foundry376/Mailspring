import ChangeFolderTask from './change-folder-task';
import ChangeLabelsTask from './change-labels-task';
import ChangeUnreadTask from './change-unread-task';
import ChangeStarredTask from './change-starred-task';
import CategoryStore from '../stores/category-store';
import Thread from '../models/thread';
import Label from '../models/label';
import _ from 'underscore'

const TaskFactory = {
  tasksForThreadsByAccountId(threads, callback) {
    const byAccount = {};
    threads.forEach(thread => {
      if (!(thread instanceof Thread)) {
        throw new Error('tasksForApplyingCategories: `threads` must be instances of Thread');
      }
      const { accountId } = thread;
      if (!byAccount[accountId]) {
        byAccount[accountId] = { accountThreads: [], accountId: accountId };
      }
      byAccount[accountId].accountThreads.push(thread);
    });

    const tasks = [];
    Object.values(byAccount).forEach(({ accountThreads, accountId }) => {
      const taskOrTasks = callback(accountThreads, accountId);
      if (taskOrTasks && taskOrTasks instanceof Array) {
        tasks.push(...taskOrTasks);
      } else if (taskOrTasks) {
        tasks.push(taskOrTasks);
      }
    });
    return tasks;
  },

  tasksForMarkingAsSpam({ threads, source }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      return new ChangeFolderTask({
        folder: CategoryStore.getSpamCategory(accountId),
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForMarkingNotSpam({ threads, source }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      if (inbox instanceof Label) {
        return new ChangeFolderTask({
          folder: CategoryStore.getAllMailCategory(accountId),
          threads: accountThreads,
          source,
        });
      }
      return new ChangeFolderTask({
        folder: inbox,
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForArchiving({ threads, source }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      if (inbox instanceof Label) {
        return new ChangeLabelsTask({
          labelsToRemove: [inbox],
          labelsToAdd: [],
          threads: accountThreads,
          source,
        });
      }
      return new ChangeFolderTask({
        folder: CategoryStore.getArchiveCategory(accountId),
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForMovingToTrash({ threads, source }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      return new ChangeFolderTask({
        folder: CategoryStore.getTrashCategory(accountId),
        threads: accountThreads,
        source,
      });
    });
  },

  taskForInvertingUnread({ threads, source, canBeUndone }) {
    const unread = threads.every(t => t.unread === false);
    return new ChangeUnreadTask({ threads, unread, source, canBeUndone });
  },

  taskForSettingUnread({ threads, unread, source, canBeUndone }) {
    const threadsByFolder = this._splitByFolder(threads);
    const tasks = [];
    for (const accId in threadsByFolder) {
      for (const item of threadsByFolder[accId]) {
        const t = new ChangeUnreadTask({ threads: item, unread, source, canBeUndone });
        tasks.push(t);
      }
    }
    return tasks;
  },

  taskForInvertingStarred({ threads, source }) {
    const starred = threads.every(t => t.starred === false);
    const threadsByFolder = this._splitByFolder(threads);
    const tasks = [];
    for (const accId in threadsByFolder) {
      for (const item of threadsByFolder[accId]) {
        const t = new ChangeStarredTask({ threads: item, starred, source });
        tasks.push(t);
      }
    }
    return tasks;
  },

  _splitByFolder(threads) {
    const accountIds = _.uniq(threads.map(({ accountId }) => accountId));
    const result = {};
    for (const accId of accountIds) {
      const threadsByAccount = threads.filter(item => item.accountId === accId);

      const folderIds = _.uniq(threadsByAccount.map(({ id, folders }) => {
        if (folders && folders.length > 0) {
          return folders[0].id
        } else {
          console.warn(`ThreadId: ${id} have no folder attribute`)
          return null;
        }
      }))
      const arr = [];
      for (const folderId of folderIds) {
        const threadGroup = threadsByAccount.filter(({ folders }) => {
          if (folders && folders.length > 0 && folders[0].id === folderId) {
            return true;
          }
          return false;
        })
        arr.push(threadGroup);
      }
      result[accId] = arr;
    }
    return result;
  }
};

export default TaskFactory;
