import {
  Thread,
  Message,
  Actions,
  localized,
  DatabaseStore,
  FeatureUsageStore,
  SyncbackMetadataTask,
} from 'mailspring-exports';

import { PLUGIN_ID } from './send-reminders-constants';

export function reminderDateFor(draftOrThread) {
  return ((draftOrThread && draftOrThread.metadataForPluginId(PLUGIN_ID)) || {}).expiration;
}

async function incrementMetadataUse(model, expiration) {
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

function assertMetadataShape(value) {
  const t = { ...value };
  if (t.expiration && !(t.expiration instanceof Date)) {
    throw new Error(`"expiration" should always be absent or a date. Received ${t.expiration}`);
  }
  if (t.lastReplyTimestamp && !(t.lastReplyTimestamp < Date.now() / 100)) {
    throw new Error(
      `"lastReplyTimestamp" should always be a unix timestamp in seconds. Received ${
        t.lastReplyTimestamp
      }`
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

export async function updateReminderMetadata(thread, metadataValue) {
  assertMetadataShape(metadataValue);

  if (!await incrementMetadataUse(thread, metadataValue.expiration)) {
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

export async function updateDraftReminderMetadata(draftSession, metadataValue) {
  assertMetadataShape(metadataValue);

  if (!await incrementMetadataUse(draftSession.draft(), metadataValue.expiration)) {
    return;
  }
  draftSession.changes.add({ pristine: false });
  draftSession.changes.addPluginMetadata(PLUGIN_ID, metadataValue);
}

export async function transferReminderMetadataFromDraftToThread({ accountId, headerMessageId }) {
  let message = await DatabaseStore.findBy<Message>(Message, { accountId, headerMessageId });
  if (!message) {
    // The task has just completed, wait a moment to see if the message appears. Testing to
    // see whether this resolves https://sentry.io/foundry-376-llc/mailspring/issues/363208698/
    await Promise.delay(1500);
    message = await DatabaseStore.findBy<Message>(Message, { accountId, headerMessageId });
    if (!message) {
      throw new Error('SendReminders: Could not find message to update');
    }
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
