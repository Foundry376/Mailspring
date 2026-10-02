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

import * as ActivityActions from './activity-actions';
import ActivityDataSource from './activity-data-source';
import { configForPluginId } from './plugin-helpers';
import { ActivityEvent, eventsForMessage } from './activity-events';

class ActivityEventStore extends MailspringStore {
  _throttlingTimestamps = {};
  _actions: ActivityEvent[] = [];
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
        .subscribe((messages) => {
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

  actionIsUnseen(action: ActivityEvent) {
    if (!AppEnv.savedState.activityListViewed) return true;
    return action.timestamp >= AppEnv.savedState.activityListViewed;
  }

  actionIsUnnotified(action: ActivityEvent) {
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

  focusThread(threadId: string) {
    AppEnv.displayWindow();
    Actions.closePopover();
    this._withThread(threadId, (thread) => {
      Actions.ensureCategoryIsFocused('sent', thread.accountId);
      Actions.setFocus({ collection: 'thread', item: thread });
    });
  }

  popoutThread(threadId: string) {
    this._withThread(threadId, (thread) => Actions.popoutThread(thread));
  }

  _withThread(threadId: string, callback: (thread: Thread) => void) {
    DatabaseStore.find<Thread>(Thread, threadId).then((thread) => {
      if (!thread) {
        AppEnv.reportError(
          new Error(`ActivityEventStore::_withThread: Can't find thread: ${threadId}`)
        );
        AppEnv.showErrorDialog(localized(`Can't find the selected thread in your mailbox`));
        return;
      }
      callback(thread);
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

    const includeRepeats = !!AppEnv.config.get(
      'core.notifications.enabledForRepeatedTrackingEvents'
    );

    this._messages
      .filter((m) => sidebarAccountIds.includes(m.accountId))
      .forEach((message) => {
        const events = eventsForMessage(message, { includeRepeats });
        this._actions.push(...events);
        this._unreadCount += events.filter((e) => this.actionIsUnseen(e)).length;
      });

    this._actions = this._actions.sort((a, b) => b.timestamp - a.timestamp);
    if (this._actions.length > 100) {
      this._actions.length = 100;
    }

    const unnotified = this._actions.filter(
      (a) => this.actionIsUnseen(a) && this.actionIsUnnotified(a)
    );

    unnotified.forEach((action) => {
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
}

export default new ActivityEventStore();
