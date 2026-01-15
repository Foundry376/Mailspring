# Issue Report: Linux/Wayland Display Issues in 1.17.0

## Summary

On Ubuntu 24.04 (and likely other Wayland-based Linux systems), Mailspring 1.17.0 fails to display the main interface properly. The app starts but shows a blank/empty window when the inbox should load. Users must force X11 mode as a workaround, which then causes 100% CPU usage.

## Severity

**High** - App is unusable on affected systems without workaround, and workaround has significant side effects.

## Affected Platforms

- Ubuntu 24.04 LTS (confirmed)
- Likely other Linux distributions using Wayland by default
- Snap and .deb installations both affected

## Affected Version

- Mailspring 1.17.0-5e478521
- Regression (auto-update from previous version broke it)

## Discourse Reference

- Topic 14077: "The latest auto-updating snap has broken Mailspring on my Ubuntu laptop"

## Symptoms

### Primary Issue
1. App launches and shows the greeting/setup screen (on fresh install)
2. Account can be added successfully
3. When the Inbox should load, the window shows nothing/blank
4. No error messages in the UI

### Console Output
```
$ mailspring
Running database migrations
App load time: 211ms
{"error":null}
Manual update check (updates.getmailspring.com/check/linux/x64/1.17.0-5e478521/9f2b7ac6-cf6c-4cbc-bad5-ccce3c8ef6bd/stable) returned 204
(node:24411) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `mailspring --trace-deprecation ...` to show where the warning was created)
```

The app appears to start successfully (no errors), but the rendering fails.

### Workaround Side Effect
When using `--ozone-platform=x11` workaround, a "main" process consumes 100% CPU continuously.

## User Reports

### Report 1 (codepops - Ubuntu 24.04)
> "I have been using Mailspring for a few months on Ubuntu. This morning when I tried to open Mailspring it failed to open. I checked the latest revision on snap and it seems to have auto updated last night. I have since uninstalled the snap (wish I used the revert function before uninstalling) and tried to install with .deb package from the website. Same failure. It literally just doesn't load. After un-installation, when I install again, I get the greeting screen and I can add my account. But the moment the 'Inbox' has to load, there is just nothing on screen."

**Environment:**
- Ubuntu 24.04.3 LTS
- Both Snap and .deb installations affected
- Mailspring 1.17.0-5e478521

### Report 2 (Dahaniel)
> "Same issue, gemini helped me to workaround it by using: `mailspring --ozone-platform=x11` to force x11. But now I keep having a 'main' process that takes up 100% CPU"

## Root Cause Analysis

This is likely related to Electron's Wayland support. Possible causes:

1. **Electron 39 Wayland changes**: The upgrade to Electron 39 may have changed default Wayland behavior or introduced Wayland-related bugs.

2. **Ozone platform detection**: Electron's automatic platform detection may be choosing Wayland incorrectly or the Wayland backend has rendering issues.

3. **GPU/compositor interaction**: Wayland compositors handle rendering differently, and there may be issues with GPU acceleration or buffer handling.

4. **Missing Wayland dependencies**: The snap/deb packages may be missing Wayland-specific libraries.

## Workaround

Force X11 mode by launching with:

```bash
mailspring --ozone-platform=x11
```

For permanent fix, users can:
1. Create/modify the `.desktop` file to include the flag
2. Create an alias in their shell profile

**Note**: This workaround causes 100% CPU usage which needs separate investigation.

## Recommended Investigation

### 1. Check Electron Wayland configuration
Look for Electron/Chromium flags related to Wayland in:
- `app/src/browser/application.ts` or main process initialization
- `package.json` for Electron configuration
- Any command-line flag handling

### 2. Check Electron 39 migration
Review what changed in the Electron 33 -> 39 upgrade regarding:
- Ozone platform defaults
- Wayland support
- GPU process handling

### 3. Investigate 100% CPU issue
When `--ozone-platform=x11` is used:
- Profile which process is consuming CPU
- Check if it's related to rendering loops or event handling
- May be XWayland compatibility layer overhead

**Research from VSCode/Electron community suggests these potential causes and fixes:**

#### Cause A: Transparent BrowserWindows
According to [Electron issue #11908](https://github.com/electron/electron/issues/11908), transparent BrowserWindows cause high CPU usage on Linux. One user confirmed: "It is definitely related to browser window Transparency. With transparency off, it idles down to 0% cpu, otherwise it is always 8-15%."

**Fix**: Check if any BrowserWindows in Mailspring have `transparent: true` and consider disabling it on Linux/X11:
```javascript
new BrowserWindow({
  transparent: process.platform !== 'linux', // Disable on Linux
  // ...
});
```

#### Cause B: GPU Acceleration Issues
Per [Arch Linux forums](https://bbs.archlinux.org/viewtopic.php?id=281207), GPU acceleration can cause CPU spikes on Linux, especially with NVIDIA drivers or when running under XWayland.

**Fix**: Try disabling hardware acceleration when running in X11/XWayland mode:
```javascript
// In main process, before app.ready
if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
  // Or use command line switch:
  app.commandLine.appendSwitch('disable-gpu');
}
```

#### Cause C: XWayland Performance Regression (Kernel 6.10+)
Per [Arch Linux forums](https://bbs.archlinux.org/viewtopic.php?id=298188), there's a known XWayland performance regression in kernel 6.10+ where X11 apps under Wayland cause XWayland to spike to 100% CPU on mouse-over events. This is a system-level issue, not an app issue.

**User workaround**: Update XWayland or use native Wayland mode if possible.

#### Recommended Approach for Mailspring
Instead of forcing `--ozone-platform=x11`, try enabling native Wayland with proper flags:
```bash
mailspring --enable-features=UseOzonePlatform,WaylandWindowDecorations --ozone-platform-hint=auto
```

Or set these flags programmatically in the app:
```javascript
// Before app.ready
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}
```

**Note**: As of Electron 38, the `ELECTRON_OZONE_PLATFORM_HINT` environment variable no longer works - flags must be passed via command line.

### 4. Test on various Wayland compositors
- GNOME (Mutter)
- KDE Plasma (KWin)
- Sway
- Weston

## Potentially Affected Code Areas

1. **Main process initialization**
   - `app/src/browser/application.ts`
   - `app/src/browser/main.ts`

2. **Electron configuration**
   - `package.json` electron settings
   - Any `app.commandLine.appendSwitch()` calls

3. **Window creation**
   - `app/src/browser/application.ts` - window management
   - BrowserWindow configuration options

4. **Build configuration**
   - `electron-builder` configuration
   - Snap/deb packaging scripts

## Environment Details

```
OS: Ubuntu 24.04.3 LTS
Codename: noble
Display Server: Wayland (default on Ubuntu 24.04)
Mailspring: 1.17.0-5e478521
```

## Related Issues

- RPM package dependency issue (see `003-rpm-libtidy-dependency.md`) - users fixing that issue may also encounter this Wayland issue
