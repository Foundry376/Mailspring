# 01 — Provider quirk quick fixes

**Source.** A provider-quirks audit (September 2026) compared the workarounds in Thunderbird, Evolution, Geary, K-9, Delta Chat and imapsync against the engine. These are the REAL, cheap items. Each is independent, so make one commit per item. Read `README.md` first for how to test.

Line numbers below refer to `message-placements` at the time of the audit. Re-locate them before editing.

## 1a. The no-MOVE fallback runs a plain EXPUNGE (data loss)

- **Where.** `MailSync/TaskProcessor.cpp`, `_moveMessagesResilient`: COPY, then `storeFlagsByUID(+\Deleted)`, then `session->expunge(path)`. The code already notes "this will empty their whole trash".
- **Problem.**
  - A plain EXPUNGE permanently removes **every** message flagged `\Deleted` in the source folder. That includes messages another client only marked for deletion. Outlook desktop's IMAP "mark for deletion" mode does this, and so do some webmail setups.
  - It also runs even when the STORE failed.
- **Fix.** Thunderbird does this already (`nsImapProtocol.cpp` ~3350–3380).
  - If the server has UIDPLUS, `expungeUIDs` exactly the moved UIDs. Fall back to a plain EXPUNGE only if that fails, as `_removeMessagesResilient` already does.
  - Skip the expunge if the `\Deleted` STORE failed.
- **Test.** Run on a fake personality without MOVE (e.g. `courier`, or `plain` with MOVE suppressed):
  1. Mark an unrelated message `\Deleted` from "another client" (a harness server step).
  2. Move a different message with a ChangeFolderTask.
  3. Assert the unrelated message is still on the server.

  This must fail on the pre-fix binary.

## 1b. Folder-role detection bugs

Folder roles are detected in two places: `MailSync/MailUtils.cpp` (`roleForFolderViaFlags`, `roleForFolderViaPath`) and `MailSync/constants.h` (`COMMON_FOLDER_NAMES`).

- **`\Archive` (RFC 6154) is not mapped.** `roleForFolderViaFlags` has no case for `IMAPFolderFlagArchive`. Map it to `archive`.
- **Folder paths are compared without decoding.** The UTF-8 keys in `COMMON_FOLDER_NAMES` are compared against raw modified-UTF-7 paths, so non-ASCII names never match. Decode first (mailcore has helpers for modified UTF-7), then lower-case, then look up.
- **Two entries map to the wrong role:**
  - `"borradores"` (Spanish for Drafts) maps to **trash**.
  - `"koš"` (Czech for Trash) maps to **sent**.

  Audit the rest of the table while you're there.

These only matter on servers without SPECIAL-USE, but a wrong role is serious. For example, drafts shown as trash.

- **Test.** Use a fake personality without SPECIAL-USE, with folders named `Borradores`, `Koš` (modified UTF-7 on the wire) and one with `\Archive`. Assert each folder's role in the DB.

## 1c. Detect "UIDNEXT 0" from server behaviour, not the hostname

- **Problem.** hMailServer, home.pl (IdeaImapServer), NetEase and other Coremail hosts return `UIDNEXT 0`, or omit it from STATUS.
  - Evidence: Geary `imap-status-data.vala` ~104 ("hMailServer and … home.pl … sends UIDNEXT 0"); Delta Chat CHANGELOG ("servers not returning UIDNEXT … such as mail.163.com").
- **Where.** The engine's counts-changed workaround only runs when `account->isNetEase()` (`SyncWorker.cpp` ~451). On any other such server, the new-mail and shallow scans are skipped, so new mail waits for the 10-minute deep scan.
- **Fix.** Trigger it on `remoteStatus.uidNext() == 0`.
- **Test.** Add a fake personality quirk that returns `UIDNEXT 0`. Deliver a new message and assert it arrives within one pass, not only on a deep scan.

## 1d. Send ID to Coremail servers detected by greeting

- **Problem.** Coremail servers reject SELECT with "Unsafe Login" until the client sends `ID`.
  - Evidence: offlineimap #696, nextcloud/mail #10679, himalaya #651.
  - Thunderbird sends ID to every server by default.
- **Where.** The engine only sends ID to three hostnames (`Account.cpp` ~129–133, `MailUtils.cpp` ~815). It misses `imap.vip.163.com`, `imap.188.com`, `qiye.163.com` and custom Coremail hosts.
- **Fix.** Send ID when the greeting identifies Coremail (libetpan already matches "Coremail System IMap Server Ready"). Alternatively, send ID whenever the server advertises it. That is what Thunderbird does, and it is simplest. Check that ID is harmless on the other personalities.
- **Test.** The existing `netease-id-before-select` scenario covers the mechanism; it needs an `/etc/hosts` entry. Add a Coremail greeting personality on a non-NetEase hostname.

## Not in scope

These came up in the same audit but are left out:

- iCloud's unescaped quote inside Message-IDs in ENVELOPE (Apple forum 724704). It needs a live repro first.
- O365 "User is authenticated but not connected" (imapsync FAQ). This is error classification only.
- Dovecot ≤ 2.3.4 `MISSING_MAILBOX` placeholders. Cosmetic.
