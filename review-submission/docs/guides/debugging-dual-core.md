# Debugging the Dual-Core (Electron–C++ Bridge)

This guide explains how to debug the boundary between the Electron app and the C++ Mailsync process: enabling verbose logging for the C++ process, where stdout and logs go, and how to run the app in Dev Mode with the Inspector open.

## Enabling Verbose Logging for the C++ Process

The C++ Mailsync binary is spawned with a **`--verbose`** flag when the app is configured for verbose sync logging. There is **no DEBUG environment variable** passed to the child; verbose mode is controlled entirely by app config and the spawn arguments.

### How verbose mode is set

1. **App config**  
   The bridge reads the config key **`core.sync.verboseUntil`** (see [app/src/flux/mailsync-bridge.ts](../../app/src/flux/mailsync-bridge.ts)). If this value is a **future timestamp** (in milliseconds), the bridge passes `verbose: true` to `MailsyncProcess`, which then adds **`--verbose`** to the spawn arguments (see [app/src/mailsync-process.ts](../../app/src/mailsync-process.ts) lines 166–168):

   ```ts
   const args = [`--mode`, mode];
   if (this.verbose) {
     args.push('--verbose');
   }
   ```

2. **In-app toggle**  
   Use **Help → Toggle Verbose Logging** (or the equivalent menu item). This sets `core.sync.verboseUntil` to **now + 30 minutes**, shows a dialog explaining that logs will be written under the config directory, then **restarts the app**. After restart, each Mailsync process is spawned with `--verbose` until that timestamp passes.

3. **Manual config**  
   Set `core.sync.verboseUntil` in your config (e.g. in `config.json` in the [config directory](#where-logs-go)) to a future timestamp in milliseconds, e.g. `Date.now() + 30*60*1000` for 30 minutes. Restart the app so the bridge picks it up.

When verbose is enabled, the bridge logs to the console:  
`Verbose mailsync logging is enabled until <date>`.

---

## Where stdout and logs go

### Stdout from the child process

- **In sync mode**, the Electron app **consumes** the Mailsync process’s **stdout** in process. It does **not** write that stream to a file.
- [MailsyncProcess.sync()](../../app/src/mailsync-process.ts) attaches `this._proc.stdout.on('data', ...)`: data is buffered, split on newlines, and each line is emitted as a **`deltas`** event (JSON database change records). So stdout is used for **IPC (deltas)**; any extra debug output from the C++ binary that is not valid JSON can trigger parse warnings (see the “Skipping debug output from mailsync” / “Failed to parse mailsync output as JSON” paths in the same file).
- **stderr** is also consumed in process (e.g. in `_spawnAndWait` and in `sync()`); it is buffered and can end up in error messages or the `close` event’s `error` when the process exits.

### Persistent log files (C++ process)

The **C++ Mailsync binary** receives **`CONFIG_DIR_PATH`** in its environment (set in [mailsync-process.ts](../../app/src/mailsync-process.ts) in `_spawnProcess`) and writes its own log files under that directory. The bridge refers to these when asking users to submit logs:

- **Path:** `<configDirPath>/mailsync-<accountId>.log`
- **Example:** On macOS, config is often under `~/Library/Application Support/Mailspring/` (or `Mailspring-dev/` when running with `--dev`). So logs are e.g. `~/Library/Application Support/Mailspring/mailsync-<accountId>.log`.

To **tail** the log for an account, the bridge implements `tailClientLog(accountId)`, which reads the last 3000 bytes of `mailsync-<accountId>.log` (see [mailsync-bridge.ts](../../app/src/flux/mailsync-bridge.ts) around `tailClientLog`). You can do the same from a terminal:

```bash
tail -f "$HOME/Library/Application Support/Mailspring/mailsync-<accountId>.log"
# Or for dev data:
tail -f "$HOME/Library/Application Support/Mailspring-dev/mailsync-<accountId>.log"
```

Replace `<accountId>` with the account’s id (e.g. from the app or from the filename of an existing log).

---

## Running in Dev Mode with the Inspector open

- **Dev Mode** is the normal development run: Electron is started with **`--enable-logging`** and **`--dev`** (see [package.json](../../package.json) script `start`).

  **Command:**

  ```bash
  npm start
  ```

  This runs `electron ./app --enable-logging --dev`. Data is stored in the **Mailspring-dev** config/data directory (e.g. `Mailspring-dev` under Application Support).

- **Opening the Inspector (Chrome DevTools)**  
  There is no separate npm script that auto-opens the Inspector. After the app is running:

  - Use **Menu → Developer → Toggle Developer Tools** (or the equivalent on your OS).
  - On uncaught errors in dev mode, the app may open DevTools and focus the console (see [app-env.ts](../../app/src/app-env.ts)).

So: run **`npm start`**, then open the Inspector from the **Developer** menu (or let it open on error). Use the Console to inspect bridge-related logs (e.g. “Sending to mailsync …”, “Sync worker sent non-JSON …”, “Verbose mailsync logging is enabled until …”).

---

## Attaching a debugger to the C++ process (macOS)

[MailsyncProcess](../../app/src/mailsync-process.ts) has an **`attachToXcode()`** method that uses AppleScript to attach Xcode’s debugger to the running Mailsync process by PID. This is intended for debugging the C++ binary on macOS. After the sync process is running, call this (e.g. from the main window’s DevTools console) so that Xcode attaches to the child process:

```js
// In DevTools console (main window), get a client and attach Xcode to it:
$m.MailsyncBridge?.clients?.()?.[0]?.attachToXcode?.()
```

(Exact API may depend on what is exposed on `$m`; the bridge holds `MailsyncProcess` instances that have `attachToXcode()`.)

---

## Related documentation

- [Data flow (Electron ↔ C++)](../architecture/data-flow.md) – how stdin/stdout are used for tasks and deltas.
- [Mailsync bridge](../../app/src/flux/mailsync-bridge.ts) – where verbose config is read and clients are created.
- [Mailsync process spawn](../../app/src/mailsync-process.ts) – env, args, and stdout/stderr handling.
