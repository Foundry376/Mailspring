/* eslint global-require: 0*/
import _ from 'underscore';
import {
  Thread,
  Actions,
  Message,
  TaskFactory,
  DatabaseStore,
  MessageStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

export default class ThreadListContextMenu {
  constructor({ threadIds = [], accountIds = [], threads = [] }) {
    this.threadIds = threadIds;
    this.accountIds = accountIds;
    this.threads = threads;
  }

  menuItemTemplate() {
    return Promise.all([
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
      this.starItem(),
    ]).then(menuItems => {
      return _.filter(_.compact(menuItems), (item, index) => {
        if ((index === 0 || index === menuItems.length - 1) && item.type === 'separator') {
          return false;
        }
        return true;
      });
    });
  }

  findWithFrom() {
    if (this.threadIds.length !== 1) {
      return null;
    }
    let from = this.threads[0].participants.find(p => !p.isMe());
    if (!from) {
      from = this.threads[0].participants[0];
    }
    return {
      label: `Search for ${from.email}`,
      click: () => {
        Actions.searchQuerySubmitted(`"${from.email.replace('"', '""')}"`);
      },
    };
  }

  findWithSubject() {
    if (this.threadIds.length !== 1) {
      return null;
    }
    const subject = this.threads[0].subject;

    return {
      label: `Search for ${subject.length > 35 ? `${subject.substr(0, 35)}...` : subject}`,
      click: () => {
        Actions.searchQuerySubmitted(`subject:"${subject}"`);
      },
    };
  }

  replyItem() {
    if (this.threadIds.length !== 1) {
      return null;
    }
    return {
      label: 'Reply',
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

  replyAllItem() {
    if (this.threadIds.length !== 1) {
      return null;
    }

    // return DatabaseStore.findBy(Message, { threadId: this.threadIds[0], state: 0 })
    //   .order(Message.attributes.date.descending())
    return MessageStore.findByThreadIdInDescendingOrder({ threadId: this.threadIds[0] })
      .limit(1)
      .then(message => {
        if (message && message.canReplyAll()) {
          return {
            label: 'Reply All',
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

  forwardItem() {
    if (this.threadIds.length !== 1) {
      return null;
    }
    return {
      label: 'Forward',
      click: () => {
        Actions.composeForward({ threadId: this.threadIds[0], popout: true });
      },
    };
  }

  archiveItem() {
    const perspective = FocusedPerspectiveStore.current();
    const allowed = perspective.canArchiveThreads(this.threads);
    if (!allowed) {
      return null;
    }
    return {
      label: 'Archive',
      click: () => {
        const tasks = TaskFactory.tasksForArchiving({
          source: 'Context Menu: Thread List',
          threads: this.threads,
        });
        Actions.queueTasks(tasks);
      },
    };
  }

  trashItem() {
    const perspective = FocusedPerspectiveStore.current();
    const canMoveToTrash = perspective.canTrashThreads(this.threads, 'trash');
    if (!canMoveToTrash) {
      if (perspective.canExpungeThreads(this.threads)) {
        return {
          label: 'Expunge',
          click: () => {
            const tasks = TaskFactory.tasksForExpungingThreadsOrMessages({
              source: 'Context Menu: Thread List, Expunge',
              threads: this.threads,
            });
            if (Array.isArray(tasks) && tasks.length > 0) {
              tasks.forEach(task => {
                if (!task.accountId) {
                  try {
                    AppEnv.reportError(new Error(`Expunge Task no accountId`), {
                      errorData: {
                        task: task.toJSON(),
                        threads: JSON.stringify(this.threads),
                      },
                    });
                  } catch (e) {

                  }
                }
              });
            }
            Actions.queueTasks(tasks);
          },
        };
      }
      return null;
    }
    return {
      label: 'Trash',
      click: () => {
        const tasks = TaskFactory.tasksForMovingToTrash({
          source: 'Context Menu: Thread List, Trash',
          threads: this.threads,
        });
        if (Array.isArray(tasks) && tasks.length > 0) {
          tasks.forEach(task => {
            if (!task.accountId) {
              try {
                AppEnv.reportError(new Error(`Trash Task no accountId`), {
                  errorData: {
                    task: task.toJSON(),
                    threads: JSON.stringify(this.threads),
                  },
                });
              } catch (e) {

              }
            }
          });
        }
        Actions.queueTasks(tasks);
      },
    };
  }

  markAsReadItem() {
    const unread = this.threads.every(t => t.unread === false);
    const dir = unread ? 'Unread' : 'Read';

    return {
      label: `Mark as ${dir}`,
      click: () => {
        Actions.queueTask(
          TaskFactory.taskForInvertingUnread({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          }),
        );
      },
    };
  }

  starItem() {
    const starred = this.threads.every(t => t.starred === false);

    let dir = '';
    let star = 'Star';
    if (!starred) {
      dir = 'Remove ';
      star = this.threadIds.length > 1 ? 'Stars' : 'Star';
    }

    return {
      label: `${dir}${star}`,
      click: () => {
        Actions.queueTasks(
          TaskFactory.taskForInvertingStarred({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          }),
        );
      },
    };
  }

  displayMenu() {
    const { remote } = require('electron');
    this.menuItemTemplate().then(template => {
      remote.Menu.buildFromTemplate(template).popup(remote.getCurrentWindow());
    });
  }
}
