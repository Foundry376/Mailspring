import ChangeFolderTask from './change-folder-task';
import ChangeLabelsTask from './change-labels-task';
import ChangeUnreadTask from './change-unread-task';
import ChangeStarredTask from './change-starred-task';
import UndoTask from './undo-task';
import CategoryStore from '../stores/category-store';
import Thread from '../models/thread';
import Message from '../models/message';
import Label from '../models/label';
import _ from 'underscore';
import DeleteThreadsTask from './delete-threads-task';
import ExpungeAllInFolderTask from './expunge-all-in-folder-task';
import ExpungeMessagesTask from './expunge-messages-task';

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
      // const threadsByFolder = this._splitByFolder(accountThreads);
      // for (const item of threadsByFolder) {
      //
      // }
    });
    return tasks;
  },
  tasksForMessagesByAccount(messages = [], task = () => null) {
    if (typeof task !== 'function') {
      throw new Error(`sortMessagesByAccount: 'task' must be function`);
    }
    const byAccount = {};
    for (let message of messages) {
      if (!(message instanceof Message)) {
        throw new Error(`sortMessagesByAccount: 'messages' must be instance of Message`);
      }
      if (!byAccount[message.accountId]) {
        byAccount[message.accountId] = [];
      }
      byAccount[message.accountId].push(message);
    }
    const tasks = [];
    Object.keys(byAccount).forEach(accountId => {
      const taskOrTasks = task({ accountId, messages: byAccount[accountId] });
      if (taskOrTasks && taskOrTasks instanceof Array) {
        tasks.push(...taskOrTasks);
      } else if (taskOrTasks) {
        tasks.push(taskOrTasks);
      }
    });
    return tasks;
  },

  tasksForMarkingAsSpam({ threads, source, currentPerspective }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      let previousFolder = null;
      if(currentPerspective){
        previousFolder = currentPerspective.categories().find(
          cat => cat.accountId === accountId
        );
      }
      return new ChangeFolderTask({
        previousFolder,
        folder: CategoryStore.getSpamCategory(accountId),
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForMarkingNotSpam({ threads, source, currentPerspective }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      let previousFolder = null;
      if(currentPerspective){
        previousFolder = currentPerspective.categories().find(
          cat => cat.accountId === accountId
        );
      }
      if (inbox instanceof Label) {
        return new ChangeFolderTask({
          previousFolder,
          folder: CategoryStore.getAllMailCategory(accountId),
          threads: accountThreads,
          source,
        });
      }
      return new ChangeFolderTask({
        previousFolder,
        folder: inbox,
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForArchiving({ threads, source, currentPerspective }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      let previousFolder = null;
      if(currentPerspective){
        previousFolder = currentPerspective.categories().find(
          cat => cat.accountId === accountId
        );
      }
      if (inbox instanceof Label) {
        return new ChangeLabelsTask({
          previousFolder,
          labelsToRemove: [inbox],
          labelsToAdd: [],
          threads: accountThreads,
          source,
        });
      }
      return new ChangeFolderTask({
        previousFolder,
        folder: CategoryStore.getArchiveCategory(accountId),
        threads: accountThreads,
        source,
      });
    });
  },

  tasksForMovingToTrash({ threads = [], messages = [], source, currentPerspective }) {
    const tasks = [];
    if (threads.length > 0 && (threads[0] instanceof Thread)) {
      tasks.push(
        ...this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
          let previousFolder = null;
          if(currentPerspective){
            previousFolder = currentPerspective.categories().find(
              cat => cat.accountId === accountId
            );
          }
          if(previousFolder){
            return new ChangeFolderTask({
              previousFolder,
              folder: CategoryStore.getTrashCategory(accountId),
              threads: accountThreads,
              source,
            });
          }else{
            return new ChangeFolderTask({
              folder: CategoryStore.getTrashCategory(accountId),
              threads: accountThreads,
              source,
            });
          }
        }),
      );
    }
    if (messages.length > 0 && (messages[0] instanceof Message)) {
      tasks.push(
        ...this.tasksForMessagesByAccount(messages, ({ accountId, messages }) => {
          return new ChangeFolderTask({
            folder: CategoryStore.getTrashCategory(accountId),
            messages: messages,
            source,
          });
        }),
      );
    }
    return tasks;
  },
  tasksForExpungingThreadsOrMessages({ threads = [], messages = [], source }) {
    const tasks = [];
    if (threads.length > 0 && threads[0] instanceof Thread) {
      tasks.push(
        ...this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
          return new DeleteThreadsTask({
            accountId: accountId,
            threadIds: accountThreads.map(thread => thread.id),
            source,
          });
        })
      );
    }
    if (messages.length > 0 && messages[0] instanceof Message) {
      tasks.push(
        ...this.tasksForMessagesByAccount(messages, ({ accountId, messages }) => {
          return new ExpungeMessagesTask({
            accountId: accountId,
            messageIds: messages.map(msg => msg.id),
            source,
          });
        }),
      );
    }
    return tasks;
  },

  taskForInvertingUnread({ threads, source, canBeUndone }) {
    const unread = threads.every(t => t.unread === false);
    return new ChangeUnreadTask({ threads, unread, source, canBeUndone });
  },

  taskForSettingUnread({ threads, unread, source, canBeUndone }) {
    const threadsByFolder = this._splitByAccount(threads);
    const tasks = [];
    for (const accId in threadsByFolder) {
      const t = new ChangeUnreadTask({ threads: threadsByFolder[accId], unread, source, canBeUndone });
      tasks.push(t);
    }
    return tasks;
  },

  taskForInvertingStarred({ threads, source }) {
    const starred = threads.every(t => t.starred === false);
    const threadsByFolder = this._splitByAccount(threads);
    const tasks = [];
    for (const accId in threadsByFolder) {
      const t = new ChangeStarredTask({ threads: threadsByFolder[accId], starred, source });
      tasks.push(t);
    }
    return tasks;
  },

  tasksForChangeFolder({ threads, source, folder, currentPerspective }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      let previousFolder = null;
      if(currentPerspective){
        previousFolder = currentPerspective.categories().find(
          cat => cat.accountId === accountId
        );
      }
      return new ChangeFolderTask({
        previousFolder,
        folder,
        threads: accountThreads,
        source,
      });
    });
  },

  taskForUndo({ task }) {
    if (!task.id || !task.accountId) {
      throw new Error('Task must have id and accountId');
    }
    return new UndoTask({ referenceTaskId: task.id, accountId: task.accountId });
  },

  _splitByAccount(threads) {
    const accountIds = _.uniq(threads.map(({ accountId }) => accountId));
    const result = {};
    for (const accId of accountIds) {
      const threadsByAccount = threads.filter(item => item.accountId === accId);
      // const arr = this._splitByFolder(threadsByAccount);
      result[accId] = threadsByAccount;
    }
    return result;
  },
  _splitByFolder(threads) {
    const arr = [];
    const folderIds = _.uniq(threads.map(({ id, folders }) => {
      if (folders && folders.length > 0) {
        return folders[0].id;
      } else {
        AppEnv.reportWarning(new Error(`ThreadId: ${id} have no folder attribute`));
        return null;
      }
    }));
    for (const folderId of folderIds) {
      const threadGroup = threads.filter(({ folders }) => {
        if (folders && folders.length > 0 && folders[0].id === folderId) {
          return true;
        }
        return false;
      });
      arr.push(threadGroup);
    }
    return arr;
  },
};

export default TaskFactory;
