# Sync engine follow-up tasks

These tasks came out of the message-placements review (September 2026, see `../message-placements-review.md`). They were deliberately left out of the placements PR. Each one is self-contained. Pick one up with a fresh agent **after `message-placements` has merged**, on its own branch off `master`, with one PR per task.

| Task | Summary | Size |
|---|---|---|
| [01-quirks-quick-fixes.md](01-quirks-quick-fixes.md) | UID EXPUNGE in the no-MOVE fallback, folder-role detection bugs, UIDNEXT-0 and Coremail detection by behaviour | Small, several independent commits |
| [02-sent-copy-duplicates.md](02-sent-copy-duplicates.md) | Stop APPENDing a second Sent copy on providers that save one server-side (O365 has 67 duplicates) | Medium |
| [03-connection-health.md](03-connection-health.md) | IDLE re-issue interval, backoff, reconnect on sleep/wake and network change, TCP keepalive | Medium; engine + client + possibly vendor |
| [04-cheaper-deep-scans.md](04-cheaper-deep-scans.md) | Gate the full-folder scan on a count check; use UID SEARCH instead of FETCH FLAGS | Medium |

Recommended order: 01, 02, 03, 04. Task 04 changes the same scan paths as the Yahoo MESSAGELIMIT guard that landed with the placements PR, so read that code first.

## Before you start

1. Read `mailsync/CLAUDE.md` in full: the architecture, "Message Identity and Placements", the Coding Conventions and the Comment Style. Engine changes must follow it exactly.
2. Read `../message-placements-review.md`. It records how the current design was reached and which edge cases were deliberately not handled.
3. Read `mailsync/test/README.md` and `mailsync/test/docs/adding-scenarios.md` before writing a scenario.

## The owner's realism rule

Don't add engine complexity for edge cases that real IMAP servers or users are extremely unlikely to produce. Tag every edge case you consider:

- **REAL**: seen in the wild, a documented provider quirk, or an ordinary user action.
- **THEORETICAL**: constructible, but not something a real server or user produces.

Drop handling for the theoretical ones, and say so in the commit or PR. A case that reproduces against the fake server is not REAL for that reason alone. Cite the evidence behind every REAL quirk in the code comment: a provider doc, an RFC section, an issue link, or a captured log line.

## How to test

### Harness (required for every engine change)

The harness is in `mailsync/test`. It runs a real `mailsync` binary against a mail server in a known state, then compares the engine's database with the server's truth. After every scenario it also recomputes all derived state and fails on any difference (`test/harness/invariants.py`). The derived state checked is: each message's `folders` snapshot, thread counters, `ThreadCategory`, `ThreadCounts`, and `MessageOrphan`.

```bash
cd mailsync
pip install -r test/requirements.txt       # once: pytest, pytest-xdist, pyyaml
python3 -m pytest test                     # ~6 min, in parallel: fake personalities, Dovecot 2.3 and Cyrus 3.6 (Docker)
python3 -m pytest test --servers fake -k <name>   # narrow by server kind / scenario; -n 0 runs serially
python3 test/run.py test/scenarios/<name>.yaml --server fake:yahoo --keep   # one scenario, keep artifacts
```

Every behaviour change needs a scenario that **fails on the pre-change binary and passes after**. Before rebuilding, save the current binary somewhere, then run the scenario against it with `MAILSYNC_BIN=<path>`. Say in the commit whether the pre-change binary failed. For provider quirks, the fake server has personalities and hooks: `server.reject`, `server.pause`, `quirks` such as `copyuid-permuted`, capability suppression, and `every: true`. Add a new personality or quirk when you need one. `test/docs/adding-scenarios.md` explains how.

The whole run must pass (it ends with a list of every failed or xfailed case and its artifacts directory), with no new opt-outs from the invariant check. If a scenario is known to fail because of an engine bug you are not fixing, mark it `xfail` with the reason and write it up in `mailsync/test/docs/tasks/`.

### Building the engine without disturbing a running app

`xcodebuild -scheme mailsync -configuration Release -destination 'platform=macOS' ONLY_ACTIVE_ARCH=YES build` copies its product over `client/app/mailsync`. That is the binary the dev Electron app runs. If anyone is live-testing the app:

1. Before building, copy `app/mailsync` and `app/mailsync.dSYM.zip` aside and record their `shasum`.
2. After building, copy the new product from `BUILT_PRODUCTS_DIR` to a scratch path, restore the originals, and verify the checksums.
3. Run the harness with `MAILSYNC_BIN=<scratch path>`.
4. Hand the live tester the scratch path. They install it themselves.

Builds take several minutes. Run them in the background and poll with short commands. A single blocking call that sits silent for more than about 10 minutes can stall an agent.

### Live testing against real accounts

The harness has caught every bug we could model. The worst bugs, though, were found by live testing against real providers: Yahoo's permuted COPYUID, and Cyrus's `1:*` VANISHED behaviour. Anything that touches protocol behaviour a provider could implement differently needs a live pass. The method that worked:

- Two Mailspring dev instances with separate config directories, running against the same accounts. One performs the actions. The other syncs fresh and serves as an independent observer.
- Exactly one engine per account per instance. Check PIDs, because duplicate engines produced misleading results once.
- Verbose IMAP logging on. Establish truth **only from raw server responses** (`FETCH … ENVELOPE`), never from Mailspring's database. `docs/evidence/yahoo-copyuid/rawtruth.py` is a parser that does this.
- Fresh fixtures with unique subjects (e.g. `[PLT-Y-n]`), so a subject identifies a message unambiguously.
- An evidence package for each bug: a README, verbatim raw log excerpts with file:line, a per-operation verification table, and a standalone repro script where possible. See `docs/evidence/yahoo-copyuid/` and `docs/evidence/cyrus-vanished-tail/`.

Available accounts: Gmail (Workspace), Office 365, Yahoo, and a Fastmail trial (production Cyrus). The Yahoo test account keeps a `PLT-Bulk` folder with 1100 messages for large-folder tests. With `UIDONLY` off, Yahoo did not enforce its advertised `MESSAGELIMIT=1000` on it (2026-09-24). There is also a local Cyrus server (`python3 mailsync/test/tools/cyrus_server.py start`, IMAP `127.0.0.1:1143`, `test`/`pass`, SMTP sink on `1025`). Don't read account credentials out of Mailspring's config without the owner's explicit OK.

## Lessons learned from the placements work

- **Research other implementations before choosing a fix.** Looking at how Thunderbird, Evolution, Geary, K-9 and Delta Chat handle something, and at the RFC text and server source, changed the fix more than once. `1:*` turned out not to be a best practice. Cyrus had already acknowledged the bug (cyrus-imapd #6071). OBJECTID wouldn't fix the identity problems we actually have. Research is cheap and read-only, and can run in parallel with implementation.
- **Don't trust server-reported mappings where you can verify cheaply.** Yahoo's COPYUID is a permutation of the truth. Where the answer determines which message a row names, verify it by message id.
- **The harness is only as good as its servers.** Dovecot is lenient in ways Cyrus and Yahoo are not. The COPYUID and VANISHED bugs passed every Dovecot scenario. When a live finding shows the harness was blind, add the missing server behaviour to the fake or to Cyrus, not just a scenario.
- **Check derived state from scratch.** The invariant check found a concurrency bug (both workers applying the same thread delta) on its first run. That bug had shipped. When you add derived or cached state, add it to `invariants.py`.
- **Two workers share one database, each with its own connection.** Anything that loads a model and then saves it must reload inside the `BEGIN IMMEDIATE` transaction. Folder `localStatus` writes must go through `saveFolderStatus`, which diffs against a snapshot, or they will be overwritten.
- **Blind review, then reconcile.** Having a second agent review the commits without our rationale, and only then reconcile against a written rationale doc, surfaced a real migration problem and a real liveness gap. It also confirmed the simplifications held.
- **Keep changes small and sequential.** One subagent per step, reviewed and run through the full suites before the next step starts. Steps that touch the same files never run in parallel.
- **Machine sleep stalls long runs.** If a harness run or agent stalls, check for sleep before suspecting a hang.
