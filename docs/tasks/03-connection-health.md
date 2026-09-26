# 03: Connection health and recovery

Read `README.md` first for how to test.

## Symptoms

- After an apparent network drop, recovery took about 5 minutes on every account (live test, 2026-09-24).
  - The logs and `pmset -g log` show the actual cause: the machine was sleeping. A DarkWake at 14:18:41, then maintenance sleep, then a full wake at 14:24:05.
  - The engine's 120 s retry wait only counts awake time.
  - Every retry opened a fresh connection. mailcore sets `mShouldDisconnect` on both ErrorParse and ErrorConnection, so there was no stale-session reuse.
  - The foreground IDLE only noticed its dead socket when the client's `wake-workers` sent DONE.
  - An earlier ~30-minute Yahoo stall (2026-09-23) couldn't be analysed because those logs had rotated away. A silently dead IDLE (below) is the likely cause.
- The placements PR's `e5db7ed` fixed how the error is classified: a connection closed mid-command is now reported as ErrorConnection, so the client's offline state fires. It does not fix the problems below. Sleep/wake handling (#2 below) is the biggest real-world win.

## What the engine does today

Findings as of September 2026; re-verify file:line before editing.

- **Every command read is capped at 30 s.** mailcore passes `mTimeout = 30` (`MCIMAPSession.cpp` ~408, ~684) to libetpan's low streams. A dead connection therefore stalls one *command* for at most about 30 s.
- **IDLE waits up to 28 minutes with no read timeout** (`MAX_IDLE_DELAY 28*60`, `MCIMAPSession.cpp` ~115, ~3836). If the connection dies silently while idling (laptop sleep, Wi-Fi switch, NAT expiry), nothing notices until the 28 minutes are up. At that point DONE runs into the 30 s read. This most likely explains the 30-minute Yahoo stall.
- **No TCP keepalive anywhere:** not in libetpan, mailcore2 or MailSync. On macOS mailcore uses CFStream and sets a deprecated VoIP service type, which provides no liveness check.
- **DNS resolution is unbounded.** `getaddrinfo` blocks with no timeout.
- **Retryable errors always wait a flat 120 s** (`main.cpp` ~159, ~224).
- **The Electron client never tells the engine about sleep/wake or network changes.** `app/src` has no `powerMonitor` and no `online` listener. `wake-workers` is only sent in three cases:
  - on manual "Sync mail now";
  - from the offline banner's retry;
  - on an offline→online transition, which needs a connection error to have been reported first.

  The comment at `main.cpp` ~800 saying it's "called when waking from sleep" is wrong.
- **`wake-workers` doesn't force a reconnect.** It only notifies the sleep condition variable and interrupts IDLE.

## What other clients do

From the research, with source links:

| Client | IDLE re-issue | Keepalive | Read timeout | Reconnect / backoff |
|---|---|---|---|---|
| Thunderbird | No IDLE timer. Checks every 10 min; kills cached connections idle ≥29 min | TCP keepalive on by default (idle 100 s, interval 5 s) | 100 s | Rebuild on next use |
| K-9 / TB-Android | Every 24 min | None | 60 s (IDLE: refresh + 2 min) | Flat 5 min on IO errors; reconnects on network-change callback |
| Evolution | 29-min inactivity timer, then re-IDLE or NOOP | `g_socket_set_keepalive` | 30 s | NetworkMonitor |
| Geary | NOOP every 9.5 min while idling | NOOP before reusing a session idle for more than 5 s | 30 s per command | NetworkMonitor debounce; stops on sleep and restarts on resume (logind) |
| Delta Chat | Every 5 min | None | 60 s | Jittered exponential backoff, 2 s to 80 s |

RFC 2177 says to re-issue IDLE at least every 29 minutes. NAT devices and mobile carriers often drop idle flows much sooner.

## Suggested changes, ranked

1. **Cap IDLE at about 9–10 minutes,** then send DONE and re-IDLE, as Geary and K-9 do. This bounds silent push loss at about 10 minutes and costs one round trip every 10 minutes. It's a mailcore change, or pass a shorter delay through `idle()`.
2. **Reconnect on wake and network change.** A live Wi-Fi test on 2026-09-24 confirmed this is the biggest gap. With Wi-Fi off for about 30 s, every account reported ErrorConnection and the offline banner appeared. Recovery then waited out the full 120 s worker sleep, about 2 minutes after the network had returned, because nothing woke the workers. The cheapest first step is client-only: on the renderer's `online` event, call `AppEnv.mailsyncBridge.sendSyncMailNow()`.
   - Electron: listen for `powerMonitor` `resume` and `unlock-screen` and the renderer's `online` event, and send `wake-workers` with a `reconnect` flag.
   - Engine: `disconnect()` both sessions instead of reusing them.
   - Debounce by about 3 s, because there is one engine per account.
3. **Jittered exponential backoff** in place of the flat 120 s: start at 2–5 s, cap at 2–5 minutes, reset on success. Keep auth errors separate.
4. **TCP keepalive:** idle 60–120 s, interval 5–10 s, count 3–5, set with `setsockopt` after connect. On macOS, use the CFStream native handle (`kCFStreamPropertySocketNativeHandle`, `TCP_KEEPALIVE`). This needs a vendor patch on three platforms.
5. **On a connection-class error, reconnect and retry once immediately,** before backing off. This matters most when the session had sat idle for more than about 60 s. Alternatively, send a NOOP before reusing an idle background session.
6. **Engine-side wake heartbeat, as a fallback for #2.** Compare the system and steady clocks every 30 s and treat a jump as a wake. This isn't verified on Windows or Linux.
7. **Bound DNS resolution.** Low priority.
8. **Classify transient server refusals as retryable.**
   - **Observed** on O365 (engine 67033, 2026-09-24 21:00:49): `LIST "" "*"` got back `NO Server Unavailable. 15` + `* BYE Connection closed.`. The engine mapped this to `"key":"ErrorNonExistantFolder","retryable":false` (`syncFoldersAndLabels - fetchAllFolders`), so the process aborted and the client relaunched it.
   - **Fix:** a `NO` on LIST, or a response carrying `* BYE`, during a transient Exchange outage should be ErrorConnection (retryable, offline), not a non-retryable folder error. Check how mailcore maps LIST failures to `ErrorNonExistantFolder`.
   - **Related:** Yahoo occasionally returns a transient `ErrorAuthentication` on login (twice on 2026-09-25, followed by clean relaunches). Aborting on auth errors is by design, but consider one retry before aborting.

Items 1–3 are the core. Item 4 is worth it if the vendor patch stays small.

## Testing

- **Harness.**
  - Cyrus's `drop_connections` kills imapd without a BYE, which is a realistic dead-connection case. The fake has `server.pause`.
  - Add a scenario that holds a connection open without responding, mimicking a half-open socket. Assert the engine notices within the new IDLE/keepalive bound and resumes after the backoff.
  - Timing-sensitive tests should read their intervals from environment variables, as `ORPHAN_SWEEP_MAX_WAIT` does, not from compile-time constants.
- **Live.** Run the dev app with verbose logging.
  - Disable Wi-Fi for 1 minute, then re-enable it. Sleep the laptop for 5 minutes and wake it. Switch networks.
  - For each, record from the engine logs how long until each account reconnects and syncs a message sent from another device.
  - Compare against the current build. Targets: seconds after wake or a network change, and no more than about 10 minutes for a silently dead IDLE.
