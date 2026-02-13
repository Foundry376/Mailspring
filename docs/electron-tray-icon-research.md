# Electron System Tray Icon Research

Research into best practices for Electron tray icons across platforms, with focus on Linux dark panel issues.

---

## 1. Icon Format Support

| Format | Support |
|--------|---------|
| **PNG** | All platforms. **Recommended.** Supports transparency, lossless. |
| **JPEG** | All platforms. No transparency — not useful for tray icons. |
| **ICO** | Windows only. Best visual results on Windows. |
| **SVG** | **NOT supported.** `nativeImage` cannot load SVGs. Multiple feature requests ([#9642](https://github.com/electron/electron/issues/9642), [#9661](https://github.com/electron/electron/issues/9661), [#13568](https://github.com/electron/electron/issues/13568)) have been closed as wontfix. |

**PNG is the only viable cross-platform format for tray icons.**

Workaround for SVG: convert to PNG at build time using `sharp`, `resvg-js`, or similar. Keep SVG as source files, export PNG assets for runtime.

---

## 2. Template Images — macOS Only

Template images are **exclusively a macOS feature**. They allow the OS to automatically invert icon colors to match the light/dark menu bar.

**Requirements:**
- Icon must use only **black color + alpha channel** (no other colors)
- Filename must end with `Template` (e.g., `iconTemplate.png`, `iconTemplate@2x.png`)
- Or set programmatically: `image.isMacTemplateImage = true`

**Linux has no equivalent mechanism.** The `Template` suffix convention and `isMacTemplateImage` property are documented as macOS-only APIs. There is no built-in way for Electron to auto-adapt tray icon colors on Linux.

**Mailspring's current approach:** Uses `isMacTemplateImage = true` on macOS (correct), ships separate `-dark` variants for Linux and Windows (correct).

---

## 3. Recommended Icon Sizes

| Platform | Sizes |
|----------|-------|
| macOS | 16x16 (`@1x`), 32x32 (`@2x`) — Electron auto-selects based on display |
| Windows | 16x16 (`@1x`), 32x32 (`@2x`), optionally 24x24, 48x48, 256x256 in ICO |
| Linux | 22x22 is the standard tray icon size. 44x44 or 88x88 for HiDPI. |

Electron supports DPI suffixes: `@1x`, `@1.25x`, `@1.5x`, `@2x`, `@3x`, up to `@5x`.

**Note:** Mailspring PR [#2395](https://github.com/Foundry376/Mailspring/pull/2395) found that rendering at **88x88** and letting the system scale down produces crisper results than using exact tray pixel sizes. This is worth considering — oversample for quality.

---

## 4. The Linux Dark Panel Problem

### The Root Issue

On GNOME/Ubuntu, the **Shell top bar is themed independently from applications**. The top bar uses the GNOME Shell theme (CSS), while applications use the GTK theme. These are separate:

- `gsettings set org.gnome.desktop.interface color-scheme 'prefer-light'` → sets **app** theme to light
- The GNOME Shell top bar **remains dark** because it follows the Shell theme (Adwaita), not the GTK theme
- The Shell theme can only be changed via GNOME Tweaks or custom CSS

**Consequence:** When a user enables "light mode" on Ubuntu, `nativeTheme.shouldUseDarkColors` returns `false`, so Mailspring selects the dark icon (intended for light backgrounds). But the tray icon sits in the **still-dark panel**, making it invisible.

### `nativeTheme.shouldUseDarkColors` on Linux

Detection chain:
1. **XDG Desktop Portal** (`org.freedesktop.portal.Settings`) — modern approach, added in Electron PR [#38977](https://github.com/electron/electron/pull/38977)
2. **GTK Theme Name** — checks `org.gnome.desktop.interface gtk-theme` for "dark" substring
3. **gtk-application-prefer-dark-theme** — GTK settings property

**Known reliability problems:**
- [#23861](https://github.com/electron/electron/issues/23861): Returns `false` even with dark theme active on Ubuntu 20.04
- [#43416](https://github.com/electron/electron/issues/43416): Initially returns `true`, then erroneously flips to `false` after ~0.5s (Chromium regression)
- GNOME 42+ changed the canonical dark mode mechanism from `gtk-theme: Adwaita-dark` to `color-scheme: prefer-dark`. Older Chromium/Electron versions miss this.
- On Wayland, requires `xdg-desktop-portal-gtk` to be running

**Critical limitation:** There is **no API to detect the panel/tray area theme** — only the application theme. [Electron Issue #25478](https://github.com/electron/electron/issues/25478) requested this but remains unresolved.

### Desktop Environment Behavior

| DE | Panel Background | Auto-Invert Icons? | Notes |
|----|-----------------|--------------------|-|
| **GNOME (Ubuntu)** | Almost always dark | No | Requires AppIndicator extension. Panel theme is independent of app theme. |
| **KDE Plasma** | Follows Plasma theme | Yes (for named icons) | Can auto-invert monochromatic icons, but only for freedesktop icon-name-based icons, not pixmaps. |
| **XFCE** | Follows panel theme | No | Requires `xfce4-statusnotifier-plugin`. |
| **i3** | N/A | N/A | `i3bar` only supports XEmbed — Electron SNI icons don't appear. Need `snixembed`. |
| **sway** | Follows config | No | Supports SNI natively. |

### The SNI Protocol Limitation

Electron uses **StatusNotifierItem (SNI)** on Linux, which supports two icon delivery methods:

1. **IconName** (freedesktop icon name) — Panel looks up the icon from the current theme, can select the correct dark/light variant. **Electron does NOT support this.** ([Issue #5364](https://github.com/electron/electron/issues/5364), closed wontfix; [Issue #41801](https://github.com/electron/electron/issues/41801), open but no implementation)
2. **IconPixmap** (raw pixel data) — Panel renders exactly what it receives, no theme adaptation. **This is what Electron uses.**

If Electron supported icon names, the desktop environment could handle theme adaptation automatically. Since it only supports pixmaps, the app must determine the correct variant itself — but has no way to query the panel theme.

---

## 5. How Other Electron Apps Handle This

| App | Format | Dark/Light Detection | Monochrome Option | Ubuntu Handling |
|-----|--------|---------------------|-------------------|-----------------|
| **Signal Desktop** | PNG (4 sizes) | `nativeTheme.shouldUseDarkColors` + listener | No | Single-scale icons on Linux |
| **Bitwarden** | PNG/ICO | None | No (requested [#8890](https://github.com/bitwarden/clients/issues/8890)) | No special handling |
| **Element Desktop** | PNG (Linux), ICO (Win) | None in tray code | User toggle (PR [#1804](https://github.com/element-hq/element-desktop/pull/1804), partially reverted) | No special handling |
| **Tutanota/Tuta** | PNG | None | No | No special handling |
| **VS Code** | N/A | N/A | N/A | No tray icon at all |
| **Mailspring** | PNG | `nativeTheme.shouldUseDarkColors` + listener | No | Ships dark/light variants |

**Key observations:**
- Most apps do NOT handle the GNOME dark panel problem at all
- No app uses SVG (Electron doesn't support it)
- Only Signal and Mailspring attempt theme-aware icon switching
- Element tried a monochrome toggle but it was problematic
- The common "solution" is to just ship a colored icon that's visible on both backgrounds

---

## 6. Recommended Solutions for the Ubuntu Dark Panel Problem

### Option A: Default to Light Icons on GNOME (Recommended)

On GNOME/Ubuntu, **always use the light (white) tray icon** regardless of `shouldUseDarkColors`, since the panel is almost always dark. Use `shouldUseDarkColors` only on KDE/XFCE and Windows.

```typescript
_dark = () => {
  if (process.platform === 'darwin') return ''; // macOS uses template images
  if (process.platform === 'win32') {
    return nativeTheme.shouldUseDarkColors ? '-dark' : '';
  }
  // Linux: detect DE
  const desktop = process.env.XDG_CURRENT_DESKTOP || '';
  if (desktop.includes('GNOME') || desktop.includes('Unity')) {
    return '-dark'; // GNOME panel is always dark → use light icon
  }
  // KDE, XFCE, others: trust nativeTheme
  return nativeTheme.shouldUseDarkColors ? '-dark' : '';
};
```

**Pros:** Simple, covers the majority case (Ubuntu is the largest Linux user base).
**Cons:** Wrong if a user has a custom light GNOME Shell theme.

### Option B: User Preference Toggle

Add a setting like "Tray icon style: Auto / Light / Dark" to preferences. Already partially supported since Mailspring has `core.workspace.trayIconStyle` for blue/red. This could be extended.

**Pros:** Always correct, user has full control.
**Cons:** Extra UI complexity, requires user to discover the setting.

### Option C: High-Contrast / Colored Icons

Use colored icons (like the existing blue/red "new mail" variants) as the default state instead of monochrome. Colored icons are visible on both light and dark backgrounds.

**Pros:** Works everywhere without detection.
**Cons:** May look out of place on panels that expect monochrome icons.

### Option D: Outline/Border on Icons

Add a subtle contrasting outline or shadow to monochrome icons so they're visible on both light and dark backgrounds.

**Pros:** Single icon variant works everywhere.
**Cons:** May look slightly less clean than a pure monochrome icon.

### Recommended Approach

Combine **Option A + Option B**: Default to light icons on GNOME, trust `nativeTheme` on other DEs, and add a manual override preference for edge cases.

---

## 7. Current Mailspring Implementation

### Architecture

```
Renderer Process                    Main Process
(SystemTrayIconStore)              (SystemTrayManager)
        |                                |
  Monitors:                        Creates Electron Tray
  - BadgeStore (unread count)      Handles context menu
  - Window focus/blur              Receives IPC updates
  - nativeTheme changes
        |                                |
        |--- ipcRenderer.send() -------->|
             'update-system-tray'        |
             (iconPath, unread,          |
              isTemplateImg)             |
                                   tray.setImage()
                                   tray.setToolTip()
```

### Asset Structure

```
assets/
├── darwin/         # macOS template images (auto-invert)
│   ├── MenuItem-Inbox-Full.png / @2x.png
│   ├── MenuItem-Inbox-Full-NewItems.png / @2x.png
│   ├── MenuItem-Inbox-Full-UnreadItems.png / @2x.png
│   └── MenuItem-Inbox-Zero.png / @2x.png
├── linux/          # Separate dark/light variants
│   ├── MenuItem-Inbox-Full.png / -dark.png
│   ├── MenuItem-Inbox-Full-NewItems.png / -dark.png
│   ├── MenuItem-Inbox-Full-UnreadItems.png / -dark.png
│   └── MenuItem-Inbox-Zero.png / -dark.png
└── win32/          # Separate dark/light variants with @2x
    ├── MenuItem-Inbox-Full.png / -dark.png / @2x / -dark@2x
    ├── MenuItem-Inbox-Full-NewItems.png / -dark.png / @2x / -dark@2x
    ├── MenuItem-Inbox-Full-UnreadItems.png / -dark.png / @2x / -dark@2x
    └── MenuItem-Inbox-Zero.png / -dark.png / @2x / -dark@2x
```

### Known Linux-Specific Issues

1. **Cannot destroy tray on Linux** — [electron#17622](https://github.com/electron/electron/issues/17622). Mailspring works around this by skipping `tray.destroy()` on Linux.
2. **`click` events unreliable** — AppIndicator on Linux ignores `click`. Mailspring already has a context menu as fallback.
3. **No HiDPI variants for Linux** — Linux assets don't have `@2x` versions unlike macOS/Windows.
4. **Context menu must be re-set after changes** — Linux-specific requirement.

---

## 8. Summary of Key Findings

| Question | Answer |
|----------|--------|
| Does Linux support template images? | **No.** Template images are macOS-only. |
| Can tray icons be SVG? | **No.** Electron's `nativeImage` does not support SVG. Use PNG. |
| How to handle Ubuntu's dark panel in light mode? | `nativeTheme.shouldUseDarkColors` detects **app** theme, not panel theme. On GNOME the panel is almost always dark regardless. Best approach: default to light icons on GNOME + add a manual override preference. |
| What format should tray icons be? | **PNG** for all platforms. Optionally ICO for Windows. |
| What sizes? | macOS: 16x16 + 32x32 (@2x). Windows: 16x16 + 32x32 (@2x). Linux: 22x22 standard, consider 88x88 oversampled. |

---

## References

- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron nativeImage API](https://www.electronjs.org/docs/latest/api/native-image)
- [Electron nativeTheme API](https://www.electronjs.org/docs/latest/api/native-theme)
- [Electron Issue #5364 — Theme icon names for Linux tray](https://github.com/electron/electron/issues/5364)
- [Electron Issue #25478 — API to detect tray theme](https://github.com/electron/electron/issues/25478)
- [Electron Issue #41801 — Allow tray icon names](https://github.com/electron/electron/issues/41801)
- [Electron Issue #17622 — Cannot destroy tray on Linux](https://github.com/electron/electron/issues/17622)
- [Electron Issue #23861 — shouldUseDarkColors unreliable on Linux](https://github.com/electron/electron/issues/23861)
- [Electron Issue #43416 — shouldUseDarkColors regression](https://github.com/electron/electron/issues/43416)
- [Mailspring PR #2395 — Dark/light tray icons for Linux](https://github.com/Foundry376/Mailspring/pull/2395)
- [freedesktop.org StatusNotifierItem spec](https://www.freedesktop.org/wiki/Specifications/StatusNotifierItem/StatusNotifierItem/)
- [Signal Desktop SystemTrayService](https://github.com/signalapp/Signal-Desktop/blob/main/app/SystemTrayService.ts)
- [Element Desktop tray.ts](https://github.com/element-hq/element-desktop/blob/develop/src/tray.ts)
- [Element Desktop monochrome icon PR](https://github.com/element-hq/element-desktop/pull/1804)
- [Bitwarden monochrome icon request](https://github.com/bitwarden/clients/issues/8890)
