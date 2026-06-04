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
    const byAccount: { [accountId: string]: { accountThreads: Thread[]; accountId: string } } = {};
    threads.forEach((thread) => {
      if (!(thread instanceof Thread)) {
        throw new Error('tasksForThreadsByAccountId: `threads` must be instances of Thread');
      }
      const { accountId } = thread;
      if (!byAccount[accountId]) {
        byAccount[accountId] = { accountThreads: [], accountId: accountId };
      }
      byAccount[accountId].accountThreads.push(thread);
    });

    const tasks: Task[] = [];
    Object.values(byAccount).forEach(({ accountThreads, accountId }) => {
      const taskOrTasks = callback(accountThreads, accountId);
      if (taskOrTasks && taskOrTasks instanceof Array) {
        tasks.push(...taskOrTasks);
      } else if (taskOrTasks) {
        tasks.push(taskOrTasks as Task);
      }
    });
    return tasks;
  },

  tasksForMarkingAsSpam({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      if (inbox instanceof Label) {
        // Gmail: categories are labels, so use ChangeLabelsTask
        const spam = CategoryStore.getSpamCategory(accountId);
        if (!spam) return null;
        return new ChangeLabelsTask({
          labelsToAdd: [spam as Label],
          labelsToRemove: [inbox],
          threads: accountThreads,
          source,
        });
      }
      const folder = CategoryStore.getSpamCategory(accountId);
      if (!folder) return null;
      return new ChangeFolderTask({ folder, source, threads: accountThreads });
    });
  },

  tasksForMarkingNotSpam({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);

      if (inbox instanceof Label) {
        // Gmail: remove spam label (moves thread to All Mail)
        const spam = CategoryStore.getSpamCategory(accountId);
        return new ChangeLabelsTask({
          labelsToAdd: [],
          labelsToRemove: spam ? [spam as Label] : [],
          threads: accountThreads,
          source,
        });
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
      const inbox = CategoryStore.getInboxCategory(accountId);
      if (inbox instanceof Label) {
        // Gmail: categories are labels, so use ChangeLabelsTask
        const trash = CategoryStore.getTrashCategory(accountId);
        if (!trash) return null;
        return new ChangeLabelsTask({
          labelsToAdd: [trash as Label],
          labelsToRemove: [inbox],
          threads: accountThreads,
          source,
        });
      }
      const trash = CategoryStore.getTrashCategory(accountId);
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
    const unread = threads.every((t) => t.unread === false);
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
    const starred = threads.every((t) => t.starred === false);
    return new ChangeStarredTask({ threads, starred, source });
  },
};
