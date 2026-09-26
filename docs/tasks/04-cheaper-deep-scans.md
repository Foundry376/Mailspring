# 04 — Cheaper deep scans on servers without QRESYNC

Read `README.md` first for how to test. Also read the Yahoo `MESSAGELIMIT` guard that landed with the placements PR: this task changes the same scan paths.

## Background

For folders on servers without CONDSTORE+QRESYNC (Exchange/O365, Yahoo, iCloud, Gmail), the engine does three things. See `SyncWorker::syncNow` and `syncFolderUIDRange`.

- It fetches new UIDs above the stored uidnext.
- Every 2 minutes it runs a **shallow** scan: `UID FETCH <bottom>:* (FLAGS)` over roughly the newest 400 UIDs.
- Every 10 minutes it runs a **deep** scan: `UID FETCH <syncedMin>:* (FLAGS [X-GM-LABELS])` over the whole folder. It then diffs the result against local rows to find expunges and flag changes.

Costs:

- On a 200k-message folder, a deep scan is about 10 MB of FLAGS (20–30 MB on Gmail with labels), plus 200k mailcore objects, plus a 200k-row local read, every 10 minutes.
- Gmail has CONDSTORE but no QRESYNC, so it takes the same path and deep-scans All Mail.

## Research findings (September 2026)

| Technique | Cost at 200k msgs | Support | Used by |
|---|---|---|---|
| Compare the STATUS MESSAGES/EXISTS count with the local copy count | ~60 B, one round trip (the engine already fetches STATUS every pass) | All servers | Thunderbird, Evolution, Geary |
| `UID SEARCH ALL` | ~1.4 MB. mailcore returns a compressed IndexSet, with no per-message objects | All servers (Mail2World needs `SEARCH ALL UID`) | Geary, Nylas, K-9 (visible window only) |
| ESEARCH `RETURN (ALL)` | Scales with the number of gaps, not messages | Gmail, Dovecot, Cyrus and iCloud support it; O365 and Yahoo don't. **libetpan can't parse ESEARCH**, so this needs a vendor patch | none |
| `UID SEARCH UNSEEN` / `FLAGGED` | ~7 B per match | All servers | Evolution uses the UNSEEN *count* as a rescan trigger |
| CONDSTORE `CHANGEDSINCE` for flags | Scales with the number of changes | Gmail, iCloud, Dovecot, Cyrus | Nylas uses it on Gmail |

- Thunderbird skips work unless UIDNEXT, MESSAGES or UNSEEN changed (`nsImapMailFolder.cpp` `UpdateImapMailboxStatus`).
- Evolution does a full FLAGS fetch only when counts differ, and otherwise at most once a day.
- Geary assumes "appends only" when the UIDNEXT delta equals the count delta.

## Suggested approach, ranked

1. **Gate the expunge check on counts.**
   - After fetching new UIDs, compare the server's MESSAGES with the local live placements in the folder (`remoteUID > 0`). If they're equal, nothing was expunged: UIDs only grow. This alone should remove about 95% of deep scans on quiet folders.
   - On a selected folder, STATUS can be stale (RFC 3501 §6.3.10). Use EXISTS after a NOOP there; the engine already has `noopSelectedFolder`.
   - Messages the engine failed to ingest leave a permanent mismatch. That is safe (it falls back to scanning), but keep a daily full scan to repair them.
   - A truncated new-mail fetch makes the count inexact. Force a scan in that case.
2. **When the counts differ, use `UID SEARCH ALL` instead of FETCH FLAGS,** and diff the UID set to find vanished copies. Use ESEARCH `RETURN (ALL)` later, once libetpan is patched.
3. **Detect flag changes without CONDSTORE.** Every 10 minutes, or when STATUS UNSEEN changes, diff `UID SEARCH UNSEEN` and `UID SEARCH FLAGGED` against the local per-placement bits. This does not cover Gmail labels.
4. **Gmail:** use `CHANGEDSINCE` for flags and labels (`syncFolderChangesViaCondstore` exists), and items 1–2 for expunges. **Before relying on it, confirm on a live Gmail account that a label-only change bumps MODSEQ.** Google doesn't document this. Under CONDSTORE without QRESYNC, don't rely on HIGHESTMODSEQ to detect expunges.
5. **Keep a daily full FLAGS scan as a backstop,** on the same interval as `CONDSTORE_GAP_SCAN_INTERVAL`.

## Risks

- **Yahoo `MESSAGELIMIT`.**
  - Yahoo advertises `MESSAGELIMIT=1000` (RFC 9738, co-authored by Yahoo). There's no evidence Yahoo enforces 1000 on normal clients.
  - It verifiably shows normal clients only the newest ~10,000 messages per folder.
  - `UID SEARCH` is subject to the same limit. Keep the guard that landed with the placements PR, and chunk any new range commands to within the advertised limit on Yahoo.
- **The count gate trusts the server's count.** Exchange's STATUS accuracy on large folders is unverified.

## Testing

- **Harness.**
  - Use a large folder (`condstore-initial-sync-large` has a generator).
  - Assert that a quiet pass sends no full-folder FETCH (check the server transcript).
  - Assert that an expunge made by another client below the shallow window is still detected within one pass once counts differ.
  - Assert that flag changes on old messages are detected by the SEARCH diff.
  - Run on the `fake:plain`, `fake:yahoo`, `dovecot` and `cyrus:plain` servers.
- **Live.** Log how many bytes deep scans transfer before and after, on the O365 and Gmail accounts. Confirm the Gmail MODSEQ behaviour with a raw probe before building step 4.
