import { Actions, Thread, DatabaseStore, TaskFactory, SendDraftTask } from 'mailspring-exports';

export const name = 'SendAndArchiveExtension';

export function sendActions() {
  return [
    {
      title: 'Send and Archive',
      iconUrl: 'edisonmail://send-and-archive/images/composer-archive@2x.png',
      isAvailableForDraft({ draft }) {
        return draft.threadId != null;
      },
      performSendAction({ draft }) {
        Actions.queueTask(SendDraftTask.forSending(draft));
        return DatabaseStore.modelify(Thread, [draft.threadId]).then(threads => {
          const tasks = TaskFactory.tasksForArchiving({
            source: 'Send and Archive',
            threads: threads,
          });
          Actions.queueTasks(tasks);
        });
      },
    },
  ];
}
