# Message Placements: one message, many folders

Technical plan for replacing `Message.remoteFolderId` / `remoteUID` with a `MessageFolder`
join table so that a message can exist in more than one IMAP folder at once.

Status: implemented on branch `message-placements` in both repos (engine: 6 commits over
`0df7864`; client: 2 commits over `add26bb96`), 2026-09-20. Verified against Dovecot 2.3.21
(all §5 Phase 6 scenarios) and on a migrated 284k-message database syncing Office 365, Yahoo
and two Gmail accounts: zero folder/UID flips, 28 + 13 messages with placements in two folders,
69 + 6 with duplicate copies in one folder, all stable. Line numbers below cite the pre-change
tree at `203637b` and are approximate for the implemented code.

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
- **Tombstone** — a placement whose UID the server no longer reports, kept for one full sync
  pass so a move seen as "gone from A" before "present in B" does not delete the message.

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
  syncedAt        INTEGER     NOT NULL DEFAULT 0, -- bookkeeping only; the guard is on Message (§2.6)
  unlinkedAt      INTEGER     NULL,               -- tombstone timestamp (§2.5)
  pendingFolderId VARCHAR(40) NULL                -- optimistic move in flight (§2.7)
);
-- a (folder, UID) pair is unique on the server until UIDVALIDITY changes; UID 0 rows are exempt
CREATE UNIQUE INDEX IF NOT EXISTS MessageFolderUIDIndex
  ON MessageFolder (accountId, folderId, remoteUID) WHERE remoteUID > 0;
CREATE INDEX IF NOT EXISTS MessageFolderMessageIndex ON MessageFolder (messageId);
CREATE INDEX IF NOT EXISTS MessageFolderUnlinkedIndex
  ON MessageFolder (accountId, unlinkedAt) WHERE unlinkedAt IS NOT NULL;
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
- `Message` keeps **derived** `unread`, `starred`, `draft` columns (OR across all placements,
  including tombstones — see §2.6). The client declares them queryable and `draft = 1`
  backs the draft list and MCP queries. `Message.remoteUID`, `remoteFolderId`,
  `remoteXGMLabels` and `MessageUIDScanIndex` are **removed** — no dead columns, no
  compatibility shims, so "is anything still reading the old location?" is answered by the
  compiler and by `grep`, not by an audit. The migration rebuilds the `Message` table once
  (§4) rather than issuing three `DROP COLUMN`s, and the same pass rewrites the `data` JSON to
  the new contract (§2.4).
- `WITHOUT ROWID` was considered and rejected: the natural key includes `remoteUID`, which
  changes on relink and is 0 for drafts; a rowid table with a partial unique index is simpler.

Measured on a 1.15 GB / 258k-message database (SQLite 3.51.1, bundled): the join table plus
UID index costs ~240 B per placement (+62 MB, ~5% of the DB), and the hottest sync query
(`fetchMessagesAttributesInRange` over 177k rows) drops from 0.79 s to 0.11 s because the
fat `Message` row no longer has to be visited for `remoteXGMLabels`.

### 2.3 Table is canonical; Message JSON carries a snapshot maintained incrementally

Two sources of truth were proposed by different assessments (placements canonical in
`Message._data` with the table as a derived index, vs. the table canonical with a JSON
snapshot). The decision is **table-canonical**, with the JSON snapshot **maintained
incrementally by the same helper that writes the row** — never rebuilt from a query.

> Every change to the placement set goes through one of a small set of helpers that update
> the `MessageFolder` row(s) and the message's `_data["folders"]` / derived flags in the
> same call. There is no other writer of either.

Why not rebuild the snapshot in `beforeSave`: it would cost an indexed read-join on every
Message save — one query per message visited by any sync process that saves — and
`beforeSave` does not always have the context to know which placement just changed. The
helper approach costs nothing on the hot path, because every event that changes the folder
set or flags already has the Message in hand:

| Event | Message loaded? | Helper |
|---|---|---|
| Scan finds a new/changed copy (`insertFallbackToUpdateMessage`) | yes — inserted, or found by id on the UNIQUE collision | `upsertPlacement(msg, folder, uid, attrs)` |
| Task local/remote phase (move, flags, labels, send, draft destroy) | yes — inflated by the task | `setPlacementFlags`, `beginPlacementMove`, `commitPlacementMove`, `removePlacement` |
| Sweep removes a zero-placement message | yes — `store->remove` needs it for `afterRemove` | `deleteExpiredTombstones` + `removeOrphanMessages` |
| Copy vanishes from a folder (tombstone) | **no** — bulk `UPDATE … WHERE folderId AND remoteUID IN (…)` | `tombstonePlacements(folder, uids)` returns the affected `messageId`s; the caller loads those (and only those) to drop the folder from `folders` and save, so the client sees the copy leave (§2.5). Per *vanished* message, not per visited message. |
| UIDVALIDITY reset / relink | no | SQL only. UIDs are not in the JSON, so nothing to maintain. |
| Folder deleted on the server (`Folder::afterRemove`) | no | bulk delete, then load the affected messages as for tombstones. Rare. |

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
  to hide UID-only rewrites) is no longer needed for placement work; the silent operations
  never call `save`.
- Drift between table and snapshot is a bug, not a state to tolerate. A debug-only
  reconciliation query (`SELECT id FROM Message WHERE json(folders) != <group_concat of live
  placements>`) is run by the test suite after every scenario in Phase 6 and can be exposed
  as `--mode verify` for support.

### 2.4 Message JSON contract

```jsonc
{
  "id": "…", "aid": "…", "v": 12, "threadId": "…", "hMsgId": "…", "date": 1758300000,
  "unread": true, "starred": false, "draft": false,   // derived: OR over placements
  "labels": ["\\Inbox", "\\Important"],               // Gmail: labels of the (single) placement
  "folders": { "SqYhL6…": 1, "bcpXme…": 0 },          // folderId -> per-copy flag bits, live placements only
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

### 2.5 Sync: tombstones and the end-of-pass sweep

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
| Folder scan finds a placement whose UID is gone (range diff, QRESYNC VANISHED, untagged EXPUNGE) | `UPDATE MessageFolder SET unlinkedAt = :now WHERE accountId=? AND folderId=? AND remoteUID IN (…)`. UID retained. Then recompute the message's `folders[]`/derived flags and **save it** — the client sees the copy leave that folder within seconds. |
| Scan of folder B upserts a placement for a message that has tombstones | Insert/refresh the live row and, in the same transaction, delete every tombstone of that message: a live copy anywhere makes the tombstone moot. One `persist` with `folders: [B]`. |
| A tombstoned UID reappears in the same folder | `fetchMessagesAttributesInRange` filters `unlinkedAt IS NULL`, so the UID is `!inFolder`, is fetched, hashes to the same id, and the upsert (`INSERT … ON CONFLICT(accountId, folderId, remoteUID) DO UPDATE`) clears `unlinkedAt`. This filter is load-bearing. |
| End of every `syncNow` pass | `passStartedAt` recorded before the folder loop. Sweep: `DELETE FROM MessageFolder WHERE accountId=? AND unlinkedAt < :passStartedAt`; then messages with zero placements are loaded in chunks of 100 and removed via `store->remove` so `afterRemove` still fixes the thread, body and metadata and emits `unpersist`. Anything tombstoned before the pass began has had every folder scanned at least once since. Same deterministic grace for both workers. `unlinkPhase` is deleted. |
| UIDVALIDITY change | `UPDATE MessageFolder SET remoteUID = 0 WHERE accountId=? AND folderId=?` (silent, no thread change). Heavy `1:*` rebuild upserts by `(messageId, folderId)` where `remoteUID = 0`, assigning the new UID. When the rebuild reports `!truncated`, tombstone what is still at UID 0. A truncated rebuild leaves the tail at UID 0 — still live, still visible — instead of feeding the sweep. |

What the client sees on the stream for a move made in another client, plain IMAP:
`persist Message X {folders: []}` + `persist Thread` when the source scan runs, then
`persist Message X {folders: [Archive]}` + `persist Thread` when the destination scan runs.
Never an `unpersist`. Same id, metadata intact, body intact. If both land inside the 500 ms
stream delay, `DeltaStreamItem::upsertModelJSON` merges them and the client sees one persist.

Whether the intermediate `folders: []` state should be visible (message briefly in no folder)
or hidden (treat tombstones as live for the folder set, skip the save) is a product call; the
plan recommends **visible** — it is the truthful state, the delta is cheap, and it means a
message deleted elsewhere disappears from Mailspring in seconds rather than one to two
background passes (each ending in a 120 s sleep).

### 2.6 Flags and the `syncedAt` guard

- `Message.unread = ANY(placement.unread)`, likewise `starred`; `draft = ANY(placement.draft)
  OR ANY(placement.folder.role == "drafts")` (today's rule at `Message.cpp:88-90`). The OR
  runs over live **and** tombstoned placements so a message in transit does not flip
  read → unread → read across the two events. Concretely: the tombstone helper removes the
  folder's key from `folders` but leaves the derived flags untouched; the next `upsertPlacement`
  recomputes them from the rows.
- Per-folder unread on the thread (`folders[]._u`, which feeds `ThreadCategory.unread` and
  the `ThreadCounts` badge) uses the **placement's** flag: the Inbox copy unread counts for
  Inbox, the read Sent copy does not count for Sent. This is what stops the Yahoo badge churn.
- A client "mark read" fans out to **every** placement (local phase sets all; remote phase
  STOREs in every folder that holds a copy). Otherwise the next scan of the untouched copy
  re-derives `unread = true`.
- The `syncedAt > syncDataTimestamp` guard (`MailProcessor.cpp:180-183`; set to now+24h by
  `TaskProcessor.cpp:791` and reset at `:886`) **stays on the Message**. It is what stops a
  scan of the *source* folder from resurrecting a copy the user just moved away, and after
  the local phase the source placement is the thing being moved, so a per-placement
  timestamp has nowhere to live. Trade-off accepted: while a move of one copy is in flight
  (seconds, normally), server flag changes to the message's other copies are ignored — the
  same as today.

### 2.7 Optimistic moves without the `clientFolder` / `remoteFolder` split

Today `_applyFolder` sets only `clientFolder` (`TaskProcessor.cpp:265-268`); the remote
phase later rewrites `remoteFolder`/`remoteUID` and erases its own deltas. Under placements:

- Local phase: for each placement selected for the move (§3.3), set `pendingFolderId = dest`.
  `folders[]` reports the placement under `dest`, the thread updates, one persist goes out.
  The row keeps its server `folderId`/`remoteUID` so the remote phase can address it.
- Remote phase: group pending placements by server folder → one `UID MOVE` (or COPY +
  `\Deleted` + EXPUNGE) per source folder. On success rewrite the row in place:
  `folderId = pendingFolderId, remoteUID = <COPYUID>, pendingFolderId = NULL`. Non-UIDPLUS
  servers keep today's tail-fetch-and-rehash fallback (`TaskProcessor.cpp:108-140`), which
  works because the id is folder-independent.
- If the message **already has a live placement in `dest`**, the selected copy is still
  MOVEd and the destination ends with two placements, as it does for Exchange's duplicate
  Sent copies. Deleting the source copy instead would be a destructive server operation for
  a rare case (dragging a self-sent Inbox message into Sent) and would make undo recreate it
  by COPY; other IMAP clients simply MOVE.

Deletion placeholders for drafts (`Message::messageWithDeletionPlaceholderFor`,
`Message.cpp:34-55`) become a placeholder message that owns the draft's placement
`(Drafts, uid)`, which is exactly what keeps the Drafts scan from re-inserting a draft the
user deleted. The "stub with `remoteUID == 0` is never removed" leak
(`TaskProcessor.cpp:980-991`) is cleaned up by the zero-placement sweep.

### 2.8 Gmail

Gmail stays on **one placement per message** (in All Mail, Spam or Trash) with X-GM-LABELS
on that placement. Labels-as-placements was considered and rejected: on Gmail `\Seen`,
`\Flagged` and labels are per-message, label "folders" are never SELECTed so a label
placement could never carry a real UID, and every STORE/MOVE would still route through the
All Mail copy. Two rules:

- **Exclusivity:** a placement upserted in one of {all, spam, trash} removes the message's
  placements in the other two. Gmail guarantees the three are mutually exclusive, and Gmail
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
| Non-QRESYNC servers generally (Gmail, iCloud, Yahoo, O365) | a move made elsewhere shows on the destination scan because latest-wins re-points the row | the destination placement appears on its scan; the source placement lingers until the source folder's shallow (2 min, top ~400 UIDs; Inbox after every IDLE wake) or deep (10 min) scan. Mitigation, Phase 5: when a scan adds a placement for a message that already has one in folder F on a non-QRESYNC session, queue `(F, uid)` and issue one `UID FETCH … (UID)` per F at the end of the pass, tombstoning what the server does not return. That is definitive duplicate-vs-move detection — what the priority table was approximating. |
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

V10 does three things in one transaction: creates `MessageFolder` and backfills one
placement per message; rebuilds the `Message` table without the three location columns; and
rewrites each row's `data` JSON to the §2.4 contract. Rebuilding the table is how SQLite
drops columns anyway (`ALTER TABLE … DROP COLUMN` rewrites the table per column — measured
5.7 s each on the benchmark DB), so doing it once and folding the JSON rewrite into the same
pass is the cheapest way to leave nothing behind.

```sql
-- V10, inside BEGIN IMMEDIATE … COMMIT (busy timeout 60 s covers a lingering sync process)
CREATE TABLE MessageFolder (…);                                  -- §2.2

-- 1. one placement per message, from the IMAP truth (remoteFolderId/remoteUID, not data.folder)
INSERT INTO MessageFolder (accountId, messageId, folderId, remoteUID, unread, starred, draft, remoteXGMLabels, syncedAt, unlinkedAt)
SELECT accountId, id, remoteFolderId,
       CASE WHEN remoteUID > 4294967290 THEN 0 ELSE remoteUID END,
       IFNULL(unread,0), IFNULL(starred,0), IFNULL(draft,0), IFNULL(remoteXGMLabels,'[]'),
       IFNULL(CAST(json_extract(data,'$._sa') AS INTEGER), 0),
       CASE WHEN remoteUID > 4294967290 THEN strftime('%s','now') ELSE NULL END
FROM Message
WHERE remoteFolderId IS NOT NULL AND remoteFolderId != '';

-- 2. rebuild Message without remoteUID / remoteFolderId / remoteXGMLabels and with the new JSON
CREATE TABLE Message_v10 (id VARCHAR(40) PRIMARY KEY, accountId VARCHAR(8), version INTEGER, data TEXT,
  headerMessageId VARCHAR(255), gMsgId VARCHAR(255), gThrId VARCHAR(255), subject VARCHAR(500), date DATETIME,
  draft TINYINT(1), unread TINYINT(1), starred TINYINT(1), replyToHeaderMessageId VARCHAR(255), threadId VARCHAR(40));
INSERT INTO Message_v10
SELECT id, accountId, version,
       json_set(
         json_remove(data, '$.folder', '$.remoteFolder', '$.remoteUID', '$.remoteFolderId'),
         '$.folders',
         CASE WHEN remoteFolderId IS NULL OR remoteFolderId = '' OR remoteUID > 4294967290
              THEN json('{}')
              ELSE json_object(remoteFolderId, IFNULL(unread,0) | (IFNULL(starred,0) << 1) | (IFNULL(draft,0) << 2))
         END),
       headerMessageId, gMsgId, gThrId, subject, date, draft, unread, starred, replyToHeaderMessageId, threadId
FROM Message;
DROP TABLE Message;
ALTER TABLE Message_v10 RENAME TO Message;
CREATE INDEX MessageListThreadIndex ON Message(threadId, date ASC);
CREATE INDEX MessageListHeaderMsgIdIndex ON Message(headerMessageId);
CREATE INDEX MessageListDraftIndex ON Message(accountId, date DESC) WHERE draft = 1;
CREATE INDEX MessageListUnifiedDraftIndex ON Message(date DESC) WHERE draft = 1;

-- 3. placement indexes last (bulk insert is faster without them)
CREATE UNIQUE INDEX MessageFolderUIDIndex …; CREATE INDEX MessageFolderMessageIndex …; CREATE INDEX MessageFolderUnlinkedIndex …;
PRAGMA user_version = 10;
COMMIT;
```

Rules and measurements:

- Unlink sentinels (`remoteUID > UINT32_MAX − 5`) become tombstones dated now with
  `folders = {}` in the JSON; the first pass's sweep deletes them as today would have. Local
  drafts keep `remoteUID = 0` in the Drafts folder. Rows whose `data.folder.id` differs from
  `remoteFolderId` (moves in flight; 15 of 258k in the benchmark DB) are migrated from the
  IMAP truth; the pending `Task` row will re-run its remote phase and fix the placement.
  `data.labels` (X-GM-LABELS) stays in the JSON as-is — it is the single Gmail placement's
  labels and the client reads it.
- Exactly one placement per message is created, so thread refcounts, `ThreadCategory` and
  `ThreadCounts` are unchanged by the migration itself. Second copies are discovered by
  ordinary scans afterwards and update threads through the normal upsert path. No rebuild.
- Cost. Measured on 1.15 GB / 258,605 messages: placement backfill 4.5 s, one `Message`
  table rewrite ~6 s without JSON functions; with `json_set`/`json_remove` over 1.1 KB rows
  budget ~10–15 s, plus ~1 s for indexes. Extrapolated to 1M messages: 40–60 s. The rewrite
  needs free space for a second copy of the `Message` table (~450 MB here, ~1.7 GB at 1M) in
  the WAL until commit, after which the old pages are reclaimed by the 30-day `VACUUM`. Print
  `"\nRunning Migration"` so the client shows its progress window (`mailsync-process.ts:503-507`,
  the V3 precedent). **Check free space ≥ 1.5× the `Message` table size before starting**
  (`SELECT SUM(pgsize) FROM dbstat WHERE name='Message'` or `page_count × page_size` as a
  ceiling), and make the failure message distinguish disk-full from corruption before the
  client offers "Rebuild" (which deletes the database).
- Atomicity: a crash mid-transaction rolls back DDL too, leaving `user_version = 9` and the
  original `Message` table; the next launch retries.
- **Downgrade is not supported.** An older binary opening a V10 database fails on its first
  `INSERT INTO Message (… remoteUID …)` with "no such column" and the account goes into an
  error state; the remedy is Preferences → Rebuild (or deleting `edgehill.db`), which is a
  cache rebuild, not data loss — Mailspring is an IMAP cache. Document this in the release
  notes for the version that ships V10.
- Add `DELETE FROM MessageFolder WHERE accountId = ?` to `ACCOUNT_RESET_QUERIES`
  (`constants.h:34-54`).
- Post-migration sanity: count messages with zero placements and log it; do not raw-DELETE
  them (that bypasses `afterRemove` and skews thread counters). Expected: 0. Run the §2.3
  reconciliation query once and log any mismatch.

---

## 5. Work plan

Phases 1–3 are one engine branch: because the old location accessors and columns are
removed outright rather than shimmed, the engine does not compile until `TaskProcessor` is
converted, which is the point — the compiler is the audit. Phase 4 ships in the same release,
since the client reads the new `folders` map. Within the branch, the order below is the
order in which the pieces can be built and unit-tested.

### Phase 0 — Bridge (done, uncommitted)

Extend folder priority to any contest involving a real Sent folder on every provider
(`MailProcessor.cpp:188-218`, Gmail excluded via the Label check). Stops the observed
INBOX ↔ Sent flapping now. Deleted in Phase 2.

### Phase 1 — Storage, migration and models (engine, ~700 lines)

| Item | Where |
|---|---|
| DDL, V10 migration, reset query, free-space check, progress line | `constants.h`, `MailStore.cpp:103-188`, `main.cpp:896-904` |
| `MailStore` placement helpers with cached statements: `placementsForMessage`, `upsertPlacement` (ON CONFLICT), `tombstonePlacements(folderId, uids / range)`, `resetPlacementUIDs(folderId)`, `deleteExpiredTombstones(before)`, `orphanMessageIds(limit)`, `deletePlacementsForMessage`; rewrite `fetchMessagesAttributesInRange`, `fetchMessageUIDAtDepth` against `MessageFolder` (`unlinkedAt IS NULL`) | `MailStore.cpp/.hpp` |
| A `Placement` struct (not a `MailModel`) | new header |
| Placement helpers that write the row **and** the message's `_data["folders"]` map + derived flags in one call (§2.3): `upsertPlacement(msg, folder, uid, attrs)`, `setPlacementFlags(msg, …)`, `beginPlacementMove(msg, placement, dest)`, `commitPlacementMove(...)`, `removePlacement(msg, placement)`, `clearTombstones(msg)`; bulk SQL-only helpers `tombstonePlacements(folder, uids) -> affected messageIds`, `resetPlacementUIDs(folder)`, `deleteExpiredTombstones(before)`, `orphanMessageIds(limit)`, `deletePlacementsForMessage(id)`; cached statements | `MailStore.cpp/.hpp` (or a `PlacementStore` helper owned by `MailStore`) |
| Folder role/path cache by id on `MailStore` (same shape as `allLabelsCache`, invalidated on Folder save/remove) so `isInInbox` & co. resolve roles without embedding them per message | `MailStore.cpp/.hpp` |
| `Message`: constructor no longer writes folder/UID into `_data`; `folderIds()`, `placementFlags(folderId)`; derived `unread/starred/draft` recomputed by the helpers; `afterRemove` deletes placements; `columnsForQuery`/`bindToQuery` drop three columns; `inAllMail`, `_isIn`, `isInInbox`, `isSentByUser` iterate `folders` keys through the role cache; `remoteFolder()`, `remoteFolderId()`, `remoteUID()`, `clientFolder()`, `clientFolderId()`, `setRemoteFolder()`, `setClientFolder()`, `setRemoteUID()`, `remoteXGMLabels()` setters **deleted** (labels move to the placement; `labels` in JSON is derived) | `Models/Message.cpp/.hpp` |
| `MessageSnapshot` carries the `folders` map (folderId → flag bits) + labels, captured from `_data` at load — no query; `Thread::applyMessageAttributeChanges` becomes a set-diff over distinct folders with per-placement `_u`; fix the precedence bug at `Thread.cpp:215/289` (`x - unread && inAllMail` stores a bool) | `Models/Thread.cpp` |
| `queriesForUIDRangesInIndexSet` renames the column; callers execute it as an UPDATE | `MailUtils.cpp:484-528` |
| `Folder::afterRemove` deletes the folder's placements, then the orphan sweep runs (today messages in a removed folder are orphaned forever) | `Models/Folder.cpp:81-87` |

### Phase 2 — Sync core (engine, ~700 lines)

| Item | Where |
|---|---|
| `insertMessage` inserts the first placement in the same transaction; `updateMessage` → `upsertPlacement` (guard on `Message.syncedAt`, change detection against the `(folder, uid)` row, tombstone clearing, save only when derived state changed); `insertFallbackToUpdateMessage` also catches a placement unique-index collision (fg/bg race on the same UID) | `MailProcessor.cpp:87-298` |
| Delete the folder-priority block, `priorityForFolderRole`, the `isUnlinked` reclaim branch, all `UINT32_MAX` sentinel checks | `MailProcessor.cpp:188-242`, `MailUtils.cpp:408-432`, `SyncWorker.cpp:1343` |
| `unlinkMessagesMatchingQuery` → `tombstonePlacements`; `deleteMessagesStillUnlinkedFromPhase` → timestamp sweep; remove `unlinkPhase`, add `passStartedAt` | `MailProcessor.cpp:519-600`, `SyncWorker.cpp:72, 676-678`, `.hpp:39` |
| `syncFolderUIDRange`: `local` from placements; step 5 tombstones in chunks of 200; return `{message, uid}` pairs for the newest-first body ordering at `SyncWorker.cpp:584` | `SyncWorker.cpp:1028-1177` |
| `syncFolderChangesViaCondstore`: collapse the find/update pair at `:1232-1244` into `insertFallbackToUpdateMessage`; VANISHED → tombstones | `SyncWorker.cpp:1179-1257` |
| UIDVALIDITY rebuild per §2.5 | `SyncWorker.cpp:439-486` |
| Body fetch: `syncMessageBody(msg, preferredFolder)` picks the preferred folder's live placement with `uid > 0`, else any live non-spam/trash placement, and tries the next placement on `ErrorFetch`; rewrite the four raw SQL statements (`cleanMessageCache`, `countBodiesDownloaded`, `countBodiesNeeded`, `syncMessageBodies`) as joins with `COUNT(DISTINCT messageId)` | `SyncWorker.cpp:1282-1436` |
| Gmail exclusivity rule (§2.8) in `upsertPlacement` | `MailProcessor.cpp` |
| Trim NetEase all-folder deep-scan coupling to per-folder | `SyncWorker.cpp:342-370, 567` |
| Comment at `SyncWorker.cpp:1000-1005` loses the "higher-priority folder owns it" cause; keep `shouldRetryTruncatedScan` for the `syncedAt` case | |

### Phase 3 — Tasks (engine, ~550 lines)

| Item | Where |
|---|---|
| `performLocalChangeOnMessages` / `performRemoteChangeOnMessages`: iterate placements, group UIDs by server folder, key the reload map by placement row, per-placement confirm | `TaskProcessor.cpp:772-896`, signature in `.hpp:58-59` |
| Move: `_applyFolder` sets `pendingFolderId` on the placements selected by §3.1; `_moveMessagesResilient` reads/writes per placement, MOVEs even when dest already has a copy, skips `uid == 0` (today a `remoteUID 0` draft in a moved thread sends UID 0 in the MOVE — latent bug); engine writes `undoPlacements`; handle `restorePlacements` on undo tasks (MOVE one destination copy back to each recorded source) | `TaskProcessor.cpp:70-160, 265-274` |
| Flags: `_applyUnread`/`_applyStarred` set every placement; IMAP variants STORE per folder | `TaskProcessor.cpp:233-263` |
| Labels: operate on the single Gmail placement | `TaskProcessor.cpp:276-349` |
| Send: delete the remote draft via its placements; create the Sent placement (non-Gmail) or the All Mail placement (Gmail, §2.8); `SyncbackMetadataTask` by `localMessage->id()` is unchanged | `TaskProcessor.cpp:1486-1868` |
| Drafts: `inflateClientDraftJSON` no longer needs to carry `remoteUID`/`remoteFolder`; `performLocalSaveDraft` preserves placements across the `_data` swap (automatic — they live in the table); destroy transfers the placement to the placeholder id; remote destroy iterates placements; a range scan never tombstones a `uid == 0` placement | `TaskProcessor.cpp:688-749, 898-993` |
| `ExpungeAllInFolder`: delete the folder's placements in chunks, then sweep orphans. `GetMessageRFC2822`: pick a placement (prefer non-spam/trash, `uid > 0`). `GetManyRFC2822`: paginate `MessageFolder` on `(accountId, folderId, remoteUID)` and join `Message` for subject/date | `TaskProcessor.cpp:1919-2209` |
| Every remaining compile error from the deleted `Message` accessors is a call site to convert; the branch is done when `grep -rn "remoteFolder\|remoteUID\|clientFolder" MailSync/` returns only the migration SQL | |

### Phase 4 — Client (~4–6 days, dominated by task/undo semantics)

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

### Phase 5 — Provider follow-ups

- Optional end-of-pass `UID FETCH` verification for non-QRESYNC sessions (§2.9).
- Lengthen the gateway-copy wait in the send path on Exchange to reduce duplicate Sent copies.

### Phase 6 — Verification

Engine tests against Dovecot 2.3.21 with CONDSTORE+QRESYNC (the harness used for #140), and
against the four live accounts (Office 365, Yahoo, two Gmail) from a wiped database:

| Scenario | Expected |
|---|---|
| Self-addressed mail on O365/Yahoo | one message, `folders: [INBOX, Sent Items]`, appears in both views, zero `FolderID` flips in the log, badge counts stable |
| 2–4 copies in Sent Items | one message, one folder entry, zero `UID (a to b)` flips |
| Move Inbox → Archive from another client (Dovecot QRESYNC, Gmail, O365) | `persist` with `folders: []` then `folders: [Archive]`; no `unpersist`; snooze metadata still attached |
| Delete from another client | placement tombstoned, message removed at the end of the next pass, `unpersist` once |
| UIDVALIDITY change on a 100k folder | one UPDATE, no deltas, all messages relinked; truncated rebuild keeps its tail |
| Archive thread with a Sent copy from Inbox view | Inbox placement moves, Sent copy stays; undo restores exactly that placement |
| Trash thread | every placement moves |
| Mark read from Inbox on a self-addressed message | both copies STOREd `\Seen`; thread not bold anywhere |
| Gmail archive / trash / label / send / self-send | single placement moves between All/Spam/Trash; labels intact; sent message lands with an All Mail placement |
| Draft create / edit / send / delete | one Drafts placement at uid 0 then real uid; placeholder prevents re-insert; no lingering stubs |
| Migration on a 1 GB database | ~5 s, one placement per message, thread counts unchanged, app opens normally; crash mid-migration retries cleanly |
| Foreground IDLE unlink then background sweep | ≥ one full pass of grace (the old phase bug) |

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
- The two-phase grace before deleting a message — now timestamp-based and only for messages
  with zero placements.
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
| Two workers upserting the same `(folder, uid)` | catch the unique-index collision in `insertFallbackToUpdateMessage` as error 19 is caught today |
| Placement snapshot in JSON drifting from the table | all writes go through the §2.3 helpers; no other writer; reconciliation query in the test suite and `--mode verify` |
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
