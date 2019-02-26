import { Actions, Thread, DatabaseStore, TaskFactory, SendDraftTask } from 'mailspring-exports';

export const name = 'SendAndArchiveExtension';

export function sendActions() {
  return [
    {
      title: 'Send and Archive',
      iconUrl: 'mailspring://send-and-archive/images/composer-archive@2x.png',
      isAvailableForDraft({ draft }) {
        return draft.threadId;
      },
      async performSendAction({ draft }) {
        Actions.queueTask(SendDraftTask.forSending(draft));

        if (!draft.threadId) return;

        const threads = await DatabaseStore.modelify(Thread, [draft.threadId]);
        const tasks = TaskFactory.tasksForArchiving({
          source: 'Send and Archive',
          threads: threads,
        });
        Actions.queueTasks(tasks);
      },
    },
  ];
}
