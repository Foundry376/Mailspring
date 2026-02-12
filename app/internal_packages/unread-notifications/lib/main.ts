import _ from 'underscore';
import {
  Thread,
  Actions,
  AccountStore,
  Message,
  SoundRegistry,
  NativeNotifications,
  DatabaseStore,
  localized,
  DatabaseChangeRecord,
  TaskFactory,
} from 'mailspring-exports';

const WAIT_FOR_CHANGES_DELAY = 400;

export class Notifier {
  activationTime = Date.now();
  unnotifiedQueue = [];
  hasScheduledNotify = false;
  unlisteners: Array<() => void>;
  activeNotifications = {};

  constructor() {
    this.unlisteners = [DatabaseStore.listen(this._onDatabaseChanged, this)];
  }

  unlisten() {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
  }

  // async for testing
  async _onDatabaseChanged({ objectClass, objects, objectsRawJSON }: DatabaseChangeRecord<any>) {
    if (AppEnv.config.get('core.notifications.enabled') === false) {
      return;
    }

    if (objectClass === Thread.name) {
      this._onThreadsChanged(objects);
    }

    if (objectClass === Message.name) {
      const newIds = new Set<string>();
      for (const json of objectsRawJSON) {
        if (json.headersSyncComplete) newIds.add(json.id);
      }
      if (!newIds.size) return;
      this._onMessagesChanged(objects, newIds);
    }
  }

  // async for testing
  async _onMessagesChanged(msgs, newIds: Set<string>) {
    const notifworthy = {};

    for (const msg of msgs) {
      // ensure the message is unread
      if (msg.unread !== true) continue;
      // ensure the message was just created (eg: this is not a modification).
      // The sync engine attaches a JSON key to let us know that this is the first
      // message emitted about this Message. (Hooray hacks around reactive patterns)
      if (!newIds.has(msg.id)) continue;
      // ensure the message was received after the app launched (eg: not syncing an old email)
      if (!msg.date || msg.date.valueOf() < this.activationTime) continue;
      // ensure the message is not a loopback
      const account = msg.from[0] && AccountStore.accountForEmail(msg.from[0].email);
      if (msg.accountId === (account || { id: undefined }).id) continue;

      notifworthy[msg.id] = msg;
    }

    if (Object.keys(notifworthy).length === 0) {
      return;
    }

    if (!AppEnv.inSpecMode()) {
      await new Promise<void>((resolve) => {
        // wait a couple hundred milliseconds and collect any updates to these
        // new messages. This gets us message bodies, messages impacted by mail rules, etc.
        // while ensuring notifications are never too delayed.
        const unlisten = DatabaseStore.listen(({ objectClass, objects }) => {
          if (objectClass !== Message.name) {
            return;
          }
          for (const msg of objects) {
            if (notifworthy[msg.id]) {
              notifworthy[msg.id] = msg;
              if (msg.unread === false) {
                delete notifworthy[msg.id];
              }
            }
          }
        });
        setTimeout(() => {
          unlisten();
          resolve();
        }, WAIT_FOR_CHANGES_DELAY);
      });
    }

    await this._onNewMessagesReceived(Object.values(notifworthy));
  }

  _onThreadsChanged(threads) {
    // Ensure notifications are dismissed when the user reads a thread
    threads.forEach(({ id, unread }) => {
      if (!unread && this.activeNotifications[id]) {
        this.activeNotifications[id].forEach((n) => n.close());
        delete this.activeNotifications[id];
      }
    });
  }

  async _notifyAll() {
    // Extract unique sender names from the queue
    const count = this.unnotifiedQueue.length;
    const senders = [
      ...new Set(
        this.unnotifiedQueue
          .map(({ message }) => (message.from[0] ? message.from[0].displayName() : null))
          .filter(Boolean)
      ),
    ] as string[];

    await NativeNotifications.displaySummaryNotification({
      count,
      senders,
      onActivate: () => {
        AppEnv.displayWindow();
      },
    });
    // Only remove the items we counted — new items may have been queued during the await
    this.unnotifiedQueue.splice(0, count);
  }

  async _notifyOne({ message, thread }) {
    const from = message.from[0] ? message.from[0].displayName() : 'Unknown';
    const title = from;
    let subtitle = null;
    let body = null;
    if (message.subject && message.subject.length > 0) {
      subtitle = message.subject;
      body = message.snippet;
    } else {
      subtitle = message.snippet;
      body = null;
    }

    const notification = await NativeNotifications.displayNotification({
      title: title,
      subtitle: subtitle,
      body: body,
      tag: `thread-${thread.id}`,
      threadId: thread.id,
      messageId: message.id,

      // macOS inline reply
      canReply: true,
      replyPlaceholder: localized('Reply to %@...', from),

      // macOS action buttons
      actions: [
        { type: 'button', text: localized('Mark as Read') },
        { type: 'button', text: localized('Archive') },
      ],

      onActivate: ({ response, activationType, actionIndex }) => {
        if (activationType === 'replied' && response && typeof response === 'string') {
          Actions.sendQuickReply({ thread, message }, response);
        } else if (activationType === 'action') {
          this._handleNotificationAction(actionIndex, thread);
        } else if (activationType === 'clicked') {
          AppEnv.displayWindow();
          if (!thread) {
            AppEnv.showErrorDialog(`Can't find that thread`);
            return;
          }
          Actions.ensureCategoryIsFocused('inbox', thread.accountId);
          Actions.setFocus({ collection: 'thread', item: thread });
        }
      },
    });

    if (notification) {
      if (!this.activeNotifications[thread.id]) {
        this.activeNotifications[thread.id] = [notification];
      } else {
        this.activeNotifications[thread.id].push(notification);
      }
    }
  }

  _handleNotificationAction(actionIndex: number, thread: Thread) {
    AppEnv.displayWindow();

    switch (actionIndex) {
      case 0: // Mark as Read
        Actions.queueTask(
          TaskFactory.taskForSettingUnread({
            threads: [thread],
            unread: false,
            source: 'Notification Action',
          })
        );
        break;
      case 1: // Archive
        Actions.queueTasks(
          TaskFactory.tasksForArchiving({
            threads: [thread],
            source: 'Notification Action',
          })
        );
        break;
    }
  }

  async _notifyMessages() {
    // Set the guard immediately to prevent concurrent re-entry during async operations.
    // Without this, a second _onNewMessagesReceived call during the await below would
    // start a concurrent _notifyMessages, causing duplicate or conflicting notifications.
    this.hasScheduledNotify = true;

    if (this.unnotifiedQueue.length >= 5) {
      await this._notifyAll();
    } else if (this.unnotifiedQueue.length > 0) {
      await this._notifyOne(this.unnotifiedQueue.shift());
    }

    if (this.unnotifiedQueue.length > 0) {
      setTimeout(() => this._notifyMessages(), 2000);
    } else {
      this.hasScheduledNotify = false;
    }
  }

  _playNewMailSound = _.debounce(
    () => {
      if (!AppEnv.config.get('core.notifications.sounds')) return;
      SoundRegistry.playSound('new-mail');
    },
    5000,
    true
  );

  _onNewMessagesReceived(newMessages) {
    if (newMessages.length === 0) {
      return Promise.resolve();
    }

    // For each message, find it's corresponding thread. First, look to see
    // if it's already in the `incoming` payload (sent via delta sync
    // at the same time as the message.) If it's not, try loading it from
    // the local cache.

    const threadIds = {};
    for (const { threadId } of newMessages) {
      threadIds[threadId] = true;
    }

    // TODO: Use xGMLabels + folder on message to identify which ones
    // are in the inbox to avoid needing threads here.
    return DatabaseStore.findAll<Thread>(
      Thread,
      Thread.attributes.id.in(Object.keys(threadIds))
    ).then((threadsArray) => {
      const threads = {};
      for (const t of threadsArray) {
        threads[t.id] = t;
      }

      // Filter new messages to just the ones in the inbox
      const newMessagesInInbox = newMessages.filter(({ threadId }) => {
        return threads[threadId] && threads[threadId].categories.find((c) => c.role === 'inbox');
      });

      if (newMessagesInInbox.length === 0) {
        return;
      }

      for (const msg of newMessagesInInbox) {
        this.unnotifiedQueue.push({ message: msg, thread: threads[msg.threadId] });
      }
      if (!this.hasScheduledNotify) {
        this._playNewMailSound();
        this._notifyMessages();
      }
    });
  }
}

export const config = {
  enabled: {
    type: 'boolean',
    default: true,
  },
};

export function activate() {
  this.notifier = new Notifier();
}

export function deactivate() {
  this.notifier.unlisten();
}
