import MailspringStore from 'mailspring-store';
import {
  localized,
  Actions,
  Thread,
  Message,
  DatabaseStore,
  NativeNotifications,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

import ActivityActions from './activity-actions';
import ActivityDataSource from './activity-data-source';
import { configForPluginId, LINK_TRACKING_ID, OPEN_TRACKING_ID } from './plugin-helpers';

export function pluckByEmail(recipients, email) {
  if (email) {
    return recipients.find(r => r.email === email);
  } else if (recipients.length === 1) {
    return recipients[0];
  }
  return null;
}

class ActivityEventStore extends MailspringStore {
  _throttlingTimestamps = {};
  _actions = [];
  _unreadCount = 0;
  _messages?: Message[];
  _subscription: Rx.IDisposable;

  activate() {
    this.listenTo(ActivityActions.markViewed, this._onMarkViewed);
    this.listenTo(FocusedPerspectiveStore, this._onUpdateActivity);

    const start = () => {
      this._subscription = new ActivityDataSource()
        .buildObservable({
          messageLimit: 500,
        })
        .subscribe(messages => {
          this._messages = messages;
          this._onUpdateActivity();
        });
    };

    if (AppEnv.inSpecMode()) {
      start();
    } else {
      setTimeout(start, 2000);
    }
  }

  deactivate() {
    // todo
  }

  actions() {
    return this._actions;
  }

  actionIsUnseen(action) {
    if (!AppEnv.savedState.activityListViewed) return true;
    return action.timestamp >= AppEnv.savedState.activityListViewed;
  }

  actionIsUnnotified(action) {
    if (!AppEnv.savedState.activityListNotified) return true;
    return action.timestamp >= AppEnv.savedState.activityListNotified;
  }

  unreadCount() {
    if (this._unreadCount < 1000) {
      return this._unreadCount;
    } else if (!this._unreadCount) {
      return null;
    }
    return '999+';
  }

  focusThread(threadId) {
    AppEnv.displayWindow();
    Actions.closePopover();
    DatabaseStore.find<Thread>(Thread, threadId).then(thread => {
      if (!thread) {
        AppEnv.reportError(
          new Error(`ActivityEventStore::focusThread: Can't find thread: ${threadId}`)
        );
        AppEnv.showErrorDialog(localized(`Can't find the selected thread in your mailbox`));
        return;
      }
      Actions.ensureCategoryIsFocused('sent', thread.accountId);
      Actions.setFocus({ collection: 'thread', item: thread });
    });
  }

  _onMarkViewed() {
    AppEnv.savedState.activityListViewed = Date.now() / 1000;
    AppEnv.saveWindowState();
    this._unreadCount = 0;
    this.trigger();
  }

  _onNotificationsPosted() {
    AppEnv.savedState.activityListNotified = Date.now() / 1000;
    AppEnv.saveWindowState();
  }

  _onUpdateActivity() {
    const sidebarAccountIds = FocusedPerspectiveStore.sidebarAccountIds();

    this._actions = [];
    this._unreadCount = 0;

    if (!this._messages) {
      return;
    }

    // Build actions and notifications

    this._messages.filter(m => sidebarAccountIds.includes(m.accountId)).forEach(message => {
      const openMetadata = message.metadataForPluginId(OPEN_TRACKING_ID);
      const linkMetadata = message.metadataForPluginId(LINK_TRACKING_ID);
      if (openMetadata && openMetadata.open_count > 0) {
        this._appendActionsForMessage(message, OPEN_TRACKING_ID, cb => {
          openMetadata.open_data.forEach(open => cb(open, message.subject));
        });
      }
      if (linkMetadata && linkMetadata.links) {
        this._appendActionsForMessage(message, LINK_TRACKING_ID, cb => {
          for (const link of linkMetadata.links) {
            for (const click of link.click_data) {
              cb(click, link.title || link.url);
            }
          }
        });
      }
    });

    this._actions = this._actions.sort((a, b) => b.timestamp - a.timestamp);
    if (this._actions.length > 100) {
      this._actions.length = 100;
    }

    const unnotified = this._actions.filter(
      a => this.actionIsUnseen(a) && this.actionIsUnnotified(a)
    );

    unnotified.forEach(action => {
      const key = `${action.threadId}-${action.pluginId}`;
      const last = this._throttlingTimestamps[key];

      const config = configForPluginId(action.pluginId);
      if (last && last > Date.now() - config.notificationInterval) {
        return;
      }

      const recipientName = action.recipient
        ? action.recipient.displayName()
        : localized('Someone');

      NativeNotifications.displayNotification({
        title: localized(`New %@`, config.verb),
        subtitle: localized(`%@ recently %@ %@`, recipientName, config.predicate, action.title),
        onActivate: () => this.focusThread(action.threadId),
        tag: action.pluginId,
        canReply: false,
      });
      this._throttlingTimestamps[key] = Date.now();
    });

    this._onNotificationsPosted();
    this.trigger();
  }

  _appendActionsForMessage(message, pluginId, actionLoopFn) {
    const recipients = message.to.concat(message.cc, message.bcc);

    let actions = [];
    actionLoopFn(({ recipient, timestamp }, title) => {
      actions.push({
        messageId: message.id,
        threadId: message.threadId,
        title: title,
        recipient: pluckByEmail(recipients, recipient),
        pluginId: pluginId,
        timestamp: timestamp,
      });
    });

    // If the user oes not want to receive repeated tracking notifications for emails,
    // only show the first tracking event for each title / recipient pair, so you'd get
    // - Ben opened link 1
    // X Ben opened link 1
    // - Ben opened link 2
    // X Ben opened link 1
    // - Mark opened link 1
    if (!AppEnv.config.get('core.notifications.enabledForRepeatedTrackingEvents')) {
      const seen = {};
      actions = actions.sort((a, b) => a.timestamp - b.timestamp); // oldest to newest
      actions = actions.filter(a => {
        const key = `${a.title}${a.recipient && a.recipient.email}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
    }

    this._actions.push(...actions);
    this._unreadCount += actions.filter(a => this.actionIsUnseen(a)).length;
  }
}

export default new ActivityEventStore();
