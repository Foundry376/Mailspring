import { ChangeFolderTask } from './change-folder-task';
import { ChangeLabelsTask } from './change-labels-task';
import { ChangeUnreadTask } from './change-unread-task';
import { ChangeStarredTask } from './change-starred-task';
import CategoryStore from '../stores/category-store';
import { Thread } from '../models/thread';
import { Label } from '../models/label';
import { Task } from '../tasks/task';

export const TaskFactory = {
  tasksForThreadsByAccountId(
    threads: Thread[],
    callback: (accountThreads: Thread[], accountId: string) => Task | Task[]
  ) {
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

  tasksForMarkingAsSpam({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const folder = CategoryStore.getSpamCategory(accountId);
      if (!folder) return null;
      return new ChangeFolderTask({ folder, source, threads: accountThreads });
    });
  },

  tasksForMarkingNotSpam({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);

      if (inbox instanceof Label) {
        const all = CategoryStore.getAllMailCategory(accountId) as any;
        if (!all) return null;
        return new ChangeFolderTask({ folder: all, threads: accountThreads, source });
      }

      if (!inbox) return null;
      return new ChangeFolderTask({ folder: inbox, threads: accountThreads, source });
    });
  },

  tasksForArchiving({ threads, source }: { threads: Thread[]; source: string }) {
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

      const archive = CategoryStore.getArchiveCategory(accountId);
      if (!archive) return null;
      return new ChangeFolderTask({ folder: archive, threads: accountThreads, source });
    });
  },

  tasksForMovingToTrash({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const trash = CategoryStore.getTrashCategory(accountId) as any;
      if (!trash) return null;
      return new ChangeFolderTask({ folder: trash, threads: accountThreads, source });
    });
  },

  taskForInvertingUnread({
    threads,
    source,
    canBeUndone,
  }: {
    threads: Thread[];
    source: string;
    canBeUndone?: boolean;
  }) {
    const unread = threads.every(t => t.unread === false);
    return new ChangeUnreadTask({ threads, unread, source, canBeUndone });
  },

  taskForSettingUnread({
    threads,
    unread,
    source,
    canBeUndone,
  }: {
    threads: Thread[];
    source: string;
    unread: boolean;
    canBeUndone?: boolean;
  }) {
    return new ChangeUnreadTask({ threads, unread, source, canBeUndone });
  },

  taskForInvertingStarred({ threads, source }: { threads: Thread[]; source: string }) {
    const starred = threads.every(t => t.starred === false);
    return new ChangeStarredTask({ threads, starred, source });
  },
};
