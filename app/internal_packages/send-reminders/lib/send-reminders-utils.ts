import {
  Thread,
  Message,
  Actions,
  localized,
  FeatureUsageStore,
  SyncbackMetadataTask,
  DraftEditingSession,
} from 'mailspring-exports';

import { PLUGIN_ID, THREAD_PLUGIN_ID } from './send-reminders-constants';

export function reminderDateFor(draftOrThread: Thread | Message | null) {
  if (!draftOrThread) return undefined;
  // Check THREAD_PLUGIN_ID first: new drafts have reminder metadata stored
  // under this key (written by updateDraftReminderMetadata) so the sync engine
  // can promote it to the thread on send. Fall back to PLUGIN_ID for threads,
  // sent messages, and drafts saved before this convention was introduced.
  const meta = (draftOrThread.metadataForPluginId(THREAD_PLUGIN_ID) ||
    draftOrThread.metadataForPluginId(PLUGIN_ID) ||
    {}) as Record<string, unknown>;
  return meta.expiration as Date | undefined;
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
  // Write using THREAD_PLUGIN_ID so the sync engine automatically promotes
  // this metadata to the thread when the draft is sent — no client-side
  // coordination required after send.
  draftSession.changes.addPluginMetadata(THREAD_PLUGIN_ID, metadataValue);
}
