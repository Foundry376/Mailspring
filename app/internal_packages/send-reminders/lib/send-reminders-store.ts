import {
  Actions,
  FocusedContentStore,
  SendDraftTask,
  DatabaseStore,
  Thread,
  Message,
  DraftFactory,
  DatabaseChangeRecord,
} from 'mailspring-exports';
import MailspringStore from 'mailspring-store';

import { PLUGIN_ID } from './send-reminders-constants';
import { updateReminderMetadata } from './send-reminders-utils';

class SendRemindersStore extends MailspringStore {
  _lastFocusedThread = null;
  _unsubscribers: (() => void)[] = [];

  // Tracks drafts that have been sent but whose sent message hasn't yet appeared
  // in the local database. Keyed by headerMessageId → accountId.
  //
  // We intentionally keep this in memory only. If the app is restarted before the
  // sync engine returns the sent message, the reminder will already be attached to
  // the sent message itself (via pluginMetadata), so it isn't lost — it just won't
  // have been promoted to the thread yet. That's the same behaviour as before.
  _pendingMetadataTransfers: Map<string, string> = new Map();

  activate() {
    this._unsubscribers = [
      FocusedContentStore.listen(this._onFocusedContentChanged),
      Actions.draftDeliverySucceeded.listen(this._onDraftDeliverySucceeded),
      DatabaseStore.listen(this._onDatabaseChanged),
    ];
  }

  deactivate() {
    this._unsubscribers.forEach((unsub) => unsub());
  }

  _sendReminderEmail = async (thread: Thread, sentHeaderMessageId: string) => {
    const body = `
      <strong>Mailspring Reminder:</strong> This thread has been moved to the top of
      your inbox by Mailspring because no one has replied to your message.</p>
      <p>--The Mailspring Team</p>`;

    const draft = await DraftFactory.createDraftForResurfacing(thread, sentHeaderMessageId, body);
    Actions.queueTask(SendDraftTask.forSending(draft, { silent: true }));
  };

  _onDraftDeliverySucceeded = async ({ headerMessageId, accountId }) => {
    // Register this headerMessageId as pending. _onDatabaseChanged will complete
    // the transfer when the corresponding sent message appears in the local DB —
    // however long that takes. No arbitrary timeouts needed.
    this._pendingMetadataTransfers.set(headerMessageId, accountId);

    // Optimistically check right now in case the message has already been synced
    // (e.g. fast local/SMTP account, or a retry of a previously interrupted send).
    const messages = await DatabaseStore.findAll<Message>(Message, { headerMessageId });
    const message = messages.find((m) => m.accountId === accountId);
    if (message) {
      this._completePendingTransfer(message);
    }
  };

  _completePendingTransfer = async (message: Message) => {
    const { headerMessageId, accountId } = message;

    if (this._pendingMetadataTransfers.get(headerMessageId) !== accountId) {
      return;
    }

    // Remove from the pending map before any await so that a second change record
    // arriving while we are awaiting the thread lookup doesn't trigger a duplicate.
    this._pendingMetadataTransfers.delete(headerMessageId);

    const metadata = message.metadataForPluginId(PLUGIN_ID) || {};
    if (!metadata || !metadata.expiration) {
      // No reminder was set on this draft — nothing to transfer.
      return;
    }

    const thread = await DatabaseStore.find<Thread>(Thread, message.threadId);
    if (!thread) {
      // Very unlikely: the message arrived but the thread hasn't landed yet.
      // Log and bail — the metadata stays on the message and won't be promoted.
      console.warn(
        `SendReminders: message ${headerMessageId} arrived but thread ${message.threadId} not yet in DB. Reminder will not be transferred to thread.`
      );
      return;
    }

    updateReminderMetadata(thread, {
      expiration: metadata.expiration,
      sentHeaderMessageId: metadata.sentHeaderMessageId,
      lastReplyTimestamp: new Date(thread.lastMessageReceivedTimestamp).getTime() / 1000,
      shouldNotify: false,
    });
  };

  _onDatabaseChanged = ({ type, objects, objectClass }: DatabaseChangeRecord<Thread | Message>) => {
    if (!AppEnv.isMainWindow()) {
      return;
    }

    if (type === 'unpersist') {
      return;
    }

    // Check whether any newly-arrived messages complete a pending metadata transfer.
    // This is the primary path that replaces the old polling-with-timeouts approach.
    if (objectClass === Message.name) {
      for (const message of objects as Message[]) {
        if (this._pendingMetadataTransfers.has(message.headerMessageId)) {
          this._completePendingTransfer(message);
        }
      }
      return;
    }

    if (objectClass !== Thread.name) {
      return;
    }

    // Thread-level reminder bookkeeping: clear reminders when a reply arrives,
    // and fire reminder emails when metadata expires.
    for (const thread of objects as Thread[]) {
      const metadata = thread.metadataForPluginId(PLUGIN_ID);
      if (!metadata || !metadata.expiration) {
        continue;
      }

      // has a new message arrived on the thread? if so, clear the metadata completely
      const currentReplyTimestamp = new Date(thread.lastMessageReceivedTimestamp).getTime() / 1000;
      if (metadata.lastReplyTimestamp !== currentReplyTimestamp) {
        updateReminderMetadata(thread, {});
        continue;
      }

      // has the metadata expired? If so, send the reminder email and
      // advance metadata into the "notify" phase.
      if (type === 'metadata-expiration' && metadata.expiration <= new Date()) {
        // mark that the email should enter the notification highlight state
        updateReminderMetadata(thread, { ...metadata, expiration: null, shouldNotify: true });
        // send an email on the thread, causing the thread to move up in the inbox
        this._sendReminderEmail(thread, metadata.sentHeaderMessageId);
      }
    }
  };

  _onFocusedContentChanged = () => {
    const thread = FocusedContentStore.focused('thread') || null;
    const didUnfocusLastThread =
      (!thread && this._lastFocusedThread) ||
      (thread && this._lastFocusedThread && thread.id !== this._lastFocusedThread.id);
    // When we unfocus a thread that had `shouldNotify == true`, it means that
    // we have acknowledged the notification, or in this case, the reminder. If
    // that's the case, set `shouldNotify` to false.
    if (didUnfocusLastThread) {
      const metadata = this._lastFocusedThread.metadataForPluginId(PLUGIN_ID);
      if (metadata && metadata.shouldNotify) {
        updateReminderMetadata(this._lastFocusedThread, {});
      }
    }
    this._lastFocusedThread = thread;
  };
}

export default new SendRemindersStore();
