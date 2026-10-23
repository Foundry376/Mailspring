import { ChangeFolderTask } from './change-folder-task';
import { ChangeLabelsTask } from './change-labels-task';
import { ChangeUnreadTask } from './change-unread-task';
import { ChangeStarredTask } from './change-starred-task';
import CategoryStore from '../stores/category-store';
import { Thread } from '../models/thread';
import { Label } from '../models/label';
import { Folder } from '../models/folder';
import { Task } from '../tasks/task';

// Gmail accounts that hide [Gmail]/Trash or [Gmail]/Spam from IMAP get those roles on a label
// matched by name, such as "Trash" or "Junk" (MAILSPRING-CLIENT-AH, -61). Inbox is removed in
// a separate task from the threads that have it, because undo swaps the added and removed
// labels and would otherwise put every thread into the Inbox. The tasks share one
// description so the undo toast reads as a single action.
function tasksForApplyingRoleLabel(
  label: Label,
  threads: Thread[],
  accountId: string,
  source: string
) {
  const inbox = CategoryStore.getInboxCategory(accountId);
  const inInbox = (t: Thread) =>
    inbox instanceof Label && (t.labels || []).some((l) => l.id === inbox.id);
  const groups = [
    { threads: threads.filter(inInbox), labelsToRemove: [inbox] },
    { threads: threads.filter((t) => !inInbox(t)), labelsToRemove: [] },
  ];
  const taskDescription = new ChangeLabelsTask({
    labelsToAdd: [label],
    labelsToRemove: [],
    threads,
    source,
  }).description();
  return groups
    .filter((g) => g.threads.length > 0)
    .map(
      (g) =>
        new ChangeLabelsTask({
          labelsToAdd: [label],
          labelsToRemove: g.labelsToRemove,
          threads: g.threads,
          source,
          taskDescription,
        })
    );
}

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
      const spam = CategoryStore.getSpamCategory(accountId) as any;
      if (!spam) return null;

      if (spam instanceof Label) {
        return tasksForApplyingRoleLabel(spam, accountThreads, accountId, source);
      }

      return new ChangeFolderTask({ folder: spam, source, threads: accountThreads });
    });
  },

  // Only the Spam copies move. Without the scope the engine would also pull a thread's
  // archived or filed copies into the Inbox, whichever view the action came from.
  tasksForMarkingNotSpam({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const inbox = CategoryStore.getInboxCategory(accountId);
      const spam = CategoryStore.getSpamCategory(accountId);
      const sourceFolderIds = spam instanceof Folder ? [spam.id] : [];

      const folder = inbox instanceof Label ? CategoryStore.getAllMailCategory(accountId) : inbox;
      if (!(folder instanceof Folder)) return null;
      return new ChangeFolderTask({ folder, threads: accountThreads, source, sourceFolderIds });
    });
  },

  // Pass the perspective the user archived from so only the copies it shows move; a
  // self-sent message archived from Sent otherwise loses its Inbox copy instead. Callers
  // with no view (MCP, notifications, send-and-archive) omit it and get the engine's
  // default: every copy outside Sent and Drafts. Gmail archive removes the Inbox label,
  // which is not a placement, so it is never scoped.
  tasksForArchiving({
    threads,
    source,
    perspective,
  }: {
    threads: Thread[];
    source: string;
    perspective?: { sourceFolderIdsForAccount(accountId: string): string[] };
  }) {
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
      return new ChangeFolderTask({
        folder: archive,
        threads: accountThreads,
        source,
        sourceFolderIds: perspective ? perspective.sourceFolderIdsForAccount(accountId) : [],
      });
    });
  },

  tasksForMovingToTrash({ threads, source }: { threads: Thread[]; source: string }) {
    return this.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const trash = CategoryStore.getTrashCategory(accountId) as any;
      if (!trash) return null;

      if (trash instanceof Label) {
        return tasksForApplyingRoleLabel(trash, accountThreads, accountId, source);
      }

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
