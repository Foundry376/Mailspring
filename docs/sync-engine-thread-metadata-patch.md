# Sync Engine Change: `thread:` prefix metadata promotion on send

## Background

When a draft has plugin metadata set with a `pluginId` prefixed by `"thread:"`,
the sync engine should promote that metadata to the **thread** (not the message)
when the draft is sent. This allows plugins like send-reminders to declare
intent at draft-write time and have the sync engine do the right thing at
send time — without any client-side polling, retries, or coordination.

## File to modify

`MailSync/TaskProcessor.cpp` — function `performRemoteSendDraft`

## Exact change

Find the existing metadata loop near the bottom of `performRemoteSendDraft`
(currently around line 1764):

```cpp
// retrieve the new message and queue metadata tasks on it
for (const auto & m : draft.metadata()) {
    auto pluginId = m["pluginId"].get<string>();
    logger->info("-- Queueing task to attach {} draft metadata to new message.", pluginId);

    Task mTask{"SyncbackMetadataTask", account->id(), {
        {"modelId", localMessage->id()},
        {"modelClassName", "message"},
        {"modelHeaderMessageId", localMessage->headerMessageId()},
        {"pluginId", pluginId},
        {"value", m["value"]},
    }};
    performLocal(&mTask); // will call save
}
```

Replace with:

```cpp
// retrieve the new message and queue metadata tasks on it.
// Metadata entries whose pluginId starts with "thread:" are promoted to the
// thread (with the prefix stripped) rather than attached to the message.
// This lets plugins declare thread-level intent at draft-write time.
static const string THREAD_PREFIX = "thread:";
for (const auto & m : draft.metadata()) {
    auto pluginId = m["pluginId"].get<string>();

    if (pluginId.substr(0, THREAD_PREFIX.size()) == THREAD_PREFIX) {
        string actualPluginId = pluginId.substr(THREAD_PREFIX.size());
        string threadId = localMessage->threadId();
        logger->info("-- Queueing task to attach {} draft metadata to thread {} (thread: prefix).", actualPluginId, threadId);
        Task mTask{"SyncbackMetadataTask", account->id(), {
            {"modelId", threadId},
            {"modelClassName", "thread"},
            {"pluginId", actualPluginId},
            {"value", m["value"]},
        }};
        performLocal(&mTask); // will call save
    } else {
        logger->info("-- Queueing task to attach {} draft metadata to new message.", pluginId);
        Task mTask{"SyncbackMetadataTask", account->id(), {
            {"modelId", localMessage->id()},
            {"modelClassName", "message"},
            {"modelHeaderMessageId", localMessage->headerMessageId()},
            {"pluginId", pluginId},
            {"value", m["value"]},
        }};
        performLocal(&mTask); // will call save
    }
}
```

## Why this works

`performLocal` on a `SyncbackMetadataTask` calls `performLocalSyncbackMetadata`,
which does `store->findGeneric(type, ...)` — it already handles both `"message"`
and `"thread"` as the `modelClassName`. No other changes to the task processor
are needed.

`performLocal` also calls `store->save(task)` first, which persists the task so
that `performRemote` is later called to sync the metadata to the identity server
(for cross-device sync). This matches the existing behaviour for message metadata.

## Electron-side changes (already in this PR)

- `send-reminders-constants.ts`: exports `THREAD_PLUGIN_ID = "thread:send-reminders"`
- `send-reminders-utils.ts`: `updateDraftReminderMetadata` writes to `THREAD_PLUGIN_ID`;
  `reminderDateFor` reads from both `PLUGIN_ID` and `THREAD_PLUGIN_ID` for backward compat
- `send-reminders-store.ts`: the `_onDraftDeliverySucceeded` listener, the
  `_pendingMetadataTransfers` map, and `_completePendingTransfer` are all removed —
  the sync engine now handles the promotion, and the existing `_onDatabaseChanged`
  Thread handler fires naturally when the thread gets its reminder metadata
