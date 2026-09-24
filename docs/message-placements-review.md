# Message placements: review pass changes and rationale

September 2026. This covers engine commits `a5db80b..3f634db` and client commits `f3d8069b3`, `e477184c1`, `e8d49efa7` and `44927c5ef` on `message-placements`. The design as implemented is described in `message-placements-plan.md` and `mailsync/CLAUDE.md`. This document explains **why** the review pass changed it.

## How the review was done

1. **Independent architecture pass.** Starting from the pre-placement engine (`master`), a reviewer who had not read the original plan designed a one-to-many model from scratch. It then compared that model with the branch.
2. **Branch review.** The reviewer went through all 2,600 lines of the branch's engine changes, looking for bugs and for complexity the design didn't need.
3. **Fixes.** Each fix was made in its own step. Every step was reviewed and run against the full harness on the fake server and on Dovecot before the next one started.
4. **Blind review.** The session that built the branch then reviewed the commits without this rationale. It found no real scenario broken by any removal. Its findings are listed at the end.

**Guiding rule (the owner's):** don't keep engine complexity for edge cases that real IMAP servers or users are extremely unlikely to produce. Every edge case was sorted into one of two groups:
- **Real:** seen in the wild, a documented provider quirk, or an ordinary user action.
- **Theoretical:** anything else. Handling for these was dropped. A case being reproducible against the fake server does not by itself make it real.

## What the review agreed with

- The core model:
  - a `MessageFolder` table keyed on `(folderId, remoteUID)`, so two copies of a message in one folder (Exchange's duplicate Sent copies) are two rows;
  - message identity stays a hash of the headers;
  - an in-flight move is a pending marker on the row.
- A grace period keyed on the start of the sync pass rather than a per-worker "phase". This also fixed a bug on `master`: the foreground worker's phase never toggled, so copies it saw vanish while IDLE could be swept with no grace at all.
- Skipping Proton's `\All` folder, and the "one copy per message" rule for Gmail's All Mail, Spam and Trash.

## Changes

### 0. The harness checks derived state (`b798a52`)
The harness now recomputes every incrementally maintained layer from the canonical table after every scenario:
- each message's `folders` and flags, from `MessageFolder`;
- thread `_refs`/`_u` and the unread/starred counters, from the message snapshots;
- `ThreadCategory` and `ThreadCounts`;
- `MessageOrphan`, which must list exactly the messages that have no rows.

**Why:** thread counts are maintained by diffing, which carries the most risk, and nothing checked them. `CLAUDE.md` said the snapshot was reconciled, but no code did it. This check found bug 3 on its first run.

### 1. Load the message inside the transaction (`5101b45`) — bug 3
**What was wrong:** both sync workers can process the same server change for one message at the same moment. `updateMessage` diffed a message it had loaded *before* opening its transaction. So both workers applied the same thread delta, and the thread ended up with unread = 2 when one message was unread. The stale save could also overwrite JSON the other worker had just written, such as the snippet or file list.

**Change:** the message and its row are reloaded after `BEGIN IMMEDIATE`, and the decision to write is made there. The read-only check before the transaction is kept, so a scan that finds nothing changed still doesn't open one.

### 2. Orphans instead of per-copy tombstones (`362ff17`, `724621b`) — simplification A
**Why:** the grace period only matters when a message loses its *last* copy. It exists to keep the message's id, metadata, body and thread membership until the folder the message moved to has been scanned. A vanished copy of a message that still has another copy needs no grace at all.

Per-copy tombstones cost a great deal for that one case:
- about 97 references to `unlinkedAt`, and a liveness filter on every query;
- flags OR'd over dead copies, so a message whose only unread copy had been deleted elsewhere still showed unread until the sweep;
- clearing tombstones on every upsert;
- a "revive" branch in move commits;
- a full-table orphan scan as a backstop, because orphans couldn't otherwise be found.

**Change:** a vanished copy's row is deleted. A message left with no rows is recorded in `MessageOrphan(messageId, accountId, since)` in the same transaction, and any new copy clears the record. The sweep removes orphans whose `since` is before its bound, re-checking inside each chunk's transaction (`724621b`, which stops a message revived and orphaned again during a long sweep from losing its grace). Also dropped: `unlinkedAt`, its index, `MessageFolder.syncedAt` (written but never read) and the hourly orphan scan. V10 was edited in place because it never shipped.

**Migration:** pre-V10 messages that were unlinked keep their old folder in the snapshot until the sweep removes them. Their threads still count them, and `afterRemove` decrements the thread using that snapshot, so the counts come out exact.

### 3. Rebuild the snapshot on save (`0fa9b73`) — simplification C
**Why:** each placement helper already re-queried the message's rows (`refreshMessageFromPlacements`) at the end, so the snapshot was being "maintained incrementally" in name only. Keeping it up to date relied on every new helper remembering to make that call.

**Change:** helpers mark the message. `Message::beforeSave` rebuilds the snapshot once, and only for marked messages. This is the same mark-then-rebuild-on-save pattern the thread search index uses. Saves that touch no rows run no query.

**Measured:** query counts fell only on Gmail updates and moves of messages with several copies (about 5% in those scenarios). The gain is mainly that the invariant is now enforced by structure rather than discipline.

Five callers still refresh explicitly, because they must see the result before deciding whether to save and send a delta.

### 4. Always MOVE; undo moves copies back (`2f83306`, client `f3d8069b3`) — simplification B
**Why:** "if the destination already holds a copy, delete the source copy (move it to Trash and expunge) instead of moving it" was destructive on the server. It was there for a rare case: dragging a self-sent Inbox message into Sent. It drove most of the undo complexity:
- `removed` entries in the undo data;
- restoring by COPY (`_restoreAdditionalCopies`);
- an order-dependent heuristic for spreading copies back.

Other clients simply MOVE, and the model already supports two copies in one folder.

**Change:** a selected copy is always moved. The undo data is `{messageId: [{folderId, bits}, ...]}`, one entry per moved copy. Undo moves that many copies out of the original destination, highest UID first, back to the recorded folders. Copies already in the destination are never taken: RFC 3501 §2.3.1.1 guarantees a moved copy gets a UID above everything already in the folder.

**Fixed trade-off** (`050cb39`): as first built, copies of one message with different flags could come back in each other's folders. It was observed on Office 365: a message with a read copy in Sent Items and an unread copy in Archive was trashed and undone, and the copies came back swapped on the server, leaving the thread bold in Sent Items. The owner decided to fix it. Each undo entry now carries the copy's flag bits, and the undo first pairs every entry with a copy whose bits still match. `undo-move-restores-placements` checks the server's flags per folder.

### 5. Record new copies even while a task holds the lock (`188a10f`) — bug 1
**What was wrong:** while a task on a message was in flight (the 24h `_sa` lock), `updateMessage` recorded nothing, including a copy the engine had never seen. If another client moved the message's only copy during that window:
- the source copy was deleted and the destination copy was dropped;
- the sweep then removed the message, with its body and metadata;
- on QRESYNC servers the message stayed missing until the daily gap scan.

**Change:** the lock only stops a scan from overwriting flags on copies the engine already knows about. A new copy is always recorded, with the server's flags. A scan never clears a pending move marker.

**Why the server's flags:** a copy that arrives while the STORE is in flight isn't covered by that task. Local flags on that copy would therefore never reach the server.

### 6. Release the lock and markers when a remote phase fails (`61a6a9d`) — bug 2
**What was wrong:** a failed remote phase marked the task complete but never undid its local effects:
- the pending markers stayed, so the message showed in the destination while the server still had it in the source;
- the change counter `_suc` never came back down, so every later task on that message left it locked for 24h.

Also, a failure in one folder meant copies already moved in earlier folders were never recorded.

**Change:** each folder is attempted in turn, and the first failure stops the loop. Before the error is rethrown:
- copies that were moved are committed;
- copies that weren't lose their markers;
- the lock is released;
- database errors still propagate, so the task stays queued.

A failed flag task additionally resets `lastDeep` for the folders it addressed (`a10bcc3`). On a CONDSTORE server the copy's modseq never changed, so only the attributes-only gap scan would otherwise repair the flag, and that runs daily.

### 7. Detect Gmail by capability (`67469d4`)
The one-copy rule for Gmail used `provider() == "gmail"`, which misses Gmail accounts added with generic IMAP settings. It now uses `X-GM-EXT-1`. Contacts and calendar code is unchanged.

### 8. Skip an undo that has nothing to undo (client `e477184c1`)
The engine writes `undoPlacements = {}` when a move selected no copies. The client treated that like "the engine never reported" and fell back to the approximate undo, which could move copies out of the destination. An empty map now produces no undo task.

### 9. Bound the sweep by each folder's last full scan (`dc73817`) — bug 4
**What was wrong:** the sweep ran only after a pass in which every folder was fully covered. One folder whose STATUS failed on every pass (a permissions error on a shared folder, a broken mailbox on some provider) turned the sweep off forever.

**Change:** each folder's coverage time is the start of the last background pass in which it was scanned in full. The sweep bound is:

`min over uncovered folders of max(coveredAt, passStart − 24h)`

- A broken folder can delay orphan removal by at most 24h. It can no longer stop it.
- Coverage is kept in memory, because writing it to `localStatus` would send every folder to the client on every pass. After a relaunch, folders count as never covered, which only makes the sweep wait longer.
- The `ORPHAN_SWEEP_MAX_WAIT` environment variable overrides the limit for tests.

### 10. After the reconcile round (`ef7d25e`, `6baedc8`, `30f3e05`)

- **The sweep waits for an initial walk that is still progressing** (`ef7d25e`). A first sync of a very large folder can run for more than 24 hours; the reviewer watched a 203k-message All Mail take hours. The 24h cap would have stopped waiting for it, so an orphan whose other copy sat in the part not yet walked could have been swept and later re-created without metadata. A folder whose `syncedMinUID` dropped during the pass now holds the sweep with no cap. A walk that stops progressing falls back to the cap.
- **The `LS_*` keys are shared through `constants.h`** (`6baedc8`), so the flag-repair reset can't silently diverge from the key the worker reads.
- **The harness reports a mailsync killed by a signal as such** (`30f3e05`), rather than as a migration failure.

### 11. Found by live testing and research (`04a28db`, `bec025f`, `050cb39`, `12b853b`, `7bd93db`, `e5db7ed`, `aa8806b`, `9bf5084`, `3f634db`)

These came from live testing against real Gmail, O365, Yahoo and Fastmail accounts and a local Cyrus server, and from follow-up research into other clients and servers.

- **Yahoo returns wrong COPYUID mappings.** After a multi-message `UID MOVE`, Yahoo's COPYUID lists ascending ranges, but the UIDs it actually assigns are a permutation of that destination range: 2 of 18 pairs were correct. The engine trusted the map, recorded copies at other messages' UIDs, sent later moves and STOREs to the wrong message, and a displacement could then remove a message that still existed on the server.
  - The engine now fetches headers for exactly the COPYUID destination set and matches by message id (`04a28db`). Single-message moves skip that fetch.
  - A heavy scan that finds a row naming a different message repairs it (`bec025f`).
  - A fake `yahoo` personality reproduces the permutation.
  - This bug predates the branch.
- **Undo restores each copy's flags** (`050cb39`, client `fd7a699d0`). The flag swap accepted in section 4 was seen on O365 in an ordinary trash-and-undo of a self-sent message, so undo data now records each copy's flag bits.
- **Cyrus is a harness server kind** (`12b853b`, `7bd93db`). Fastmail runs Cyrus, configured with `altnamespace` and `/` as the separator. The Dovecot scenario set runs against it.
- **A dropped connection is reported as a connection error** (`e5db7ed`). A connection closed mid-command came back as ErrorParse, so the client never showed its offline state. A one-line libetpan change makes EOF mid-line a stream error. The slow recoveries seen live turned out to be macOS sleep; see `tasks/03-connection-health.md`.
- **The CHANGEDSINCE set is bounded at UIDNEXT−1 instead of `*`** (`9bf5084`).
  - RFC 7162 §3.2.6 limits VANISHED to UIDs in the set, and `*` is the highest UID still in the mailbox. So Cyrus/Fastmail never reported expunges above it (cyrus-imapd #6071: fixed on master, not in any release), and messages deleted or moved from the top of a non-INBOX folder stayed visible until the daily gap scan.
  - UIDNEXT−1 is the range RFC 7162 §3.2.5.1 uses for SELECT QRESYNC.
  - Research found that almost no other client uses QRESYNC. Dovecot's leniency is why `1:*` looked like best practice.
- **Guard against MESSAGELIMIT partial fetches** (`3f634db`).
  - Yahoo advertises `MESSAGELIMIT=1000` (RFC 9738, which Yahoo co-authored). A live probe of a 1,100-message folder found it is not enforced, and research found Yahoo shows legacy clients a 10,000-message window instead.
  - If a server does return `[MESSAGELIMIT …]`, the engine now deletes nothing below the lowest UID returned and treats the scan as incomplete.
  - The guard keys on the response code, not the result count, because Yahoo returns more than it advertises.
- `aa8806b` rewords evidence citations to describe the observations rather than point at local files.

Follow-ups that research surfaced but this PR leaves out are written up in `tasks/`: provider quirk fixes, duplicate Sent copies, connection health, and cheaper deep scans.

## Decided not to do

- **Ghost drafts after a UIDVALIDITY change (bug 5).** Server drafts reset to UID 0 are never tombstoned, so a draft deleted elsewhere during the rebuild stays in Drafts indefinitely. The owner prefers that a draft sticks around rather than being deleted by accident. This is a rare case.
- **Replacing the draft-deletion placeholder with a suppressed row state (E).** Optional cleanup, not needed.
- **A V11 migration for databases created under the original V10.** Only the owner's dev database has one. It's a cache and gets rebuilt.
- **Theoretical cases dropped during implementation** (each subagent listed its own). They include:
  - a ChangeFolderTask cancelled before its remote phase;
  - a UIDVALIDITY change during an in-flight move;
  - another client adding a copy to the destination between a move and its undo;
  - a folder uncovered for more than 24h that turns out to hold a moved copy (the message is re-created without its metadata);
  - a first walk of a huge folder lasting more than 24h.

## Blind review findings (from the session that built the branch)

**Verdict:** a clear improvement, and no real scenario is broken by any removal.

| # | Finding | Decision |
|---|---|---|
| 1 | V10 edited in place breaks databases already at the original V10 | No code. Dev database rebuilt. |
| 2 | A failed flag task on CONDSTORE stays wrong until the daily gap scan | Fixed by forcing a gap scan of the affected folders (`a10bcc3`) |
| 3 | `_placementsChanged` is a public member written from other files | Accessors added (`19dbbea`) |
| 4 | Keeping the earliest orphan `since` is load-bearing but undocumented | Comment added (`19dbbea`) |
| 5 | Undo shows nothing when a move moved nothing | Skipped, low value |
| 7a | The refresh, detach and sweep loops overlap | Merged into `MailProcessor::refreshMessages` with a `KeepAsOrphan`/`Remove` mode; displaced messages record their orphan by construction (`23eda76`) |
| 7b | Have helpers report client-visible changes instead of comparing JSON | Skipped |

Also in that batch:

- a folder whose STATUS fails no longer stays `busy` forever (`295e94f`);
- the review of `dc73817` asked for the 24h wait's trade-off to be stated, and for readable logs (`bc138b1`).

## Open questions for the reconcile round

Does any finding from the blind review still stand after reading this rationale? And is there any case above labelled theoretical that the reviewer has actually seen on a real server?
