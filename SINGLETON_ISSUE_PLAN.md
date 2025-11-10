# Mailspring Singleton Pattern Issue on Ubuntu - Investigation and Mitigation Plan

## Issue Summary

On Ubuntu production builds, the singleton pattern of Mailspring occasionally fails, allowing a second instance to open when the application icon is clicked while Mailspring is already running. This does not occur on Mac builds and is difficult to reproduce with proper logging.

## Root Cause Analysis

### Current Singleton Implementation

The singleton pattern is implemented in `/app/src/browser/main.js` (lines 290-311):

```javascript
if (!options.devMode) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log('Exiting because another instance of the app is already running.');
    app.exit(1);
    return;
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const otherOpts = parseCommandLine(commandLine);
    global.application.handleLaunchOptions(otherOpts);
  });
}
```

### Electron's `requestSingleInstanceLock()` Mechanism

Electron's `requestSingleInstanceLock()` creates a lock file/socket to ensure only one instance runs. On Linux, this typically uses:
- A lock file in the user data directory
- Inter-process communication via Unix domain sockets
- File system locks that may be affected by various factors

### Potential Failure Scenarios on Linux (apt/deb Package)

1. **Background Mode NEVER Creates Window** ⚠️⚠️⚠️ CRITICAL - ROOT CAUSE IDENTIFIED
   - User has "Launch on system start" enabled in Mailspring preferences
   - Autostart desktop file: `~/.config/autostart/Mailspring.desktop`
   - Autostart launches with `--background` flag: `Exec=mailspring --background %U`
   - **THE BUG:** When `initializeInBackground` is true, `openWindowsForTokenState()` is called BUT:
     - In `window-manager.ts`, `ensureWindow()` creates window with `initializeInBackground: true`
     - This sets the window as `hidden: true` in the main window options
     - When `ensureWindow()` checks `if (win.loadSettings().hidden)` it returns early!
     - **NO WINDOW IS EVER CREATED OR SHOWN** when starting in background mode
   - User clicks icon → second instance launches → singleton lock works → `second-instance` event fires
   - **BUT** first instance calls `ensureWindow()` which checks `hidden` flag and does nothing!
   - Result: Second instance stays running because first instance can't show a window

2. **Broken `ensureWindow()` Logic for Background Mode** ⚠️⚠️⚠️ CRITICAL
   - Code in `/app/src/browser/window-manager.ts` lines 157-177:
   ```typescript
   ensureWindow(windowKey, extraOpts = {}) {
     const win = this._windows[windowKey];
     
     if (!win) {
       this.newWindow(this._coreWindowOpts(windowKey, extraOpts));
       return;
     }
     
     if (win.loadSettings().hidden) {  // <-- THIS IS THE BUG!
       return;  // Returns without showing window when background mode
     }
     // ... rest of logic to show/focus window
   }
   ```
   - When background instance starts, window is created with `hidden: true`
   - When second instance triggers, `ensureWindow()` is called
   - But it exits early due to `hidden` flag, never showing the window
   - Second instance doesn't exit because first instance didn't handle it properly

3. **Desktop File Launch Context** ⚠️ HIGH PRIORITY
   - The `.desktop` file (`Mailspring.desktop`) launches via `Exec=mailspring %U`
   - Autostart file has different exec: `Exec=mailspring --background %U`
   - DBus activation is not configured (no `DBusActivatable=true`)
   - Different desktop environments (GNOME, KDE, XFCE) handle autostart timing differently

4. **File System Race Conditions**
   - **Config directory:** `~/.config/Mailspring` (or `$XDG_CONFIG_HOME/Mailspring`)
   - Lock file path: `~/.config/Mailspring/SingletonLock` (Electron's default)
   - Lock file could be stale if process crashes without cleanup
   - Local filesystem should be reliable, unlike NFS (good news for apt package)

5. **Process Communication Failures**
   - Unix socket may not be available or accessible during app startup
   - Socket file: typically in `/tmp` with restricted permissions
   - Permissions issues on `~/.config/Mailspring` directory
   - Electron version-specific bugs with `requestSingleInstanceLock()`
   - Socket might not be ready before `app.on('ready')` fires
   - Background instance socket may not be fully initialized

6. **System Tray Might Mask the Problem** 
   - System tray icon might be visible, making user think app is "running"
   - But when they click the app icon (not tray icon), second instance launches
   - This creates confusion: tray says it's running, but clicking launcher opens new window

## Root Cause Confirmed!

After analyzing the code, the issue is **NOT a race condition**. It's a **logic bug in `ensureWindow()`**:

1. Background mode sets `initializeInBackground: true`
2. This causes the main window to be created with `hidden: true` 
3. When second instance fires `second-instance` event, it calls `ensureWindow()`
4. `ensureWindow()` checks `if (win.loadSettings().hidden)` and **returns early without showing the window**
5. Second instance doesn't get handled properly and stays running

**The Fix:** Modify `ensureWindow()` to ignore the `hidden` flag when called from `second-instance` handler, OR always show the window when explicitly requested.

## Investigation Plan

### Phase 1: Add Comprehensive Logging (Optional - for confirmation)

**Goal:** Confirm the root cause with logging.

**Files to Modify:**
- `/app/src/browser/main.js`

**Changes:**
1. Add detailed logging around `requestSingleInstanceLock()`
2. **Log startup mode:** `--background` flag detection
3. Log environment variables:
   - `XDG_CONFIG_HOME` (defaults to `~/.config`)
   - `XDG_SESSION_TYPE` (X11 vs Wayland)
   - `DESKTOP_SESSION` (gnome, kde, xfce, etc.)
   - `XDG_CURRENT_DESKTOP`
   - `HOME`
4. Log user data path and lock file location (should be `~/.config/Mailspring`)
5. Add timestamps and process IDs to all logs
6. **Log when `second-instance` event fires with:**
   - Full command line args
   - Whether first instance has `--background` flag
   - Whether main window exists and is visible
   - Time elapsed since first instance started
7. Log application startup timing:
   - Process start time
   - Lock acquisition time
   - `app.on('ready')` time
   - Window creation time
   - Window shown time (if not background)
8. Persist logs to a dedicated file for singleton events: `~/.config/Mailspring/logs/singleton-debug.log`

### Phase 2: Implement Fallback Detection

**Goal:** Detect when multiple instances are running and handle gracefully.

**Implementation:**
1. Create a custom lock file with PID and timestamp
2. Check for stale locks on startup
3. Verify the lock periodically after startup
4. Send a heartbeat signal that second instances can check

### Phase 3: Desktop Integration Improvements

**Goal:** Leverage Linux desktop environment capabilities for better singleton handling.

**Changes to Desktop File:**
- Add `DBusActivatable=true` if we can implement DBus activation
- Add `SingleMainWindow=true` hint
- Test different `StartupNotify` configurations

### Phase 4: Window Focus Improvements

**Goal:** Ensure existing window is properly focused when second instance is launched.

**Files to Modify:**
- `/app/src/browser/application.ts` - `handleLaunchOptions()`
- `/app/src/browser/window-manager.ts` - `ensureWindow()`

**Changes:**
1. When `second-instance` event fires, ensure main window is:
   - Unminimized if minimized
   - Brought to front (raised)
   - Focused
   - Shown if hidden
2. Add Linux-specific window focus code
3. Use X11/Wayland window management APIs if needed

## Implementation Roadmap

### Milestone 1: Enhanced Logging (Week 1)

#### Task 1.1: Add Singleton Debug Logging
- Create a dedicated log file: `singleton-debug.log`
- Log all environment variables relevant to app launching
- Log the result of `requestSingleInstanceLock()`
- Log when `second-instance` event is triggered
- Include timestamps, PID, and lock file paths

#### Task 1.2: Add Window Focus Logging
- Log all window focus/show/hide operations
- Track when windows are minimized/restored
- Log system tray interactions on Linux

#### Task 1.3: Create Diagnostic Tool
- Add a command-line flag: `--diagnose-singleton`
- Show current lock status
- Display all running Mailspring processes
- Check lock file validity
- Show if autostart is enabled
- Display last startup mode (background vs foreground)

#### Task 1.2: Add Window Focus Logging
- Log all window focus/show/hide operations
- Track when windows are minimized/restored
- Log system tray interactions on Linux
- **Log background mode behavior:**
  - When window is created vs shown
  - Delays in window visibility for background starts
  - State of window when `second-instance` event fires

**Deliverable:** Enhanced logging system that captures all singleton-related events, especially autostart scenarios

### Milestone 2: Robust Lock Mechanism (Week 2)

#### Task 2.1: Implement Custom Lock File
```javascript
// Pseudocode for custom lock implementation
const lockFilePath = path.join(configDirPath, '.singleton.lock');

function acquireLock() {
  // Write PID, timestamp, and startup mode (background/foreground) to lock file
  // Use exclusive file locks (flock)
  // Verify lock periodically
  // Mark when window is ready/shown
}

function checkExistingInstance() {
  // Read lock file
  // Check if PID is still running
  // Check if process is still initializing (< 5 seconds old)
  // Wait for background instance to finish initializing
  // Clean up stale locks
}

function releaseLock() {
  // Remove lock file
  // Clean up resources
}
```

#### Task 2.2: Add Lock Validation with Startup Awareness
- Check if lock file PID matches a running process
- Implement stale lock cleanup (> 30 seconds old, no process)
- **Add initialization grace period:**
  - If lock exists but process is < 5 seconds old, wait and retry
  - Give background instances time to fully initialize
  - Poll for window readiness before declaring failure
- Add atomic lock operations

#### Task 2.3: Platform-Specific Enhancements for apt/deb
- Verify lock path is always `~/.config/Mailspring` (respect `XDG_CONFIG_HOME`)
- Ensure proper permissions (0600) on lock file
- Add retry logic with exponential backoff (max 3 attempts over 1 second)
- Handle rapid successive launches (debounce within 500ms)

**Deliverable:** Bulletproof lock mechanism that works with standard apt/deb installation

### Milestone 3: Fix the `ensureWindow()` Bug (Week 1-2) ⭐ THIS IS THE FIX

#### Task 3.1: Fix `ensureWindow()` to Handle Background Mode

**File:** `/app/src/browser/window-manager.ts`

**Current buggy code (lines 157-177):**
```typescript
ensureWindow(windowKey, extraOpts = {}) {
  const win = this._windows[windowKey];

  if (!win) {
    this.newWindow(this._coreWindowOpts(windowKey, extraOpts));
    return;
  }

  if (win.loadSettings().hidden) {  // <-- BUG: Returns early for background mode!
    return;
  }

  if (win.isMinimized()) {
    win.restore();
    win.focus();
  } else if (!win.isVisible()) {
    win.showWhenLoaded();
  } else {
    win.focus();
  }
}
```

**FIXED code:**
```typescript
ensureWindow(windowKey, extraOpts = {}) {
  const win = this._windows[windowKey];

  if (!win) {
    this.newWindow(this._coreWindowOpts(windowKey, extraOpts));
    return;
  }

  // REMOVED: if (win.loadSettings().hidden) return;
  // The hidden flag is for windows that should NEVER be shown (like certain background windows).
  // For the main window started in background mode, we WANT to show it when requested.
  
  // If explicitly told to keep hidden via extraOpts, respect that
  if (extraOpts.hidden === true) {
    return;
  }

  if (win.isMinimized()) {
    win.restore();
    win.focus();
  } else if (!win.isVisible()) {
    win.showWhenLoaded();
  } else {
    win.focus();
  }
}
```

**Alternative approach - Add a new method:**
```typescript
ensureMainWindowVisible() {
  const main = this.get(WindowManager.MAIN_WINDOW);
  if (!main) {
    // Window doesn't exist, create it now
    this.newWindow(this._coreWindowOpts(WindowManager.MAIN_WINDOW));
    return;
  }

  // FORCE show the window, ignoring hidden flag
  if (main.isMinimized()) {
    main.restore();
  }
  
  if (!main.isVisible()) {
    main.show();
  }
  
  main.focus();
}
```

#### Task 3.2: Update `second-instance` Handler to Use Fixed Logic

**File:** `/app/src/browser/main.js`

**Current code (lines 308-311):**
```javascript
app.on('second-instance', (event, commandLine, workingDirectory) => {
  const otherOpts = parseCommandLine(commandLine);
  global.application.handleLaunchOptions(otherOpts);
});
```

**FIXED code:**
```javascript
app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('[SINGLETON] Second instance detected');
  
  // Parse options
  const otherOpts = parseCommandLine(commandLine);
  
  // ALWAYS ensure main window is visible when second instance is launched
  // This handles the background start case where window was never shown
  if (global.application && global.application.windowManager) {
    // Use the new method that ignores hidden flag
    global.application.windowManager.ensureMainWindowVisible();
  }
  
  // Then handle any launch options (mailto, file attachments, etc.)
  if (global.application) {
    global.application.handleLaunchOptions(otherOpts);
  }
});
```

#### Task 3.3: (Optional) Consider Removing Background Mode Window Creation

**Question to consider:** Should background mode create the window at all?

**Option A (Current):** Keep creating hidden window in background mode
- Pro: Window exists and can be shown quickly
- Con: The `hidden` flag causes bugs

**Option B (Recommended):** Don't create window in background mode, create on-demand
- Modify `openWindowsForTokenState()` to check `initializeInBackground`
- If true, don't call `ensureWindow()` at all
- Window gets created when user clicks icon or system tray
- Cleaner separation between "running" and "window visible"

**File:** `/app/src/browser/application.ts`

```typescript
openWindowsForTokenState() {
  // user may trigger this using the application menu / by focusing the app
  // before migration has completed and the config has been loaded.
  if (!this.config || !this.windowManager) return;

  const accounts = this.config.get('accounts');
  const hasAccount = accounts && accounts.length > 0;

  // NEW: Don't create window if we started in background mode
  // Window will be created when second instance launches or user clicks tray
  if (this.windowManager.initializeInBackground) {
    console.log('[SINGLETON] Skipping window creation due to background mode');
    return;
  }

  if (hasAccount) {
    this.windowManager.ensureWindow(WindowManager.MAIN_WINDOW);
  } else {
    this.windowManager.ensureWindow(WindowManager.ONBOARDING_WINDOW, {
      title: localized('Welcome to Mailspring'),
    });
  }
}
```

**Deliverable:** Simple, clean fix that eliminates the root cause entirely

### Milestone 4: Desktop File Enhancements (Week 4)

#### Task 4.1: Update Desktop File Template

**File:** `/app/build/resources/linux/Mailspring.desktop.in`

```ini
[Desktop Entry]
Name=<%= productName %>
Comment=<%= description %>
GenericName=Mail Client
Exec=mailspring %U
Icon=mailspring
Type=Application
StartupNotify=true
StartupWMClass=<%= productName %>
Categories=GNOME;GTK;Network;Email;
Keywords=email;internet;
MimeType=x-scheme-handler/mailto;x-scheme-handler/mailspring;
Actions=NewMessage

# Single instance hints for desktop environment
SingleMainWindow=true
X-GNOME-SingleWindow=true

[Desktop Action NewMessage]
Name=New Message
Exec=mailspring mailto:
```

#### Task 4.2: Test Across Desktop Environments
- GNOME/Ubuntu
- KDE Plasma
- XFCE
- MATE
- Cinnamon

**Deliverable:** Optimized desktop integration

### Milestone 5: Testing and Validation (Week 5)

#### Test Scenarios

1. **Autostart + Manual Launch Test** ⭐⭐⭐ CRITICAL - PRIMARY TEST CASE
   - Enable "Launch on system start" in Mailspring preferences
   - Log out of system
   - Log back in (Mailspring should auto-start in background)
   - Wait 2-3 seconds
   - Click Mailspring icon from application menu
   - **Expected:** Window appears, no second instance
   - **Current Bug:** Second instance opens
   - Verify logs show `--background` flag on first instance
   - Check if `second-instance` event fired

2. **Autostart + Immediate Manual Launch Test** ⭐⭐⭐ CRITICAL
   - Enable autostart
   - Log out and back in
   - Immediately click Mailspring icon (< 1 second after login)
   - Verify only one instance starts
   - Check if race condition occurs during initialization

3. **Basic Singleton Test** ⭐ CRITICAL
   - Start Mailspring normally (no autostart)
   - Click app icon again
   - Verify window focuses, no second instance

4. **Crash Recovery Test** ⭐ CRITICAL
   - Start Mailspring with autostart
   - Kill process with `kill -9`
   - Click icon to restart immediately
   - Verify no stale lock issues
   - Check `SingletonLock` file is cleaned up

5. **Background Mode Window Creation Test** ⭐⭐ CRITICAL
   - Start Mailspring with: `mailspring --background`
   - Wait for it to fully initialize (check process list)
   - Verify no window is visible
   - Run: `mailspring` (without --background flag)
   - Verify window appears, no second instance
   - Check logs for `second-instance` event

6. **Hidden Window Test** ⭐ CRITICAL
   - Start Mailspring with system tray enabled
   - Hide/close window to tray
   - Click app icon
   - Verify window restores and focuses (not a new instance)

5. **Concurrent Launch Test** ⭐ CRITICAL
   - Launch multiple instances simultaneously
   - Verify only one succeeds

5. **Concurrent Launch Test** ⭐ CRITICAL
   - Open 2-3 terminal windows
   - Run `mailspring &` in all terminals simultaneously
   - Verify only one instance succeeds
   - Check logs show other attempts correctly detected existing instance

6. **Hidden Window Test** ⭐ CRITICAL
   - Start Mailspring with system tray enabled
   - Hide/close window to tray
   - Click app icon
   - Verify window restores and focuses (not a new instance)

7. **Autostart Disabled Test**
   - Disable "Launch on system start"
   - Verify `~/.config/autostart/Mailspring.desktop` is removed
   - Log out and back in
   - Verify Mailspring doesn't auto-start
   - Manually launch and verify it works normally

8. **Minimized Window Test**
   - Start Mailspring
   - Minimize window (not hide to tray)
   - Click app icon
   - Verify window restores and focuses

9. **Different Workspace Test** (for multi-workspace setups)
   - Start Mailspring on workspace 1
   - Switch to workspace 2
   - Click app icon
   - Verify switches back to workspace 1 and focuses window

10. **Autostart + Mailto Test**
    - Enable autostart
    - Log out and back in (background instance starts)
    - Click a mailto: link in browser
    - Verify composer opens in existing (background) instance
    - Verify window becomes visible

11. **Mailto Link Test**
    - Start Mailspring normally
    - Click mailto: link in browser
    - Verify composer opens in existing instance
    - Verify no second instance starts

12. **File Attachment Test**
    - Start Mailspring
    - Right-click file → "Send to" → Mailspring
    - Verify attachment opens in existing instance
    - Verify no second instance starts

13. **Desktop Environment Tests**
    - Test on Ubuntu/GNOME (primary target)
    - Test on KDE Plasma (secondary)
    - Test on XFCE (if available)
    - Verify autostart behavior is consistent across all

14. **APT Package Specific Test**
    - Verify correct installation path: `/usr/share/mailspring/`
    - Verify binary location: `/usr/bin/mailspring`
    - Verify desktop file: `/usr/share/applications/Mailspring.desktop`
    - Verify autostart file: `~/.config/autostart/Mailspring.desktop`
    - Check that autostart file contains: `Exec=mailspring --background %U`
    - Check symlink integrity

**Deliverable:** Comprehensive test suite and validation report for apt/deb package, focusing on autostart scenarios

## Monitoring and Metrics

### Key Metrics to Track

1. **Lock Acquisition Success Rate**
   - Log every `requestSingleInstanceLock()` call
   - Track successes vs failures

2. **Second Instance Events**
   - Count how often `second-instance` fires
   - Log what triggered it (commandLine args)

3. **Window Focus Success**
   - Track if window successfully gains focus
   - Measure time to focus

4. **Stale Lock Detection**
   - Count cleaned up stale locks
   - Track lock age when cleaned

### Telemetry (Optional)

If user consents, collect anonymized data:
- Linux distribution and version (via `/etc/os-release`)
- Desktop environment (`$XDG_CURRENT_DESKTOP`, `$DESKTOP_SESSION`)
- Display server type (`$XDG_SESSION_TYPE`: X11 vs Wayland)
- Package type: apt/deb (native install to `/usr/share/mailspring/`)
- Singleton lock success/failure rate
- Time from launch to lock acquisition
- Second-instance event frequency

## Rollback Plan

If changes cause issues:

1. Feature flag: `core.singleton.useCustomLock`
   - Default to false for stable releases
   - Enable for beta testers
   - Enable via command line for debugging

2. Fallback to Electron's default behavior
   - Keep logging even in fallback mode
   - Gather data for future improvements

## Documentation

### User-Facing Documentation

1. **Troubleshooting Guide**
   - "Mailspring opens multiple windows"
   - How to check for multiple instances
   - How to cleanly restart

2. **Log Collection Guide**
   - Where to find `singleton-debug.log`
   - What information to provide for bug reports

### Developer Documentation

1. **Architecture Document**
   - How singleton pattern works
   - Custom lock file format
   - Platform-specific considerations

2. **Testing Guide**
   - How to test singleton behavior
   - Manual test procedures
   - Automated test setup

## Success Criteria

1. **Zero false positives** - Never allow multiple instances in production
2. **100% window focus** - Existing window always comes to front
3. **< 500ms response time** - Second instance triggers focus quickly
4. **Clean recovery** - Stale locks cleaned up automatically
5. **User confidence** - Reproducible, predictable behavior

## Timeline

- **Week 1:** Enhanced logging implementation
- **Week 2:** Custom lock mechanism
- **Week 3:** Window management improvements  
- **Week 4:** Desktop integration
- **Week 5:** Testing and validation
- **Week 6:** Beta release and monitoring
- **Week 7-8:** Gather feedback, iterate
- **Week 9:** Stable release

## Resources Required

- 1 developer (full-time)
- 2-3 beta testers with Ubuntu
- Test VMs for different Linux distributions
- Monitoring/logging infrastructure

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Custom lock causes deadlock | Low | High | Thorough testing, timeout mechanisms |
| Electron API changes | Medium | Medium | Pin Electron version, test upgrades |
| Desktop environment incompatibility | Medium | Low | Test across environments, graceful fallback |
| Performance impact | Low | Low | Benchmark lock operations |
| User data corruption | Very Low | Very High | Lock file in separate location, no config changes |

## Next Steps - SIMPLE FIX!

1. **Immediate (Today/This Week)** - Implement the Fix ⭐
   - Create branch: `fix/background-mode-singleton`
   - **Fix Option 1 (Recommended - Simplest):**
     - Modify `ensureWindow()` in `window-manager.ts` to remove or modify the `hidden` check
     - Test that background mode + second instance works
   - **Fix Option 2 (Alternative):**
     - Add `ensureMainWindowVisible()` method that ignores `hidden` flag
     - Update `second-instance` handler to use new method
   - **Fix Option 3 (Most Thorough):**
     - Prevent window creation in background mode entirely
     - Create window on-demand when second instance launches or tray is clicked
   - **Testing:**
     - Enable autostart
     - Log out and log in
     - Click Mailspring icon
     - Verify single instance with visible window

2. **Short Term (Next Few Days)** - Testing & Validation
   - Test all scenarios from Milestone 5
   - Particularly focus on:
     - Autostart + manual launch (primary bug scenario)
     - System tray + autostart
     - mailto: links with background instance
   - Ensure no regressions for non-background starts
   - Test on different desktop environments if possible

3. **Medium Term (Next Week)** - Polish & Documentation
   - Add comments explaining the fix
   - Consider adding defensive logging
   - Update any documentation about background mode
   - Consider if system tray behavior needs adjustment
   - Beta test with other users if possible

4. **Long Term (Next Quarter)** - Hardening
   - Monitor metrics in production
   - Gather feedback from other apt users
   - Consider DBus activation for better desktop integration
   - Implement additional safety checks

## Confirmation Test - Can You Reproduce?

**Quick test to confirm this is the bug:**

```bash
# Terminal 1: Start background instance
mailspring --background &

# Wait for it to start (2-3 seconds)
# Check it's running: ps aux | grep mailspring

# Terminal 2: Try to start another instance  
mailspring

# EXPECTED BUG: A second window/instance opens instead of showing the first one
# AFTER FIX: First instance window should appear, second process should exit
```

**Questions:**
1. Does this reproduce the bug you see after login?
2. When you run the test above, do you get two Mailspring processes?
3. Is system tray enabled? Do you see a tray icon before clicking the launcher?

## Implementation Code

Here's the actual code change needed:

**File: `/Users/janosch/git/Mailspring/app/src/browser/window-manager.ts`**

Replace lines 157-177 with:

```typescript
ensureWindow(windowKey, extraOpts = {}) {
  const win = this._windows[windowKey];

  if (!win) {
    this.newWindow(this._coreWindowOpts(windowKey, extraOpts));
    return;
  }

  // FIXED: Don't return early for hidden windows when showing main window
  // The hidden flag is meant for windows that should never be shown (onboarding, etc.)
  // but the main window started in background mode should be shown when requested
  const settings = win.loadSettings();
  if (settings.hidden && !settings.mainWindow) {
    // Only skip non-main windows that are marked hidden
    return;
  }

  if (win.isMinimized()) {
    win.restore();
    win.focus();
  } else if (!win.isVisible()) {
    win.showWhenLoaded();
  } else {
    win.focus();
  }
}
```

## Conclusion

This plan provides a systematic approach to investigating and resolving the singleton pattern issue on Ubuntu. By implementing enhanced logging first, we can gather real-world data to validate our hypotheses. The phased approach allows us to make incremental improvements while maintaining stability for existing users.

The key is to make the singleton pattern more robust while also improving the user experience when launching the application - whether it's a new instance or bringing an existing window to focus.
