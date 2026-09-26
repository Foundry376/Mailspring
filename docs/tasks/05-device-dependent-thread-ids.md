# 05 — Thread ids depend on which device synced first

Read `README.md` first for how to test. This is a design problem. The right fix is not yet known, so explore the options and propose one before implementing anything.

## Symptom

During a live test on 2026-09-24/25, two Mailspring instances synced the same accounts from scratch. In the synced data:

- 9 O365 messages and 4 Gmail messages sat in threads with **different thread ids** on the two instances. Example: `t:i5Mxqxia…` on the primary and `t:ZXYmeFUr…` on the second.
- Message ids matched everywhere, because they come from a hash of the headers.

This matters because thread-level plugin metadata is keyed by thread id. That includes snooze, send-reminders, and plugin data a draft promotes to its thread (the `thread:` pluginId prefix in `performRemoteSendDraft`). This metadata syncs through id.getmailspring.com. On a device that named the thread differently, the metadata doesn't attach:

- the thread isn't shown as snoozed;
- the reminder doesn't show;
- the metadata may sit in `DetatchedPluginMetadata` forever.

Every thread in that test happened to agree, so this hasn't been seen causing a user-visible failure yet. It is still REAL for anyone using Mailspring on more than one machine, or who rebuilds their database.

This predates the placements work: `master` 0df7864 behaves the same way.

## Cause

`Thread::Thread` (`MailSync/Models/Thread.cpp`, ~line 24) builds the id as `"t:" + msgId`, where `msgId` is the message that *created* the thread on this device (`MailProcessor::insertMessage`). Which message that is depends on:

- **sync order.** Initial sync walks folders newest-first. Folders are processed in role order (inbox, sent, drafts, all, archive, …), and the foreground worker ingests the inbox concurrently. So the first message of a thread that a device happens to ingest varies;
- **threading.** Before the rest of a thread arrives, a reply can create its own thread. Threads are joined by `ThreadReference` (References/In-Reply-To) or by Gmail's `X-GM-THRID` (`gThrId`). Messages that arrive out of order may create a thread which later messages then join.

On Gmail the grouping itself is deterministic (`gThrId`), but the *id* still comes from whichever message arrived first.

## Options to evaluate

1. **Derive the id from something every device agrees on.**
   - Gmail: `"t:" + gThrId`. It's stable, but existing ids would change, so this needs a migration or an alias.
   - Other providers: the root of the References chain. That's the first entry of `References`, or the message's own Message-ID if it has none, hashed with the account id. Replies that arrive before the root would still compute the same id, since they carry the root in their References.

   Edge cases to check: missing or truncated References (some clients cap them), subject-only threading, and whether two separately-rooted threads ever merge.
2. **Keep ids, and make metadata lookup tolerant.** When thread metadata arrives for an unknown thread id, attach it by finding a thread that contains a message the sender's device had in that thread. That needs the sender to include a message id or headerMessageId alongside the thread metadata. This probably touches id.getmailspring.com metadata payloads and the client.
3. **Move thread-level metadata to the root message.** Store it on a message id, which is stable across devices, and have the client read thread state through that message.

Each option has migration cost: existing thread ids are referenced by `ThreadCategory`, `ThreadCounts`, `ThreadSearch`, `ThreadReference`, `Message.threadId`, `ModelPluginMetadata`, and synced metadata on the server. Weigh them against the realism rule, and prefer the option with the least moving parts.

## Investigation first

- Measure how often ids diverge on real accounts. Compare two fresh syncs of the same account with a small script over both `edgehill.db` files, the same way the live test's `metacmp.py` did. Break it down by provider, and by whether the thread has `gThrId`.
- For the threads that diverge, find out why: ingest order or a thread join. Look at their messages' References.

## Testing

- **Harness.** Add a scenario that syncs the same mailbox twice from empty, with different ingest orders. For example, a second run where the fake server returns messages in a different order, or where a reply sits in an earlier-scanned folder than its root. Assert the thread ids match. This needs a harness step to run a second engine against the same server with a fresh config directory.
- **Live.** Use two fresh instances on the same accounts, then compare thread ids and thread-level metadata (snooze a thread on one device and check it shows as snoozed on the other).
