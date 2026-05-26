import {
  Thread,
  Message,
  Actions,
  localized,
  DatabaseStore,
  FeatureUsageStore,
  SyncbackMetadataTask,
  DraftEditingSession,
} from 'mailspring-exports';

import { PLUGIN_ID } from './send-reminders-constants';

export function reminderDateFor(draftOrThread: Thread | Message | null) {
  return ((draftOrThread && draftOrThread.metadataForPluginId(PLUGIN_ID)) || {}).expiration;
}

async function incrementMetadataUse(model: Thread | Message, expiration: Date | null) {
  if (reminderDateFor(model)) {
    return true;
  }
  try {
    await FeatureUsageStore.markUsedOrUpgrade(PLUGIN_ID, {
      headerText: localized('All Reminders Used'),
      rechargeText: `${localized(
        `You can add reminders to %1$@ emails each %2$@ with Mailspring Basic.`
      )} ${localized('Upgrade to Pro today!')}`,
      iconUrl: 'mailspring://send-reminders/assets/ic-send-reminders-modal@2x.png',
    });
  } catch (error) {
    if (error instanceof FeatureUsageStore.NoProAccessError) {
      return false;
    }
  }
  return true;
}

function assertMetadataShape(value: Record<string, unknown>) {
  const t = { ...value };
  if (t.expiration && !(t.expiration instanceof Date)) {
    throw new Error(`"expiration" should always be absent or a date. Received ${t.expiration}`);
  }
  if (t.lastReplyTimestamp && !((t.lastReplyTimestamp as number) < Date.now() / 100)) {
    throw new Error(
      `"lastReplyTimestamp" should always be a unix timestamp in seconds. Received ${t.lastReplyTimestamp}`
    );
  }
  delete t.expiration;
  delete t.shouldNotify;
  delete t.sentHeaderMessageId;
  delete t.lastReplyTimestamp;
  if (Object.keys(t).length > 0) {
    throw new Error(`Unexpected keys in metadata: ${Object.keys(t)}`);
  }
}

export async function updateReminderMetadata(
  thread: Thread,
  metadataValue: Record<string, unknown>
) {
  assertMetadataShape(metadataValue);

  if (!(await incrementMetadataUse(thread, metadataValue.expiration as Date | null))) {
    return;
  }
  Actions.queueTask(
    SyncbackMetadataTask.forSaving({
      model: thread,
      pluginId: PLUGIN_ID,
      value: metadataValue,
    })
  );
}

export async function updateDraftReminderMetadata(
  draftSession: DraftEditingSession,
  metadataValue: Record<string, unknown>
) {
  assertMetadataShape(metadataValue);

  if (
    !(await incrementMetadataUse(draftSession.draft(), metadataValue.expiration as Date | null))
  ) {
    return;
  }
  draftSession.changes.add({ pristine: false });
  draftSession.changes.addPluginMetadata(PLUGIN_ID, metadataValue);
}

export async function findMessage({ accountId, headerMessageId }) {
  // This is an unusual query (accountId + headerMessageId) we don't make in many places,
  // on a message that is (no longer) a draft and could exist in more than one of your
  // accounts if you sent it to yourself. To make this more performant, we do a find
  // and then a filter in code.
  return (await DatabaseStore.findAll<Message>(Message, { headerMessageId })).find(
    (m) => m.accountId === accountId
  );
}

export async function transferReminderMetadataFromDraftToThread({ accountId, headerMessageId }) {
  let message = await findMessage({ accountId, headerMessageId });
  const delay = [1500, 1500, 10000, 10000, 15000, 22000];

  // The sent message should already be synced, but if the send taks was interrupted and completed
  // without finalizing / cleaning up, we may need to go through a sync cycle. Do this before giving up.
  let ms = 0;
  while (!message && (ms = delay.shift())) {
    await Promise.delay(ms);
    message = await findMessage({ accountId, headerMessageId });
  }

  if (!message) {
    // The message was sent successfully but the sync engine has not yet synced it back
    // from the server (even after our retry window). This is a transient condition we
    // cannot recover from here — log a warning so it's still visible in local logs,
    // but don't throw so callers don't end up with unhandled promise rejections.
    console.warn(
      `SendReminders: Could not find sent message (headerMessageId=${headerMessageId}, accountId=${accountId}) after multiple retries. The send-reminder for this draft may not have been transferred to the thread.`
    );
    return;
  }

  const metadata = message.metadataForPluginId(PLUGIN_ID) || {};
  if (!metadata || !metadata.expiration) {
    return;
  }

  const thread = await DatabaseStore.find<Thread>(Thread, message.threadId);
  if (!thread) {
    throw new Error('SendReminders: Could not find thread to update');
  }
  updateReminderMetadata(thread, {
    expiration: metadata.expiration,
    sentHeaderMessageId: metadata.sentHeaderMessageId,
    lastReplyTimestamp: new Date(thread.lastMessageReceivedTimestamp).getTime() / 1000,
    shouldNotify: false,
  });
}
