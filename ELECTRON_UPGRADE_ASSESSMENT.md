# Electron Upgrade Assessment: v37.2.2 to v39.x

## Current State

- **Current Electron Version**: 37.2.2
- **Latest Stable Electron**: 39.2.7 (as of December 2025)
- **Target Upgrade Path**: 37.2.2 → 38.x → 39.x

## Version Differences

| Component | Electron 37 | Electron 38 | Electron 39 |
|-----------|-------------|-------------|-------------|
| Chromium | M138 | M140 | M142 |
| Node.js | v22.16 | v22.18 | v22.20 |
| V8 | 13.8 | 14.0 | 14.2 |
| Min macOS | 11 (Big Sur) | **12 (Monterey)** | 12 (Monterey) |

## Breaking Changes Analysis

### Electron 38 Breaking Changes

#### 1. **REMOVED: macOS 11 Support** - LOW IMPACT
macOS 11 (Big Sur) is no longer supported by Chromium. Minimum is now macOS 12.

**Impact**: Users on macOS Big Sur will need to upgrade their OS.
**Action Required**: Update documentation and system requirements.

#### 2. **REMOVED: `ELECTRON_OZONE_PLATFORM_HINT` Environment Variable** - NO IMPACT
The codebase does not use this environment variable.

**Grep Result**: No matches found.

#### 3. **REMOVED: `plugin-crashed` Event** - NO IMPACT
The codebase does not use this event.

**Grep Result**: No matches found.

#### 4. **DEPRECATED: `webFrame.routingId` and `webFrame.findFrameByRoutingId()`** - NO IMPACT
The codebase does not use these APIs.

**Grep Result**: No matches found.

### Electron 39 Breaking Changes

#### 1. **BEHAVIOR CHANGE: `window.open` Popups Always Resizable** - LOW IMPACT
Per WHATWG spec, popups via `window.open` are now always resizable.

**Impact**: The codebase uses `window.open` in PDF.js (third-party library), but this is used for opening URLs externally.
**Action Required**: If popup resizability matters, implement `setWindowOpenHandler` with custom `resizable` property.

#### 2. **DEPRECATED: `--host-rules` Command Line Switch** - NO IMPACT
The codebase does not use this flag.

**Grep Result**: No matches found.

#### 3. **BEHAVIOR CHANGE: Shared Texture OSR Paint Event** - NO IMPACT
Only affects offscreen rendering with shared textures, which is not used.

---

## Codebase Audit: Potential Issues

### HIGH Priority Issues

#### 1. **`new-window` Event Deprecated** - REQUIRES MIGRATION

The `new-window` event has been deprecated since Electron 22 in favor of `setWindowOpenHandler`.

**Files Affected**:
- `app/src/browser/mailspring-window.ts:278` - BrowserWindow webContents
- `app/src/components/webview.tsx:132` - Webview component

**Current Code** (`mailspring-window.ts:278`):
```typescript
this.browserWindow.webContents.on('new-window', (event, url, frameName, disposition) => {
  event.preventDefault();
});
```

**Recommended Migration**:
```typescript
this.browserWindow.webContents.setWindowOpenHandler(({ url, frameName, disposition }) => {
  return { action: 'deny' };
});
```

**Note**: For webview tags, the `new-window` event is still available but should be monitored for future deprecation.

#### 2. **`did-get-response-details` Event Removed** - REQUIRES MIGRATION

This event was removed in older Electron versions (Chromium 66+). The code may already be non-functional.

**Files Affected**:
- `app/src/components/webview.tsx:130`

**Current Code**:
```typescript
'did-get-response-details': this._webviewDidGetResponseDetails,
```

The `_webviewDidGetResponseDetails` function checks HTTP response codes for errors.

**Recommended Migration**: Use the `webRequest` module APIs (`onCompleted`, `onErrorOccurred`) or rely on `did-fail-load` for error handling.

### MEDIUM Priority Issues

#### 3. **`@electron/remote` Extensive Usage** - TECHNICAL DEBT

The codebase heavily relies on `@electron/remote` (70+ usages). While still compatible with Electron 39, this module:
- Has performance implications (synchronous IPC)
- Is not actively developed
- Could be deprecated in future Electron versions

**Files with highest usage**:
- `app/src/app-env.ts` (15+ usages)
- `app/src/flux/stores/attachment-store.ts`
- `app/src/window-event-handler.ts`
- Various internal packages

**Long-term Recommendation**: Migrate to `contextBridge` and explicit IPC calls.

#### 4. **Security Configuration** - ADVISORY

Current `webPreferences` use legacy security settings:
```typescript
// app/src/browser/mailspring-window.ts:99-103
webPreferences: {
  nodeIntegration: true,
  contextIsolation: false,
  webviewTag: true,
  enableRemoteModule: true,
}
```

While not breaking in Electron 39, these settings are discouraged by Electron security guidelines. Future versions may change defaults or deprecate these options.

### LOW Priority Issues

#### 5. **React 16 with `componentWillReceiveProps`** - ADVISORY

`app/src/components/webview.tsx:109` uses the deprecated `componentWillReceiveProps` lifecycle method. This is a React issue, not Electron, but worth noting for maintenance.

---

## Native Module Compatibility

### better-sqlite3

**Current Version**: 11.7.0
**Status**: Compatible with Node 22 and Electron 39

**Requirements**:
- Must be rebuilt for the target Electron version using `electron-rebuild`
- The existing build process should handle this via the postinstall script

### macos-notification-state (Optional)

**Status**: Should be verified during upgrade testing.

---

## Migration Checklist

### Required Before Upgrade

- [ ] **Update `new-window` handler** in `mailspring-window.ts` to use `setWindowOpenHandler`
- [ ] **Remove or replace `did-get-response-details`** handler in `webview.tsx`
- [ ] **Update minimum macOS version** in documentation (12 Monterey+)
- [ ] **Test native module rebuilding** with `electron-rebuild`

### Recommended (Can Be Done Post-Upgrade)

- [ ] Review webview `new-window` event usage
- [ ] Consider migrating from `@electron/remote` to explicit IPC (long-term)
- [ ] Update security settings to use `contextIsolation: true` (major refactor)

### Testing Requirements

- [ ] Test on macOS 12+ (Monterey and later)
- [ ] Test on Linux with Wayland (native mode now default)
- [ ] Test on Linux with X11 (verify `--ozone-platform=x11` fallback)
- [ ] Verify PDF preview functionality
- [ ] Verify all window opening/closing scenarios
- [ ] Test native module functionality (SQLite operations)

---

## Estimated Effort

| Task | Complexity | Effort |
|------|------------|--------|
| Upgrade Electron package | Low | Minimal |
| Fix `new-window` handler | Low | 1-2 hours |
| Fix `did-get-response-details` | Medium | 2-4 hours |
| Native module rebuild testing | Low | 1-2 hours |
| Cross-platform testing | Medium | 4-8 hours |
| **Total** | | **8-16 hours** |

---

## Comparison to Previous Upgrade (33 → 37)

The previous upgrade from Electron 33.3.0 to 37.2.2 was straightforward, requiring only package.json updates with no code changes (4 files modified, all package/lock files).

The upgrade from 37 to 39 should be similarly straightforward, with the caveat that:
1. The `new-window` deprecation should be addressed
2. The `did-get-response-details` removal needs to be handled
3. macOS 11 users will be dropped

---

## Sources

- [Electron Breaking Changes Documentation](https://www.electronjs.org/docs/latest/breaking-changes)
- [Electron 38.0.0 Release Notes](https://www.electronjs.org/blog/electron-38-0)
- [Electron 39.0.0 Release Notes](https://www.electronjs.org/blog/electron-39-0)
- [Electron Releases Timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Electron End-of-Life Dates](https://endoflife.date/electron)
- [@electron/remote npm Package](https://www.npmjs.com/package/@electron/remote)
- [better-sqlite3 npm Package](https://www.npmjs.com/package/better-sqlite3)
- [GitHub: did-get-response-details Deprecation Issue](https://github.com/electron/electron/issues/12597)
