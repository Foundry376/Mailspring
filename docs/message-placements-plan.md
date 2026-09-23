# Message Placements: one message, many folders

Technical plan for replacing `Message.remoteFolderId` / `remoteUID` with a `MessageFolder`
join table so that a message can exist in more than one IMAP folder at once.

Status: implemented on branch `message-placements` in both repos (engine: over `0df7864`,
through `67469d4`; client: over `add26bb96`), 2026-09-20, then revised after a review pass
(see §10). Verified against Dovecot 2.3.21 (all §5 Phase 6 scenarios) and on a migrated
284k-message database syncing Office 365, Yahoo and two Gmail accounts: zero folder/UID flips,
28 + 13 messages with placements in two folders, 69 + 6 with duplicate copies in one folder,
all stable. The engine's `CLAUDE.md` ("Message Identity and Placements") is the maintained
summary of the invariants; this document keeps the rationale. Line numbers below cite the
pre-change tree at `203637b` and are approximate for the implemented code.

---

## 1. Problem

`Message.id` is a deterministic hash of headers (`MailUtils::idForMessage`, `MailUtils.cpp:635`):
account + date + subject + sorted recipients + Message-ID. The folder is not part of the hash,
which is what lets Mailspring recognise a message after it moves and keep plugin metadata
(snooze, reminders, open/link tracking, thread sharing) attached to it. The same property
means that when one message physically exists in two folders, both copies collapse onto one
row, and `MailProcessor::updateMessage` applies "latest folder wins".

Observed on 2026-09-19 with a wiped database and four accounts:

| Account | Symptom | Cause |
|---|---|---|
| Office 365 | 28 messages flip INBOX ↔ Sent Items every sync pass (495 folder flips in 25 min) | self-addressed mail: SMTP delivers to Inbox, client saves to Sent |
| Yahoo | 15 messages flip INBOX ↔ Sent, unread flag flips with them | same |
| Office 365 | 67 messages flip `remoteUID` inside Sent Items every pass | 2–4 physical copies per message at adjacent UIDs (Exchange auto-save racing Mailspring's own APPEND) |
| ProtonMail (forum) | Inbox ↔ `Labels/*` ping-pong, `\All` mailbox empties Inbox and Sent | Bridge exposes every message in several mailboxes |
| iCloud, NetEase | same shape; patched by a provider-gated folder-priority rule (`MailProcessor.cpp:188`) | |

The priority rule is a per-provider patch on top of a model that cannot represent the truth.
Each patch trades one failure (flapping) for another (moves out of a high-priority folder are
not reflected until the source folder is rescanned, and flag updates from the losing copy are
dropped). The fix is to let the model say what is true: a logical message currently has
physical copies *here* and *here*.

### Why this is smaller than it sounds

The client already lives in a many-folders world. Folder views are built from
`ThreadCategory`, threads carry `folders[]` and `labels[]`, Gmail messages already have a set
of labels on one row, and the client never reads `remoteFolderId` or `remoteUID` — it has
exactly seven read sites for `message.folder`, none of them in a query. Optimistic UI state is
100% engine-driven (the client mutates nothing; it queues a task and waits for deltas). The
single-folder assumption is almost entirely a sync-engine fact: ~90 sites, concentrated in
`TaskProcessor.cpp` (33) and `SyncWorker.cpp` (27).

---

## 2. Design

### 2.1 Vocabulary

- **Message** — the logical message: one row, id = header hash, owns headers, body reference,
  thread membership, plugin metadata. Unchanged identity.
- **Placement** — one physical copy on the server: `(account, folder, UID)` plus that copy's
  IMAP flags. A message has one or more placements. A placement is not a `MailModel` and is
  never streamed to the client on its own.
- **Orphan** — a message with no placement left, listed in `MessageOrphan` with the time it
  lost its last copy. It is kept until the folders have been scanned in full since then, so
  a move seen as "gone from A" before "present in B" does not delete the message. A vanished
  copy of a message that still has another copy needs no grace: its row is deleted at once.

### 2.2 Schema

```sql
-- V10
CREATE TABLE IF NOT EXISTS MessageFolder (
  rowid           INTEGER PRIMARY KEY,
  accountId       VARCHAR(8)  NOT NULL,
  messageId       VARCHAR(40) NOT NULL,
  folderId        VARCHAR(40) NOT NULL,
  remoteUID       INTEGER     NOT NULL,          -- 0 = not on the server (local draft, UIDVALIDITY reset)
  unread          TINYINT(1)  NOT NULL DEFAULT 0,
  starred         TINYINT(1)  NOT NULL DEFAULT 0,
  draft           TINYINT(1)  NOT NULL DEFAULT 0,
  remoteXGMLabels TEXT        NOT NULL DEFAULT '[]',
  pendingFolderId VARCHAR(40) NULL                -- optimistic move in flight (§2.7)
);
-- messages with no MessageFolder row, and since when (§2.5)
CREATE TABLE IF NOT EXISTS MessageOrphan (
  messageId VARCHAR(40) PRIMARY KEY,
  accountId VARCHAR(8)  NOT NULL,
  since     INTEGER     NOT NULL
);
-- a (folder, UID) pair is unique on the server until UIDVALIDITY changes; UID 0 rows are exempt
CREATE UNIQUE INDEX IF NOT EXISTS MessageFolderUIDIndex
  ON MessageFolder (accountId, folderId, remoteUID) WHERE remoteUID > 0;
CREATE INDEX IF NOT EXISTS MessageFolderMessageIndex ON MessageFolder (messageId);
CREATE INDEX IF NOT EXISTS MessageOrphanSinceIndex ON MessageOrphan (accountId, since);
-- drives the body-sync queries newest-first with a correlated placement check
CREATE INDEX IF NOT EXISTS MessageListDateIndex ON Message (accountId, date DESC);
```

Decisions folded into this DDL:

- **A placement is a physical copy, not a `(message, folder)` pair.** A message may own
  several UIDs in one folder (the Office 365 Sent Items case). With `(message, folder)` as
  the key, the second UID is "unknown" to every range scan, gets re-fetched as a new message
  on every pass, and flag STOREs / moves / expunges touch only one copy so the other comes
  back. With the natural server key, the range scan knows both UIDs, nothing is re-fetched,
  and `performRemoteChangeOnMessages` addresses every copy because it groups UIDs by folder.
  Thread folder refcounts count *distinct folders* per message, not placements.
- `remoteUID = 0` is allowed multiple times per folder (partial unique index) because local
  drafts and UIDVALIDITY-reset rows both use it.
- `unread`/`starred`/`draft`/`remoteXGMLabels` live on the placement because IMAP flags are
  per-copy and `MessageAttributesMatch` (`MailStore.cpp:74`) compares per-UID.
- `Message` keeps **derived** `unread`, `starred`, `draft` columns (OR across its placements;
  an orphan keeps the values it had — see §2.6). The client declares them queryable and `draft = 1`
  backs the draft list and MCP queries. `Message.remoteUID`, `remoteFolderId`,
  `remoteXGMLabels` and `MessageUIDScanIndex` are **removed** — no dead columns, no
  compatibility shims, so "is anything still reading the old location?" is answered by the
  compiler and by `grep`, not by an audit. The migration rebuilds the `Message` table once
  (§4) rather than issuing three `DROP COLUMN`s, and the same pass rewrites the `data` JSON to
  the new contract (§2.4).
- `WITHOUT ROWID` was considered and rejected: the natural key includes `remoteUID`, which
  changes on relink and is 0 for drafts; a rowid table with a partial unique index is simpler.
- A row carries no timestamp. The `syncedAt` guard is message-level (§2.6), and the only
  time the sweep needs is when a message lost its *last* copy, which is per message.
- The orphan record is a separate table rather than a `Message` column because
  `MailStore::save` rebinds every `Message` column from the model, so a column written in
  SQL by a bulk helper would be overwritten by the next save of a stale model.

Measured on a 1.15 GB / 258k-message database (SQLite 3.51.1, bundled), on a row layout with
two more integer columns than the one above, so the size is an upper bound: the join table
plus UID index costs ~240 B per placement (+62 MB, ~5% of the DB), and the hottest sync query
(`fetchMessagesAttributesInRange` over 177k rows) drops from 0.79 s to 0.11 s because the
fat `Message` row no longer has to be visited for `remoteXGMLabels`.

### 2.3 Table is canonical; Message JSON carries a snapshot rebuilt on save

Two sources of truth were proposed by different assessments (placements canonical in
`Message._data` with the table as a derived index, vs. the table canonical with a JSON
snapshot). The decision is **table-canonical**, with the JSON snapshot **rebuilt from the
rows when a message whose rows changed is saved**.

> Every change to the placement set goes through one of a small set of `MailStore` helpers.
> A helper that takes a `Message` writes the row(s) and sets `Message::_placementsChanged`;
> `Message::beforeSave` then runs `refreshMessageFromPlacements`, which rebuilds
> `_data["folders"]`, the derived flags and labels, and the `MessageOrphan` record from the
> rows, and clears the flag. There is no other writer of the table, the snapshot or the
> orphan record.

Rebuilding on every save would cost an indexed read on every `Message` save by any sync
process. Keying it on the flag costs one query per save that changed rows and nothing
otherwise, and it runs once however many helpers touched the message (a multi-copy move
commits, re-marks and restores each copy). A helper cannot forget to update the snapshot,
because it never does so itself. A caller that must see the result before deciding whether
to save calls `refreshMessageFromPlacements` directly: `insertMessage` (the thread diff is
applied before the save), `updateMessage` and `refreshMessagesInOpenTransaction` (skip the
save and delta when nothing client-visible changed), and `performRemoteChangeOnMessages`
(drops the deltas of a remote phase the client cannot see).

| Event | Message loaded? | Helper |
|---|---|---|
| Scan finds a new/changed copy (`insertFallbackToUpdateMessage`) | yes — reloaded inside the transaction (§2.6) | `upsertPlacement(msg, folder, uid, attrs)`; Gmail also `removePlacementsOutsideFolder` (§2.8) |
| Task local/remote phase (move, flags, labels, send, draft destroy) | yes — inflated by the task | `setPlacementUnread/Starred/Labels`, `beginPlacementMove`, `commitPlacementMove`, `abandonPlacementMove`, `removePlacement` |
| Copy vanishes from a folder | **no** — bulk `DELETE … WHERE folderId AND remoteUID IN (…) RETURNING messageId` | `deleteVanishedPlacements(folder, uids / range)` records the messages left with no row in `MessageOrphan` in the same transaction and returns the affected ids; the caller loads those (and only those) in chunks of 100, marks and saves them, so the client sees the copy leave (§2.5). Per *vanished* message, not per visited message. |
| UIDVALIDITY reset / relink | no | `resetPlacementUIDs` is SQL only; UIDs are not in the JSON, so nothing to maintain. `deleteUnassignedPlacements` then behaves like a vanish. |
| Sweep removes an orphan | yes — `store->remove` needs it for `afterRemove` | `orphanMessageIdsBefore`, then `store->remove`; `Message::afterRemove` calls `deletePlacementsForMessage`, which also drops the orphan record |
| Folder deleted on the server, or `ExpungeAllInFolder` | yes, in chunks of 100 | `detachMessagesFromFolder`: per chunk, `deletePlacementsForFolder` and the affected messages' refresh in one transaction; a message whose only copy was there is removed at once. Rare. |

`MessageOrphan` is exact once a transaction commits: a message is listed if and only if it
has no `MessageFolder` row. The bulk helpers record orphans in SQL in the same transaction
as the delete because the snapshots are caught up in later transactions, and nothing but
`MessageOrphan` leads back to a message that has no row; without it such a message would be
invisible to the client and immortal in the database.

Unchanged copies never load a Message at all: `syncFolderUIDRange` diffs
`fetchMessagesAttributesInRange` (now a covering read of `MessageFolder`) against the server
listing and only touches rows whose UID or flags differ.

Consequences:

- UID-only operations (relink after UIDVALIDITY, duplicate-UID bookkeeping) are single
  raw-SQL statements that touch no `Message` row and emit nothing. Today a UIDVALIDITY reset
  on a 100k-message folder loads and rewrites 100k fat JSON rows through
  `unlinkMessagesMatchingQuery` (`MailProcessor.cpp:519-560`, whose own comment apologises
  for this). It becomes one `UPDATE`.
- Anything client-visible (folder set, flags, labels) goes through `store->save(message)`,
  which emits exactly one `persist Message` delta carrying the new `folders`. `Message`
  remains the only delta carrier; `MessageFolder` has no `__cls` and is never streamed.
  This matters: `Utils.convertToModel` throws on an unregistered `__cls`
  (`app/src/flux/models/utils.ts:72-78`) and `MailsyncBridge._onIncomingMessages` does not
  catch it (`mailsync-bridge.ts:454`), so a new streamed model class would abort delta
  batches on any client that doesn't register it.
- `unsafeEraseTransactionDeltas` (used at `MailProcessor.cpp:557` and `TaskProcessor.cpp:891`
  to hide UID-only rewrites) is no longer needed for scan-side placement work; the silent
  operations never call `save`. `performRemoteChangeOnMessages` still uses it to drop the
  confirm save's deltas when the client-visible state did not change.
- Drift between table and snapshot is a bug, not a state to tolerate. The engine test
  harness (`mailsync/test/harness/invariants.py`) runs after every scenario once the engine
  is quiescent and recomputes each incrementally maintained layer from the stored layer
  below it: message `folders`, labels and flags from `MessageFolder`; thread folder/label
  `_refs` and `_u`, unread and starred from the message snapshots; `ThreadCategory` from the
  thread arrays; `ThreadCounts` from `ThreadCategory`; and `MessageOrphan` against the
  messages with no row. A scenario opts out only explicitly. The same checks could be
  exposed as `--mode verify` for support; that mode does not exist yet.

### 2.4 Message JSON contract

```jsonc
{
  "id": "…", "aid": "…", "v": 12, "threadId": "…", "hMsgId": "…", "date": 1758300000,
  "unread": true, "starred": false, "draft": false,   // derived: OR over placements
  "labels": ["\\Inbox", "\\Important"],               // Gmail: labels of the (single) placement
  "folders": { "SqYhL6…": 1, "bcpXme…": 0 },          // folderId -> per-copy flag bits, OR-ed per folder
  "metadata": [ … ],                                  // unchanged
  "_sa": 1758300100                                   // syncedAt guard, message-level
}
```

- `folders` is a map from **folder id** to a small integer of per-copy flag bits
  (`1` unread, `2` starred, `4` draft). That is everything the engine needs to diff thread
  refcounts without a query (§2.6) and everything the client needs (`Object.keys` for
  membership; flags at message level are already derived). It deliberately carries **no
  path, no name, no role**: those would be stored once per placement across millions of
  rows and the role would go stale whenever the user reassigns it. Roles are resolved by id
  through a `MailStore` folder cache in the engine (same shape as `allLabelsCache`) and
  through `CategoryStore` in the client.
- UIDs are engine-private and are not in the JSON.
- A placement with `pendingFolderId` set is reported under its *pending* folder id, so the
  client sees an optimistic move immediately.
- `folder`, `remoteFolder` and `clientFolder` are gone — no compatibility field. Today each
  message embeds two full Folder JSON copies (≈260 B); the map costs ≈45 B per placement.
- With no role in the JSON, `priorityForFolderRole` has no remaining use and is deleted.

### 2.5 Sync: vanished copies, orphans and the end-of-pass sweep

Today a UID that disappears from a folder scan sets `remoteUID = UINT32_MAX − phase` on the
`Message` row and the message is deleted at the end of the *next* background pass if it has
not been reclaimed by another folder (`MailProcessor.cpp:519-600`, `SyncWorker.cpp:676-678`).
The grace exists because a plain-IMAP MOVE is APPEND-to-destination + EXPUNGE-from-source and
either folder may be scanned first; deleting on "gone from source" would `unpersist` the
row, destroy its `ModelPluginMetadata` (`MailModel.cpp:213-222`) and `MessageBody`, then
re-insert it from the destination scan as a fresh, metadata-less message.

Two pre-existing defects in that mechanism, both closed by the new design:

1. The foreground IDLE worker is a second `SyncWorker` (`main.cpp:195`) with its own
   `unlinkPhase` that is never toggled (`SyncWorker.cpp:72`, only `syncNow` at `:676`
   flips it, on the background instance). Foreground unlinks therefore get anywhere from
   zero to one pass of grace depending on timing.
2. A truncated UIDVALIDITY rebuild that needs more than one pass loses its tail: rows are
   sentinelled before they are relinked and the sweep eats them.

New rules:

| Event | Action |
|---|---|
| Folder scan finds a placement whose UID is gone (range diff, QRESYNC VANISHED, untagged EXPUNGE) | `DELETE FROM MessageFolder WHERE accountId=? AND folderId=? AND remoteUID IN (…) RETURNING messageId` (`deleteVanishedPlacements`, chunks of 500). A message left with no row is recorded in `MessageOrphan` in the same transaction. The affected messages are then refreshed from their rows and **saved** — the client sees the copy leave that folder within seconds. A message that still has another copy is simply one folder smaller; no grace applies to it. |
| Another message takes over a `(folder, UID)` (a UID reused without a UIDVALIDITY change, or claimed by a moved copy's commit) | The row moves to the new holder; the displaced message is marked and saved, and becomes an orphan if that was its last copy. |
| Scan of folder B records a copy of an orphaned message | `upsertPlacement` inserts the row; the refresh on save finds a row and deletes the orphan record. One `persist` with `folders: {B}`. Same id, metadata and body. |
| A vanished UID reappears in the same folder | It has no row, so the scan treats it as new, fetches it, hashes it to the same id and records it as above. |
| End of every background `syncNow` pass | `passStartedAt` is recorded before the folder loop. `sweepExpiredOrphans(sweepBefore)` lists the orphans whose `since` is before the sweep bound (at most the pass start; see Sweep gating below) and removes them in chunks of 100 through `store->remove`, so `Message::afterRemove` fixes the thread, deletes the body, metadata, rows and orphan record, and emits `unpersist`. Each chunk re-reads the orphan records inside its own transaction, because the foreground worker can revive a candidate (and orphan it again, restarting its grace) while earlier chunks run. The grace rule: **an orphan is removed once the folders have been scanned in full since it became one**, so a copy that moved elsewhere has been recorded and has cleared the record. It is keyed on a timestamp, so the foreground worker's orphans get the same grace as the background worker's. `unlinkPhase` is deleted. |
| UIDVALIDITY change | `resetPlacementUIDs`: `UPDATE MessageFolder SET remoteUID = 0 WHERE accountId=? AND folderId=? AND remoteUID > 0` (silent, no thread change). The heavy `1:*` rebuild's upsert replaces the message's UID 0 row in that folder with the row at the new UID. When the rebuild reports `!truncated`, `deleteUnassignedPlacements` deletes what is still at UID 0, except drafts, exactly like a vanished copy. A truncated rebuild leaves the tail at UID 0 — still live, still visible — instead of feeding the sweep. |
| Folder deleted on the server, or `ExpungeAllInFolder` | `detachMessagesFromFolder`: in chunks of 100, delete the folder's rows (and abandon moves pending into it) and refresh the affected messages in one transaction. A message whose only copy was there is removed at once; the copies are gone for good, so there is nothing to wait for. |

**Sweep gating.** The sweep never waits for a pass that covered everything; it lowers its
bound for each folder the pass did not cover.

- A folder is *covered* by a background pass when that pass's scan reached its whole range:
  STATUS succeeded, the initial walk has reached UID 1, and no fetch in the pass (new mail,
  shallow, deep, CONDSTORE gap scan, UIDVALIDITY rebuild) was truncated or failed. A skipped
  duplicate `\All` folder counts as covered.
- Each folder's `coveredAt` is the start of the last background pass that covered it. It is
  kept in memory (`SyncWorker::folderCoveredAt`) and empty after a relaunch, which only makes
  the sweep wait longer; persisting it would save every folder on every pass.
- The sweep removes orphans whose `since` is before
  `min over uncovered folders of max(coveredAt, passStart − 24h)`, or before `passStart`
  when every folder was covered. Pass start rather than scan start is sound: an orphan
  recorded before it lost its last copy before that folder's scan began.
- The 24h floor keeps a folder that is never covered (a listed mailbox that refuses STATUS,
  RFC 4314 §4, or one whose scan truncates every pass) from stalling the sweep for good. Past
  it an orphan is swept even if that folder holds its last copy, which would come back without
  plugin metadata if the folder became readable — accepted, since the user cannot see an
  unreadable mailbox. The `ORPHAN_SWEEP_MAX_WAIT` environment variable (seconds) overrides
  the 24h so the harness can reach it (`orphan-sweep-with-unreadable-folder`).

What the client sees on the stream for a move made in another client, plain IMAP:
`persist Message X {folders: {}}` + `persist Thread` when the source scan runs, then
`persist Message X {folders: {Archive}}` + `persist Thread` when the destination scan runs.
Never an `unpersist`. Same id, metadata intact, body intact. If both land inside the 500 ms
stream delay, `DeltaStreamItem::upsertModelJSON` merges them and the client sees one persist.

Whether the intermediate `folders: {}` state should be visible (message briefly in no folder)
or hidden (keep reporting the vanished copy's folder until the message is swept or found) is
a product call; the design takes **visible** — it is the truthful state, the delta is cheap,
and it means a message deleted elsewhere disappears from Mailspring's folder views in seconds
rather than one to two background passes (each ending in a 120 s sleep).

### 2.6 Flags and the `syncedAt` guard

- `Message.unread = ANY(placement.unread)`, likewise `starred`; `draft = ANY(placement.draft)
  OR ANY(placement.folder.role == "drafts")` (today's rule at `Message.cpp:88-90`). A message
  with no placement keeps the flags and labels it had, so a message whose only copy is in
  transit does not flip read → unread → read across the two scans: the orphaned message
  keeps its values and the destination copy's row supplies them again.
- Per-folder unread on the thread (`folders[]._u`, which feeds `ThreadCategory.unread` and
  the `ThreadCounts` badge) uses the **placement's** flag: the Inbox copy unread counts for
  Inbox, the read Sent copy does not count for Sent. This is what stops the Yahoo badge churn.
- A client "mark read" fans out to **every** placement (local phase sets all; remote phase
  STOREs in every folder that holds a copy). Otherwise the next scan of the untouched copy
  re-derives `unread = true`.
- The `syncedAt > syncDataTimestamp` guard (`MailProcessor.cpp:180-183`; set to now+24h by
  `TaskProcessor.cpp:791` and reset at `:886`) **stays on the Message**. `_suc` counts the
  tasks holding it; each task's remote phase releases its hold whether it succeeds or fails.
  It is what stops a scan of the *source* folder from resurrecting a copy the user just
  moved away or reverting a flag the user just changed, and after the local phase the
  source placement is the thing being moved, so a per-placement timestamp has nowhere to
  live. Trade-off accepted: while a task is in flight (seconds, normally), server flag
  changes to the message's recorded copies are ignored — the same as today.
- The guard protects **only copies already recorded**. A copy at a `(folder, UID)` the
  message has no row for is recorded with the server's flags even while the lock is held,
  and the lock is left for the task to release. Another client may have moved the message's
  only copy while a task was in flight; skipping the new copy would leave the message an
  orphan for the sweep, which would delete it with its body and metadata, and on a QRESYNC
  server `CHANGEDSINCE` would already have moved past the copy. For the same reason a scan
  never clears a row's `pendingFolderId`: a destination scan can land between a MOVE and
  its commit, and only the task's commit or its failure settles the marker.
- A failed remote phase releases the lock and settles the task's markers before the error
  is reported. The IMAP change runs folder by folder and stops at the first failure; copies
  already moved are committed, and the task's markers on the rest are dropped
  (`abandonPlacementMove`), so the snapshot shows each copy where the server has it. A
  failed flag task's local flags are left for the next scan that reports the copy to
  correct; the per-copy values from before the task are not kept anywhere to restore.
  Database errors are rethrown untouched, since they leave the task queued to run again.
- The foreground and background workers can process the same server change for one
  message at once. `updateMessage` therefore reloads the message and its placement inside
  its `BEGIN IMMEDIATE` transaction, evaluates the guard and the placement comparison there,
  and returns the message as saved. A message loaded before the transaction would let both
  workers save from the same snapshot and apply the thread delta twice.
  `insertFallbackToUpdateMessage` keeps a read-only pre-check so an unchanged copy opens no
  transaction.

### 2.7 Optimistic moves without the `clientFolder` / `remoteFolder` split

Today `_applyFolder` sets only `clientFolder` (`TaskProcessor.cpp:265-268`); the remote
phase later rewrites `remoteFolder`/`remoteUID` and erases its own deltas. Under placements:

- Local phase: for each placement selected for the move (§3.1; §3.3 for an undo), set
  `pendingFolderId = dest`. A copy at UID 0 is never selected: no scan can report where it
  went, so a marker on it would show it in the destination forever.
  `folders[]` reports the placement under `dest`, the thread updates, one persist goes out.
  The row keeps its server `folderId`/`remoteUID` so the remote phase can address it.
- Remote phase: group pending placements by server folder → one `UID MOVE` (or COPY +
  `\Deleted` + EXPUNGE) per source folder. On success rewrite the row in place:
  `folderId = pendingFolderId, remoteUID = <COPYUID>, pendingFolderId = NULL`. Non-UIDPLUS
  servers keep today's tail-fetch-and-rehash fallback (`TaskProcessor.cpp:108-140`), which
  works because the id is folder-independent.
- If the message **already has a placement in `dest`**, the selected copy is still
  MOVEd and the destination ends with two placements, as it does for Exchange's duplicate
  Sent copies. Deleting the source copy instead would be a destructive server operation for
  a rare case (dragging a self-sent Inbox message into Sent) and would make undo recreate it
  by COPY; other IMAP clients simply MOVE.

Deletion placeholders for drafts (`Message::messageWithDeletionPlaceholderFor`,
`Message.cpp:34-55`) become a placeholder message that owns the draft's placement
`(Drafts, uid)`, which is exactly what keeps the Drafts scan from re-inserting a draft the
user deleted. The "stub with `remoteUID == 0` is never removed" leak
(`TaskProcessor.cpp:980-991`) is cleaned up by the orphan sweep.

### 2.8 Gmail

Gmail stays on **one placement per message** (in All Mail, Spam or Trash) with X-GM-LABELS
on that placement. Labels-as-placements was considered and rejected: on Gmail `\Seen`,
`\Flagged` and labels are per-message, label "folders" are never SELECTed so a label
placement could never carry a real UID, and every STORE/MOVE would still route through the
All Mail copy. Two rules:

- **Exclusivity:** a placement upserted by a scan in one of {all, spam, trash} removes the
  message's other placements at a real UID (`removePlacementsOutsideFolder`; local drafts at
  UID 0 are left alone). Gmail is detected by the session's `X-GM-EXT-1` capability, which
  the workers pass to their `MailProcessor` after login, not by the account's provider,
  which is `imap` for a Gmail account added with generic IMAP settings. Gmail guarantees the three are mutually exclusive, and Gmail
  has no QRESYNC to VANISH the old copy promptly; without this rule a message trashed in the
  web UI would sit in both Inbox (via `\Inbox` on the All Mail placement) and Trash for up
  to a deep-scan interval.
- **Send path fix:** `performRemoteSendDraft` currently inserts the sent message with the
  Sent *label* as its folder (`TaskProcessor.cpp:1827`) and relies on latest-wins for All
  Mail to take it over — the only place a Label is used as a message folder, and the reason
  the current Sent-priority bridge has to exclude Gmail. After APPEND/locate in
  `[Gmail]/Sent Mail`, find the UID in All Mail with `findUIDsOfRecentHeaderMessageID`
  (already used at `:1719`) and create the placement there. Fallback if Gmail lags: a
  transient placement keyed by the Sent label id that the exclusivity rule replaces on the
  next All Mail scan.

Unchanged Gmail workarounds (server behaviour, not data-model artefacts): multisend copies
deleted from Sent and then again from All Mail (`:1706-1723`); `\Deleted` re-applied after
MOVE to Trash (`:189-200`); thread labels copied onto an APPENDed sent message
(`:1758-1778`); the `inAllMail` gate on label unread counts (`Thread.cpp:297`, #485).

### 2.9 Other providers

| Provider | Today | Under placements |
|---|---|---|
| iCloud / NetEase | folder-priority rule elects an owner among copies | delete the rule; both copies are placements. Keep the iCloud QRESYNC disable and the NetEase RFC 2971 ID exchange (unrelated). Reduce NetEase's "deep-scan every folder in the same pass so Sent can reclaim before phase cleanup" (`SyncWorker.cpp:342-370`) to a per-folder counts-changed trigger — the reclaim concern is gone, the UIDNEXT=0 detection need is not. |
| ProtonMail Bridge `\All` | skipped entirely (`isDuplicateAllMail`, `SyncWorker.cpp:399-437`, #137) | **keep skipping.** Placements remove the flap, but syncing All Mail doubles header traffic and rows, puts every thread in "Archive" (the `[archive, all]` role group), and a delete from All Mail on Bridge is a delete everywhere — an ambiguity nothing else has to resolve today. The concrete Proton win is `Labels/*` folders, which stop ping-ponging. |
| Office 365 / Exchange | 2–4 Sent Items copies churn UIDs every pass | each copy is a placement; flags/moves/expunges address all of them. Optional later: lengthen the gateway-copy wait in the send path so fewer duplicates are created. |
| Non-QRESYNC servers generally (Gmail, iCloud, Yahoo, O365) | a move made elsewhere shows on the destination scan because latest-wins re-points the row | the destination placement appears on its scan; the source placement lingers until the source folder's shallow (2 min, top ~400 UIDs; Inbox after every IDLE wake) or deep (10 min) scan. Mitigation, Phase 5: when a scan adds a placement for a message that already has one in folder F on a non-QRESYNC session, queue `(F, uid)` and issue one `UID FETCH … (UID)` per F at the end of the pass, deleting the rows of what the server does not return. That is definitive duplicate-vs-move detection — what the priority table was approximating. |
| Dateless messages | id includes `folderPath:uid` (`MailUtils.cpp:684-694`) | unchanged: each copy is its own message with one placement; a move is delete + insert, as today. Not a placement bug. |

---

## 3. Semantics that need a decision (recommendations included)

### 3.1 Thread move → which placements?

`inflateMessages` resolves a thread-level `ChangeFolderTask` to every message of the thread
(`TaskProcessor.cpp:751-770`), and today that moves the Sent copy of your reply into Archive
or Trash. With placements the task can be precise. Recommended rule:

- Destination role ∈ {trash, spam} → **every placement of every message** (the user expects
  the whole conversation gone; matches today).
- Otherwise → placements whose folder is in the task's `sourceFolderIds[]` if given; if
  absent, every placement whose folder role ∉ {sent, drafts}.
- `sourceFolderIds` is a new optional field on `ChangeFolderTask`. The client fills it from
  `FocusedPerspectiveStore.current()` in `mailbox-perspective.ts` (`tasksForRemovingItems`
  `:536-574`, `actionsForReceivingThreads` `:446-524`). `TaskFactory`, mail rules and MCP have
  no perspective and get the default.

### 3.2 Single-message moves

No UI exists (`message.ts:16-18` documents that moves are thread-level; `ChangeLabelsTask`
and `ChangeStarredTask` reject `messageIds`). Placements make message-level operations
representable; adding UI for them is out of scope for this project.

### 3.3 Undo

The client computes one `previousFolder` per task (`change-folder-task.ts:43-70`) and marks
the task not undoable when sources are heterogeneous (`:59-63`). That is already lossy
(undoing an archive of an Inbox + Sent thread moves the Sent copy to Inbox) and cannot express
per-placement sources. Implemented: the engine writes `undoPlacements`
(`{ messageId: [folderId, ...] }`, the folder each moved copy was shown in, one entry per
copy) into the task data in `performLocal` — the pattern `DestroyDraftTask` already uses
for `stubIds` — and the client's `createUndoTasks` copies it to `restorePlacements` on the
undo task, with `sourceFolderIds = [original destination]`. The undo moves as many of the
message's copies in that destination back as there are entries, one per recorded folder.
Copies are byte-identical, so it need not know which copy came from where; it prefers the
copies still in flight to the destination and then the highest UIDs there (a moved copy
lands above every UID the folder held, RFC 3501 2.3.1.1), which leaves a copy the
destination already had in place. An undo queued before the move's remote phase marks the
copies home in its local phase; the move's commit carries that marker onto the moved row
and the undo's remote phase (FIFO after the move) moves it back. Multi-folder moves become
undoable.

### 3.4 Visibility of the in-transit state

See §2.5. Recommend visible.

---

## 4. Migration

Existing users are migrated in place; a forced re-sync is rejected (it destroys unsent local
drafts, cached bodies and attachments, queued tasks, and plugin metadata for users without a
Mailspring ID, and costs hours on large accounts).

`--mode migrate` runs once per launch in the Electron main process before any window opens
(`application.ts:93-96`, `mailsync-process.ts:499-515`); per-account sync processes never
migrate. Migrations autocommit per statement today (`MailStore.cpp:115-157`), so V10 must
wrap itself explicitly.

V10 does three things in one transaction: creates `MessageFolder` and `MessageOrphan` and
backfills one placement per message; rebuilds the `Message` table without the three location
columns; and rewrites each row's `data` JSON to the §2.4 contract. Rebuilding the table is how
SQLite drops columns anyway (`ALTER TABLE … DROP COLUMN` rewrites the table per column —
measured 5.7 s each on the benchmark DB), so doing it once and folding the JSON rewrite into
the same pass is the cheapest way to leave nothing behind. A fresh database already gets the
final `Message` shape from V1 and only creates the new tables and indexes. The exact
statements are `V10_SETUP_QUERIES`, `V10_UPGRADE_QUERIES` and `V10_INDEX_QUERIES` in
`mailsync/MailSync/constants.h`, run by `MailStore::_migrateToV10`; in outline:

```sql
-- V10, inside BEGIN IMMEDIATE … COMMIT (busy timeout 60 s covers a lingering sync process)
CREATE TABLE MessageFolder (…); CREATE TABLE MessageOrphan (…);  -- §2.2

-- 1. one placement per message, from the IMAP truth (remoteFolderId/remoteUID); a move whose
--    remote phase has not run (data.folder.id != remoteFolderId) keeps it as a pending move
INSERT INTO MessageFolder (accountId, messageId, folderId, remoteUID, unread, starred, draft, remoteXGMLabels, pendingFolderId)
SELECT accountId, id, remoteFolderId, remoteUID,
       IFNULL(unread,0), IFNULL(starred,0), IFNULL(draft,0), IFNULL(remoteXGMLabels,'[]'),
       CASE WHEN json_extract(data,'$.folder.id') != remoteFolderId THEN json_extract(data,'$.folder.id') END
FROM Message
WHERE remoteFolderId IS NOT NULL AND remoteFolderId != ''
  AND remoteUID <= 4294967290 AND NOT (id LIKE 'deleted-%' AND remoteUID = 0);

-- 2. everything else is an orphan dated now: no folder, unlink sentinels, UID 0 deletion placeholders
INSERT INTO MessageOrphan (messageId, accountId, since)
SELECT id, accountId, strftime('%s','now') FROM Message
WHERE remoteFolderId IS NULL OR remoteFolderId = ''
   OR remoteUID > 4294967290 OR (id LIKE 'deleted-%' AND remoteUID = 0);

-- 3. rebuild Message without remoteUID / remoteFolderId / remoteXGMLabels and with the new JSON;
--    "folders" is keyed by the folder the client saw the message in
CREATE TABLE Message_v10 (id VARCHAR(40) PRIMARY KEY, accountId VARCHAR(8), version INTEGER, data TEXT,
  headerMessageId VARCHAR(255), gMsgId VARCHAR(255), gThrId VARCHAR(255), subject VARCHAR(500), date DATETIME,
  draft TINYINT(1), unread TINYINT(1), starred TINYINT(1), replyToHeaderMessageId VARCHAR(255), threadId VARCHAR(40));
INSERT INTO Message_v10 (…)                                     -- rows with a folder
SELECT id, accountId, version,
       json_set(json_remove(data, '$.folder', '$.remoteFolder', '$.remoteUID', '$.remoteFolderId'), '$.folders',
                json_object(COALESCE(NULLIF(json_extract(data,'$.folder.id'), ''), remoteFolderId),
                            IFNULL(unread,0) | (IFNULL(starred,0) << 1) | (IFNULL(draft,0) << 2))),
       …
FROM Message WHERE remoteFolderId IS NOT NULL AND remoteFolderId != '';
INSERT INTO Message_v10 (…)                                     -- rows without one: folders = {}
SELECT … json_set(json_remove(data, …), '$.folders', json('{}')) …
FROM Message WHERE remoteFolderId IS NULL OR remoteFolderId = '';
DROP TABLE Message;
ALTER TABLE Message_v10 RENAME TO Message;
CREATE INDEX MessageListThreadIndex …; CREATE INDEX MessageListHeaderMsgIdIndex …;
CREATE INDEX MessageListDraftIndex …; CREATE INDEX MessageListUnifiedDraftIndex …;

-- 4. placement indexes last (bulk insert is faster without them)
CREATE UNIQUE INDEX MessageFolderUIDIndex …; CREATE INDEX MessageFolderMessageIndex …;
CREATE INDEX MessageOrphanSinceIndex …; CREATE INDEX MessageListDateIndex …;
PRAGMA user_version = 10;
COMMIT;
```

The rows with and without a folder are copied by separate statements rather than one `CASE`:
`json_set` only embeds its argument as an object when the JSON subtype reaches it, and whether
the subtype survives a `CASE` expression depends on the SQLite version; a lost subtype would
store the map as a string.

Rules and measurements:

- Unlink sentinels (`remoteUID > UINT32_MAX − 5`) and `deleted-*` draft placeholders at UID 0
  (the draft was never on the server, so no scan could ever retire them) get no row and an
  orphan record dated now, which the first sweep removes through `Message::afterRemove`.
  Their JSON keeps its folder key: the pre-V10 thread counted them in that folder, and
  `afterRemove` balances the refcount from the snapshot, so until the sweep the snapshot
  lists a folder the message has no row in. This is the one sanctioned exception to the
  snapshot matching the rows. Local drafts keep `remoteUID = 0` in the Drafts folder.
- Rows whose `data.folder.id` differs from `remoteFolderId` (moves in flight; 15 of 258k in
  the benchmark DB) keep their server location with `pendingFolderId = data.folder.id`, so
  the client keeps seeing the move and the queued `Task`'s remote phase commits it.
  `data.labels` (X-GM-LABELS) stays in the JSON as-is — it is the single Gmail placement's
  labels and the client reads it.
- Exactly one placement per message is created, so thread refcounts, `ThreadCategory` and
  `ThreadCounts` are unchanged by the migration itself. Second copies are discovered by
  ordinary scans afterwards and update threads through the normal upsert path. No rebuild.
- Cost. Measured on 1.15 GB / 258,605 messages: placement backfill 4.5 s, one `Message`
  table rewrite ~6 s without JSON functions; with `json_set`/`json_remove` over 1.1 KB rows
  budget ~10–15 s, plus ~1 s for indexes. Extrapolated to 1M messages: 40–60 s. On the
  benchmark database the file grows by 385 MB and the WAL peaks at about the same; the old
  table's pages are reclaimed by the 30-day `VACUUM`. The engine prints `"\nRunning …"` so
  the client shows its progress window (`mailsync-process.ts:503-507`, the V3 precedent).
  **Free space is checked before starting**: at least 1.5× the database size
  (`page_count × page_size`) on the volume holding `CONFIG_DIR_PATH`. The failure is a plain
  error naming the disk and saying the database is intact, so the client's "problem with
  your local email database" dialog does not read like corruption.
- Atomicity: a crash mid-transaction rolls back DDL too, leaving `user_version = 9` and the
  original `Message` table; the next launch retries.
- **Downgrade is not supported.** An older binary opening a V10 database fails on its first
  `INSERT INTO Message (… remoteUID …)` with "no such column" and the account goes into an
  error state; the remedy is Preferences → Rebuild (or deleting `edgehill.db`), which is a
  cache rebuild, not data loss — Mailspring is an IMAP cache. Document this in the release
  notes for the version that ships V10.
- `ACCOUNT_RESET_QUERIES` (`constants.h:34-54`) delete the account's `MessageFolder` and
  `MessageOrphan` rows.
- Post-migration: the engine logs the number of placements created and of messages without
  a copy (the orphans above). Nothing is raw-deleted (that would bypass `afterRemove` and
  skew thread counters). The harness scenario `migration-from-pre-placements-db` runs the
  §2.3 invariant checks against a migrated database.

---

## 5. Work plan

Phases 1–3 are one engine branch: because the old location accessors and columns are
removed outright rather than shimmed, the engine does not compile until `TaskProcessor` is
converted, which is the point — the compiler is the audit. Phase 4 ships in the same release,
since the client reads the new `folders` map. Within the branch, the order below is the
order in which the pieces can be built and unit-tested.

### Phase 0 — Bridge (done; removed in Phase 2)

Extend folder priority to any contest involving a real Sent folder on every provider
(`MailProcessor.cpp:188-218`, Gmail excluded via the Label check). Stops the observed
INBOX ↔ Sent flapping until placements land. Deleted in Phase 2.

### Phase 1 — Storage, migration and models (engine, ~700 lines; done)

| Item | Where |
|---|---|
| DDL (`MessageFolder`, `MessageOrphan`), V10 migration, reset queries, free-space check, progress line | `constants.h`, `MailStore.cpp:103-188`, `main.cpp:896-904` |
| Rewrite `fetchMessagesAttributesInRange`, `fetchMessageUIDAtDepth` against `MessageFolder` | `MailStore.cpp/.hpp` |
| A `Placement` struct (not a `MailModel`) | new header |
| Placement helpers with cached statements (§2.3). Per-message helpers write the row(s) and set `Message::_placementsChanged`: `upsertPlacement(msg, folder, uid, attrs)` (ON CONFLICT; returns a displaced message id), `removePlacementsOutsideFolder`, `setPlacementUnread/Starred/Labels`, `beginPlacementMove`, `commitPlacementMove`, `abandonPlacementMove`, `removePlacement`. `refreshMessageFromPlacements` rebuilds the snapshot and orphan record, called from `Message::beforeSave`. Bulk SQL-only helpers return the affected message ids and record orphans: `deleteVanishedPlacements(folder, uids / range)`, `resetPlacementUIDs(folder)`, `deleteUnassignedPlacements(folder)`, `deletePlacementsForFolder`, `deletePlacementsForMessage`; `orphanMessageIdsBefore(accountId, before[, among])` for the sweep | `MailStore.cpp/.hpp` |
| Folder role/path cache by id on `MailStore` (same shape as `allLabelsCache`, invalidated on Folder save/remove) so `isInInbox` & co. resolve roles without embedding them per message | `MailStore.cpp/.hpp` |
| `Message`: constructor no longer writes folder/UID into `_data`; `folderIds()`, `placementFlags(folderId)`; derived `unread/starred/draft` rebuilt from the rows in `beforeSave` when `_placementsChanged` is set; `afterRemove` deletes placements and the orphan record; `columnsForQuery`/`bindToQuery` drop three columns; `inAllMail`, `_isIn`, `isInInbox`, `isSentByUser` iterate `folders` keys through the role cache; `remoteFolder()`, `remoteFolderId()`, `remoteUID()`, `clientFolder()`, `clientFolderId()`, `setRemoteFolder()`, `setClientFolder()`, `setRemoteUID()`, `remoteXGMLabels()` setters **deleted** (labels move to the placement; `labels` in JSON is derived) | `Models/Message.cpp/.hpp` |
| `MessageSnapshot` carries the `folders` map (folderId → flag bits) + labels, captured from `_data` at load — no query; `Thread::applyMessageAttributeChanges` becomes a set-diff over distinct folders with per-placement `_u`; fix the precedence bug at `Thread.cpp:215/289` (`x - unread && inAllMail` stores a bool) | `Models/Thread.cpp` |
| `queriesForUIDRangesInIndexSet` renames the column; callers execute it as an UPDATE | `MailUtils.cpp:484-528` |
| A folder gone from the server: `MailProcessor::detachMessagesFromFolder` deletes its placements and repairs the affected messages in chunks of 100, removing those whose only copy was there, before the folder row is removed; `Folder::afterRemove` also deletes any rows left (today messages in a removed folder are orphaned forever) | `Models/Folder.cpp:81-87`, `SyncWorker.cpp` `syncFoldersAndLabels` |

### Phase 2 — Sync core (engine, ~700 lines; done)

| Item | Where |
|---|---|
| `insertMessage` inserts the first placement in the same transaction; `updateMessage` → `upsertPlacement` (message and placement reloaded inside the transaction; guard on `Message.syncedAt` for recorded copies only; change detection against the `(folder, uid)` row; save only when the client-visible state changed); `insertFallbackToUpdateMessage` also catches a placement unique-index collision (fg/bg race on the same UID) | `MailProcessor.cpp:87-298` |
| Delete the folder-priority block, `priorityForFolderRole`, the `isUnlinked` reclaim branch, all `UINT32_MAX` sentinel checks | `MailProcessor.cpp:188-242`, `MailUtils.cpp:408-432`, `SyncWorker.cpp:1343` |
| `unlinkMessagesMatchingQuery` → `deleteVanishedPlacements`; `deleteMessagesStillUnlinkedFromPhase` → `sweepExpiredOrphans(passStartedAt)`; remove `unlinkPhase`, add `passStartedAt` | `MailProcessor.cpp:519-600`, `SyncWorker.cpp:72, 676-678`, `.hpp:39` |
| `syncFolderUIDRange`: `local` from placements; step 5 deletes vanished rows in chunks of 200; return `{message, uid}` pairs for the newest-first body ordering at `SyncWorker.cpp:584` | `SyncWorker.cpp:1028-1177` |
| `syncFolderChangesViaCondstore`: collapse the find/update pair at `:1232-1244` into `insertFallbackToUpdateMessage`; VANISHED → `deleteVanishedPlacements` | `SyncWorker.cpp:1179-1257` |
| UIDVALIDITY rebuild per §2.5 | `SyncWorker.cpp:439-486` |
| Body fetch: `syncMessageBody(msg, preferredFolder)` picks the preferred folder's placement with `uid > 0`, else any non-spam/trash placement, and tries the next placement on `ErrorFetch`; rewrite the four raw SQL statements (`cleanMessageCache`, `countBodiesDownloaded`, `countBodiesNeeded`, `syncMessageBodies`) as joins with `COUNT(DISTINCT messageId)` | `SyncWorker.cpp:1282-1436` |
| Gmail exclusivity rule (§2.8) in `updateMessage`, gated on the `X-GM-EXT-1` capability (`MailProcessor::setIsGmail`) | `MailProcessor.cpp`, `SyncWorker.cpp` |
| Trim NetEase all-folder deep-scan coupling to per-folder | `SyncWorker.cpp:342-370, 567` |
| Comment at `SyncWorker.cpp:1000-1005` loses the "higher-priority folder owns it" cause; keep `shouldRetryTruncatedScan` for the `syncedAt` case | |

### Phase 3 — Tasks (engine, ~550 lines; done)

| Item | Where |
|---|---|
| `performLocalChangeOnMessages` / `performRemoteChangeOnMessages`: iterate placements, group UIDs by server folder, key the reload map by placement row, per-placement confirm | `TaskProcessor.cpp:772-896`, signature in `.hpp:58-59` |
| Move: `_applyFolder` sets `pendingFolderId` on the placements selected by §3.1; `_movesForMessage` selects the copies in both phases from the task data and current rows; `_moveMessagesResilient` reads/writes per placement, MOVEs even when dest already has a copy, skips `uid == 0` (today a `remoteUID 0` draft in a moved thread sends UID 0 in the MOVE — latent bug); engine writes `undoPlacements`; handle `restorePlacements` on undo tasks (`_restoreMovesForMessage`: MOVE one destination copy back to each recorded source); a failing folder stops the remote phase, commits the copies already moved, abandons the other markers and releases the lock before rethrowing | `TaskProcessor.cpp:70-160, 265-274` |
| Flags: `_applyUnread`/`_applyStarred` set every placement; IMAP variants STORE per folder | `TaskProcessor.cpp:233-263` |
| Labels: operate on the single Gmail placement | `TaskProcessor.cpp:276-349` |
| Send: delete the remote draft via its placements; create the Sent placement (non-Gmail) or the All Mail placement (Gmail, §2.8); `SyncbackMetadataTask` by `localMessage->id()` is unchanged | `TaskProcessor.cpp:1486-1868` |
| Drafts: `inflateClientDraftJSON` no longer needs to carry `remoteUID`/`remoteFolder`; `performLocalSaveDraft` preserves placements across the `_data` swap (automatic — they live in the table); destroy transfers the placement to the placeholder id; remote destroy iterates placements; a range scan never deletes a `uid == 0` placement | `TaskProcessor.cpp:688-749, 898-993` |
| `ExpungeAllInFolder`: `detachMessagesFromFolder` with a 300 ms pause between chunks; a message whose only copy was there is removed at once. `GetMessageRFC2822`: pick a placement (prefer non-spam/trash, `uid > 0`). `GetManyRFC2822`: paginate `MessageFolder` on `(accountId, folderId, remoteUID)` and join `Message` for subject/date | `TaskProcessor.cpp:1919-2209` |
| Every remaining compile error from the deleted `Message` accessors is a call site to convert; the branch is done when `grep -rn "remoteFolder\|remoteUID\|clientFolder" MailSync/` returns only the migration SQL | |

### Phase 4 — Client (~4–6 days, dominated by task/undo semantics; done)

| Item | Where |
|---|---|
| `Message.folders` becomes `Attributes.Obj` holding the `{folderId: bits}` map, with `folderIds()` and `categories()` helpers that resolve through `CategoryStore.byId(accountId, id)`; `folder` attribute deleted (the seven read sites move in the same change); `isInSpamOrTrash()`-style helpers replace ad-hoc `folder.role` checks | `src/flux/models/message.ts:175-179` |
| The seven `message.folder` read sites: `MessageStore.items()` hidden filter becomes "every placement in spam/trash" (and can show the right copy per view); `message-item.tsx:276-292` renders one chip per folder and fixes the `role === 'al'` typo; `activity/root.tsx:354`; `autoload-images-store.ts:47` ("any placement in spam", add a null guard); `mcp-access-control.ts:63-69` ("deny if any placement folder is excluded", mirroring `isThreadAllowed`); `mcp-serializers.ts:66` (serialize `folders`); `change-folder-task.ts:54` | |
| `ChangeFolderTask`: `sourceFolderIds[]`, `restorePlacements`, `createUndoTask` from engine `undoPlacements`; drop the heterogeneous-sources limitation; description copy ("Moved from Inbox") | `src/flux/tasks/change-folder-task.ts`, `change-mail-task.ts` |
| Perspectives pass the current category as source | `mailbox-perspective.ts:446-574`, `search-mailbox-perspective.tsx:95-110`, `snooze-utils.ts` |
| Harden delta ingestion: `try/catch` around `convertToModel` so one unknown class cannot abort a batch | `mailsync-bridge.ts:454` |
| `unread-notifications` can use `message.categories().some(c => c.role === 'inbox')` instead of loading threads (its own TODO at `main.ts:260`) | |
| Specs: `message-list-spec.tsx`, `message-store-spec.ts`, `change-mail-tasks-spec.ts`, `category-picker-spec.tsx` construct `folder: new Folder(...)` | |

Nothing in the thread list, folder views, counts, search, drafts, printing, forwarding, EML
export, mail rules or drag/drop needs to change: they are thread-level or folder-scoped by
construction.

### Phase 5 — Provider follow-ups (not started)

- Optional end-of-pass `UID FETCH` verification for non-QRESYNC sessions (§2.9).
- Lengthen the gateway-copy wait in the send path on Exchange to reduce duplicate Sent copies.

### Phase 6 — Verification (done)

Engine tests in the black-box harness (`mailsync/test/`: YAML scenarios against a fake IMAP
server and Dovecot 2.3.21 with CONDSTORE+QRESYNC), and against the four live accounts
(Office 365, Yahoo, two Gmail) from a wiped database. After every scenario the harness also
runs the §2.3 invariant checks, so each row below is additionally checked for snapshot,
thread-count and orphan-record drift:

| Scenario | Expected |
|---|---|
| Self-addressed mail on O365/Yahoo | one message, `folders: [INBOX, Sent Items]`, appears in both views, zero `FolderID` flips in the log, badge counts stable |
| 2–4 copies in Sent Items | one message, one folder entry, zero `UID (a to b)` flips |
| Move Inbox → Archive from another client (Dovecot QRESYNC, Gmail, O365) | `persist` with `folders: {}` then `folders: {Archive}`; no `unpersist`; snooze metadata still attached |
| Delete from another client | placement row deleted and the message orphaned, message removed by the end-of-pass sweep once the folders have been scanned in full, `unpersist` once |
| UIDVALIDITY change on a 100k folder | one UPDATE, no deltas, all messages relinked; truncated rebuild keeps its tail |
| Archive thread with a Sent copy from Inbox view | Inbox placement moves, Sent copy stays; undo restores exactly that placement |
| Move into a folder that already holds a copy (`move-into-folder-holding-a-copy`) | the selected copy is MOVEd, not deleted; the destination holds two placements |
| Undo queued before the move's remote phase (`undo-before-remote-phase`) | the undo's marker survives the move's commit; the copy ends where it started |
| Server rejects the MOVE (`move-rejected-by-server`, NO [OVERQUOTA]) | the copy is shown where the server has it; lock released, so a later flag change from another client is applied |
| Another client moves the only copy while a task is in flight (`remote-move-while-task-in-flight`) | the new copy is recorded under the lock; the message is not swept |
| Trash thread | every placement moves |
| Mark read from Inbox on a self-addressed message | both copies STOREd `\Seen`; thread not bold anywhere |
| Gmail archive / trash / label / send / self-send | single placement moves between All/Spam/Trash; labels intact; sent message lands with an All Mail placement |
| Draft create / edit / send / delete | one Drafts placement at uid 0 then real uid; placeholder prevents re-insert; no lingering stubs |
| Migration on a 1 GB database | ~5 s, one placement per message, thread counts unchanged, app opens normally; crash mid-migration retries cleanly |
| Foreground IDLE sees a copy vanish, then background sweep | the orphan gets ≥ one full pass of grace (the old phase bug) |
| Both workers process the same change to one message | thread counters applied once (the invariant check's thread refcounts) |

---

## 6. What this removes

- `MailUtils::priorityForFolderRole` and the whole priority block in `updateMessage`,
  including the Phase 0 bridge and its Gmail exclusion.
- `Message.remoteUID`, `remoteFolderId`, `remoteXGMLabels` columns, `MessageUIDScanIndex`,
  and the `folder`/`remoteFolder`/`clientFolder` keys in Message JSON — no compatibility
  layer, no dead columns.
- `UINT32_MAX − phase` unlink sentinels and every check for them; `unlinkPhase` on both
  workers; the load-then-save unlink.
- The `clientFolder` / `remoteFolder` split on `Message` and the `updatesFolder` plumbing in
  `performRemoteChangeOnMessages`.
- NetEase cross-folder deep-scan coupling.
- The "heterogeneous sources ⇒ not undoable" limitation on `ChangeFolderTask`.
- The Gmail send path's use of a Label as a message folder.
- Forum items B-2 (Proton `Labels/*`, Yandex, Zimbra ping-pong) and B-3 (outlook.com
  same-folder UID flip), structurally.

## 7. What this keeps

- Header-hash message identity and everything keyed on it (threads, plugin metadata, cloud
  metadata, files, search).
- The grace before deleting a message whose copy vanished — now timestamp-based, recorded
  per message in `MessageOrphan`, and only for messages with no placement left.
- The engine writing into a task's data as it executes it (`undoPlacements`), which follows
  the existing `DestroyDraftTask.stubIds`, `SyncbackMetadataTask.modelMetadataNewVersion`
  and `SendDraftTask._performRemoteRan` precedents.
- The ProtonMail `\All` skip, the iCloud QRESYNC disable, the NetEase ID exchange and
  counts-based deep-scan trigger, the Gmail label/folder split and its server workarounds,
  deletion placeholders for drafts, the message-level `syncedAt` guard.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Move latency on non-QRESYNC servers (source copy lingers until its folder is rescanned) | Gmail exclusivity rule; Inbox rescans after every IDLE wake; Phase 5 `UID FETCH` verification |
| Semantic change of thread archive (Sent copies stay put) is user-visible | §3.1 rule with the trash/spam exception; `sourceFolderIds` from the perspective |
| Two workers upserting the same `(folder, uid)`, or updating the same message | catch the unique-index collision in `insertFallbackToUpdateMessage` as error 19 is caught today; `updateMessage` reloads the message inside its transaction (§2.6) |
| Placement snapshot in JSON drifting from the table | all writes go through the §2.3 helpers; the snapshot is rebuilt from the rows on save; harness invariant checks after every scenario (`--mode verify` not built) |
| A message left with no copy deleted while its copy is only in transit | orphans are removed only once the folders have been scanned in full since (§2.5); scans record a new copy even under a task's lock (§2.6) |
| Migration rewrites the `Message` table (40–60 s and ~1.7 GB of WAL at 1M messages) | free-space check before starting; progress window; transaction rolls back cleanly; measured on the 258k benchmark before shipping |
| DB growth (~240 B/placement) | −32 MB from dropping `MessageUIDScanIndex`, −~130 B/row from removing duplicated Folder JSON in `data`; net ≈ +3–4% |
| Migration on disk-full | free-space check; distinguish from corruption before offering Rebuild; transaction rolls back cleanly |
| Older binary against a V10 database | unsupported; fails with "no such column" on first insert; remedy is Rebuild (cache only), documented in release notes |
| `unsafeEraseTransactionDeltas` call sites hiding a change that is now client-visible | audit both (`MailProcessor.cpp:557`, `TaskProcessor.cpp:891`); with table-canonical placements most silent writes no longer touch `Message` at all |
| `MessageAttributesMatch` ignores `draft` (pre-existing, `MailStore.cpp:74-76`) | fix while copying the struct |

## 9. Estimate

| Layer | Size |
|---|---|
| Engine storage/migration/models (Phase 1) | ~700 lines |
| Engine sync core (Phase 2) | ~700 lines, net negative in `MailProcessor.cpp` |
| Engine tasks (Phase 3) | ~550 lines |
| Client (Phase 4) | ~300 lines + specs, 4–6 days |
| Provider follow-ups (Phase 5) | ~150 lines |
| New files to register in `CMakeLists.txt`, `MailSync.xcodeproj`, `Windows/mailsync.vcxproj` | 1 header |

Roughly two to three weeks of engine work and one week of client work, with the Gmail send
path and the `ChangeFolderTask` source/undo contract as the two items most likely to need
iteration.

## 10. Revisions

A review pass on the engine after the first implementation changed these parts of the design
(engine commits on `message-placements`):

- **Orphans instead of per-copy tombstones** (`362ff17`, `724621b`). Grace matters only once a
  message has lost its *last* copy; per-copy tombstones cost a liveness filter on every
  placement query, flags OR'd over copies that are gone, a revive path in the move commit and
  a full-table orphan backstop. A vanished copy's row is now deleted at once and a message
  with no row is listed in `MessageOrphan`; `MessageFolder.unlinkedAt`, the unused
  `syncedAt` and their index were dropped and V10 was edited in place (it had not shipped).
  The sweep re-checks each candidate's record inside its chunk transaction because the
  foreground worker can revive and re-orphan it meanwhile.
- **Snapshot rebuilt on save** (`0fa9b73`). Helpers that each re-derived the snapshot ran the
  rebuild once per call in a multi-copy operation, and a helper that forgot it left the
  snapshot stale; `_placementsChanged` plus `Message::beforeSave` does it once, always.
- **No move dedupe; undo moves copies back** (`2f83306`). Deleting the source copy when the
  destination already held one was a destructive server operation for a rare case and forced
  undo to recreate copies by COPY. A selected copy is always moved, and `undoPlacements` /
  `restorePlacements` record the folder each moved copy came from.
- **The `syncedAt` lock protects only recorded copies** (`188a10f`, `61a6a9d`). Ignoring every
  scan result under the lock dropped a copy another client moved during a task, and the sweep
  then deleted the message. A failed remote phase leaked the lock and its pending markers;
  it now commits what moved, abandons the rest and releases the lock.
- **Gmail detected by capability** (`67469d4`). The provider is `imap` for a Gmail account
  added with generic settings, which skipped the one-placement rule; `X-GM-EXT-1` is the
  test the rest of the engine already used.
- **Message reloaded inside the update transaction** (`5101b45`). Both workers could save
  from the same stale message and apply one thread delta twice.
- **Sweep bounded per folder** (`dc73817`). Running the sweep only after a pass that covered
  every folder let one folder whose STATUS failed, or whose scan truncated, on every pass
  disable it for good, so messages deleted on the server were never removed locally. The
  bound now follows each uncovered folder's last full scan, capped at `ORPHAN_SWEEP_MAX_WAIT`
  (see the sweep gating note in §2.5).
- **Scenario-end invariant check** (`b798a52`). The harness recomputes every derived layer
  from the one below it after each scenario; it found the double-count above.
