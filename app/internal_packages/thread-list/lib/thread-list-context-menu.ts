/* eslint global-require: 0*/
import _ from 'underscore';
import {
  localized,
  Thread,
  Actions,
  Message,
  TaskFactory,
  DatabaseStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

type TemplateItem =
  | {
      label: string;
      click: () => void;
    }
  | { type: 'separator' };

export default class ThreadListContextMenu {
  threadIds: string[];
  accountIds: string[];
  threads?: Thread[];

  constructor({ threadIds = [], accountIds = [] }) {
    this.threadIds = threadIds;
    this.accountIds = accountIds;
  }

  menuItemTemplate() {
    return DatabaseStore.modelify<Thread>(Thread, this.threadIds)
      .then(threads => {
        this.threads = threads;

        return Promise.all<TemplateItem>([
          this.findWithFrom(),
          this.findWithSubject(),
          { type: 'separator' },
          this.replyItem(),
          this.replyAllItem(),
          this.forwardItem(),
          { type: 'separator' },
          this.archiveItem(),
          this.trashItem(),
          this.markAsReadItem(),
          this.markAsSpamItem(),
          this.starItem(),
        ]);
      })
      .then(menuItems => {
        return _.filter(_.compact(menuItems), (item, index) => {
          if (
            (index === 0 || index === menuItems.length - 1) &&
            (item as any).type === 'separator'
          ) {
            return false;
          }
          return true;
        });
      });
  }

  findWithFrom(): TemplateItem | null {
    if (this.threadIds.length !== 1) {
      return null;
    }
    const first = this.threads[0];
    const from = first.participants.find(p => !p.isMe()) || first.participants[0];

    return {
      label: localized(`Search for`) + ' ' + from.email,
      click: () => {
        Actions.searchQuerySubmitted(`"${from.email.replace('"', '""')}"`);
      },
    };
  }

  findWithSubject(): TemplateItem | null {
    if (this.threadIds.length !== 1) {
      return null;
    }
    const subject = this.threads[0].subject;

    return {
      label:
        localized(`Search for`) +
        ' ' +
        (subject.length > 35 ? `${subject.substr(0, 35)}...` : subject),
      click: () => {
        Actions.searchQuerySubmitted(`subject:"${subject}"`);
      },
    };
  }

  replyItem(): TemplateItem | null {
    if (this.threadIds.length !== 1) {
      return null;
    }
    return {
      label: localized('Reply'),
      click: () => {
        Actions.composeReply({
          threadId: this.threadIds[0],
          popout: true,
          type: 'reply',
          behavior: 'prefer-existing-if-pristine',
        });
      },
    };
  }

  replyAllItem(): Promise<TemplateItem> | null {
    if (this.threadIds.length !== 1) {
      return null;
    }

    return DatabaseStore.findBy<Message>(Message, { threadId: this.threadIds[0] })
      .order(Message.attributes.date.descending())
      .limit(1)
      .then(message => {
        if (message && message.canReplyAll()) {
          return {
            label: localized('Reply All'),
            click: () => {
              Actions.composeReply({
                threadId: this.threadIds[0],
                popout: true,
                type: 'reply-all',
                behavior: 'prefer-existing-if-pristine',
              });
            },
          };
        }
        return null;
      });
  }

  forwardItem(): TemplateItem | null {
    if (this.threadIds.length !== 1) {
      return null;
    }
    return {
      label: localized('Forward'),
      click: () => {
        Actions.composeForward({ threadId: this.threadIds[0], popout: true });
      },
    };
  }

  archiveItem(): TemplateItem | null {
    const perspective = FocusedPerspectiveStore.current();
    const allowed = perspective.canArchiveThreads(this.threads);
    if (!allowed) {
      return null;
    }
    return {
      label: localized('Archive'),
      click: () => {
        const tasks = TaskFactory.tasksForArchiving({
          source: 'Context Menu: Thread List',
          threads: this.threads,
        });
        Actions.queueTasks(tasks);
      },
    };
  }

  trashItem(): TemplateItem | null {
    const perspective = FocusedPerspectiveStore.current();
    const allowed = perspective.canMoveThreadsTo(this.threads, 'trash');
    if (!allowed) {
      return null;
    }
    return {
      label: localized('Trash'),
      click: () => {
        const tasks = TaskFactory.tasksForMovingToTrash({
          source: 'Context Menu: Thread List',
          threads: this.threads,
        });
        Actions.queueTasks(tasks);
      },
    };
  }

  markAsReadItem(): TemplateItem | null {
    const unread = this.threads.every(t => t.unread === false);
    const dir = unread ? localized('Unread') : localized('Read');

    return {
      label: localized(`Mark as %@`, dir),
      click: () => {
        Actions.queueTask(
          TaskFactory.taskForInvertingUnread({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          })
        );
      },
    };
  }

  markAsSpamItem(): TemplateItem | null {
    const allInSpam = this.threads.every(item => item.folders.some(c => c.role === 'spam'));
    const dir = allInSpam ? localized('Not Spam') : localized('Spam');

    return {
      label: localized(`Mark as %@`, dir),
      click: () => {
        Actions.queueTasks(
          allInSpam
            ? TaskFactory.tasksForMarkingNotSpam({
                source: 'Context Menu: Thread List',
                threads: this.threads,
              })
            : TaskFactory.tasksForMarkingAsSpam({
                source: 'Context Menu: Thread List',
                threads: this.threads,
              })
        );
      },
    };
  }

  starItem(): TemplateItem | null {
    const starred = this.threads.every(t => t.starred === false);

    let label = localized('Star');
    if (!starred) {
      label = this.threadIds.length > 1 ? localized('Remove Stars') : localized('Remove Star');
    }

    return {
      label: label,
      click: () => {
        Actions.queueTask(
          TaskFactory.taskForInvertingStarred({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          })
        );
      },
    };
  }

  displayMenu() {
    const { remote } = require('electron');
    this.menuItemTemplate().then(template => {
      remote.Menu.buildFromTemplate(template).popup({});
    });
  }
}
