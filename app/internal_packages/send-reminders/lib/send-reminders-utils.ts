import {
  Thread,
  Message,
  Actions,
  localized,
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
