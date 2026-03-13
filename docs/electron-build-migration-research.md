# Electron Build & Packaging Migration Research

Research into replacing Grunt and modernizing Mailspring's build/packaging pipeline.

## Current Mailspring Build Pipeline

`npm run build` → Grunt → `build-client` task chain:

```
Gruntfile.js
├── package-task.js        → @electron/packager (afterCopy hooks)
│   ├── Copy platform-specific resources
│   ├── Inject git commit hash
│   ├── Fix chrome-sandbox permissions (Linux)
│   ├── Copy symlinked packages
│   └── Transpile TypeScript (file-by-file via TypeScript.transpileModule)
├── create-mac-zip.js      → shell `zip` command
├── installer-linux-task.js → mkdeb / mkrpm shell scripts
└── (Windows: electron-winstaller, run separately)
```

**Dependencies involved:** `grunt`, `grunt-cli`, `load-grunt-parent-tasks`, `@electron/packager`, `electron-winstaller`, plus custom shell scripts (`mkdeb`, `mkrpm`).

**Key observation:** Grunt is used as a thin orchestrator only — all actual logic is in plain JS functions. This makes migration straightforward.

---

## What Other Electron Apps Use

| App | Task Runner | Bundler | Packager |
|---|---|---|---|
| **VS Code** | Gulp | esbuild + webpack | Custom (`@vscode/gulp-electron`) |
| **Signal Desktop** | npm scripts | esbuild + webpack | **electron-builder** v26 |
| **Hyper** (Vercel) | npm scripts | webpack | **electron-builder** |
| **Bitwarden Desktop** | npm scripts | webpack (Angular) | **electron-builder** v24 |
| **Mattermost Desktop** | npm scripts | webpack | **electron-builder** v24 |

VS Code is an outlier with a fully bespoke pipeline; not a useful model. Every other major Electron app converged on: **npm scripts + bundler + electron-builder**.

---

## electron-builder vs @electron/forge vs @electron/packager

### @electron/packager (what Mailspring uses now)

- **Low-level**: bundles source + Electron binary only
- Does NOT create installers, manage code signing lifecycle, or handle auto-updates
- ~274K weekly npm downloads
- Used internally by @electron/forge
- Using it standalone means wiring together many other tools manually (which is exactly what Mailspring does today)

### @electron/forge (officially recommended by Electron team)

- Plugin architecture with Makers (installer creators) and Publishers
- Uses `@electron/packager`, `@electron/osx-sign`, `@electron/notarize` under the hood
- Built-in makers for DMG, DEB, RPM, Flatpak, Snap, Squirrel.Windows, WiX MSI
- NSIS support only via third-party maker (`@felixrieseberg/electron-forge-maker-nsis`)
- Auto-updates via Squirrel (Electron's built-in `autoUpdater`)
- ~1M+ weekly downloads, actively maintained by Electron team
- v7.x stable, v8 alpha available

### electron-builder (community, most popular in production)

- Configuration-driven: typically a single `electron-builder.json` or `electron-builder.yml`
- **Widest installer format support out of the box**: NSIS, NSIS-Web, AppImage, DEB, RPM, Snap, Pacman, Flatpak, DMG, PKG, portable, AppX, MSI
- Built-in code signing + notarization (macOS and Windows, including Azure Trusted Signing)
- Custom `electron-updater` for auto-updates on all platforms (including Linux AppImage/DEB/RPM)
- ~1.2M weekly downloads, 14K+ GitHub stars
- **Used by Signal, Hyper, Bitwarden, Mattermost**

### Comparison table

| Capability | @electron/forge | electron-builder | Current Mailspring |
|---|---|---|---|
| Official recommendation | Yes | No | No |
| NSIS installer (Windows) | Third-party maker | Built-in | `electron-winstaller` (separate) |
| DEB/RPM (Linux) | Built-in makers | Built-in | Custom `mkdeb`/`mkrpm` scripts |
| DMG (macOS) | Built-in maker | Built-in | Manual zip only |
| Code signing + notarization | Built-in | Built-in | Manual `osxSign`/`osxNotarize` config |
| Auto-updates | Squirrel (no Linux) | `electron-updater` (all platforms) | N/A |
| ASAR support | Yes | Yes | Yes (manual config) |
| Config approach | JS plugin API | Declarative JSON/YAML | ~500 lines of Grunt tasks |

### Reality check

Despite Forge being officially recommended, the majority of well-known production Electron apps use **electron-builder**. Forge is catching up, but electron-builder's NSIS support, broader installer coverage, and mature `electron-updater` keep it dominant.

---

## Modern Task Runners (Grunt Replacements)

| Tool | Status | Users |
|---|---|---|
| **Grunt** | Effectively legacy (last major: v1.6.1, 2023) | Mailspring |
| **Gulp** | Declining, still maintained | VS Code (legacy decision) |
| **npm scripts** | De facto standard | Signal, Bitwarden, Mattermost, Hyper |
| **Turborepo/nx** | For monorepos | Bitwarden (monorepo) |

**Why npm scripts won:** no wrapper plugins needed, zero task-runner dependencies, tools called directly, composable with `&&` / `concurrently` / `npm-run-all`.

---

## Migration Options

### Option A: Minimal — Drop Grunt, Keep @electron/packager

Convert Grunt tasks to plain Node.js scripts called from `package.json`:

```json
{
  "scripts": {
    "build": "node scripts/build.js",
    "build:package": "node scripts/package.js",
    "build:installer": "node scripts/installer.js"
  }
}
```

- **Effort**: Low — your Grunt tasks are already plain JS functions, just strip the Grunt wrapper
- **Removes**: `grunt`, `grunt-cli`, `load-grunt-parent-tasks`
- **Keeps**: `@electron/packager`, `electron-winstaller`, `mkdeb`, `mkrpm` shell scripts
- **Drawback**: Still maintaining bespoke installer scripts

### Option B: electron-builder (recommended)

Replace all of `@electron/packager` + `electron-winstaller` + `mkdeb` + `mkrpm` + `create-mac-zip` with a single `electron-builder.json`:

```json
{
  "appId": "com.mailspring.mailspring",
  "productName": "Mailspring",
  "copyright": "Copyright © 2014-2026 Foundry 376, LLC",
  "directories": {
    "output": "dist"
  },
  "files": [
    "**/*",
    "!build/**",
    "!dist/**",
    "!docs/**",
    "!spec/**",
    "!script/**"
  ],
  "asarUnpack": [
    "mailsync",
    "mailsync.exe",
    "*.so",
    "*.dll",
    "*.node",
    "**/vendor/**",
    "**/static/extensions/**",
    "**/node_modules/spellchecker/**"
  ],
  "mac": {
    "category": "public.app-category.business",
    "icon": "build/resources/mac/mailspring.icns",
    "extendInfo": "build/resources/mac/extra.plist",
    "hardenedRuntime": true,
    "entitlements": "build/resources/mac/entitlements.plist",
    "entitlementsInherit": "build/resources/mac/entitlements.child.plist",
    "notarize": true
  },
  "dmg": {
    "background": "build/resources/mac/DMG-Background.png"
  },
  "win": {
    "icon": "build/resources/win/mailspring-square.ico",
    "target": ["nsis"]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "linux": {
    "icon": "build/resources/linux/icons",
    "category": "Office;Network;Email",
    "target": ["deb", "rpm"],
    "desktop": {
      "Name": "Mailspring",
      "Comment": "The best email app for people and teams at work"
    }
  },
  "deb": {
    "depends": ["libsecret-1-0", "gnome-keyring"]
  },
  "protocols": [
    { "name": "Mailspring Protocol", "schemes": ["mailspring"] },
    { "name": "Mailto Protocol", "schemes": ["mailto"] }
  ]
}
```

And `package.json` scripts become:

```json
{
  "scripts": {
    "build:compile": "node scripts/compile-typescript.js",
    "build": "npm run build:compile && electron-builder"
  }
}
```

- **Effort**: Medium — but the result is dramatically simpler
- **Removes**: `grunt`, `grunt-cli`, `load-grunt-parent-tasks`, `@electron/packager`, `electron-winstaller`, `mkdeb`, `mkrpm`, `create-mac-zip.js`, `installer-linux-task.js`, `package-task.js`, `task-helpers.js`
- **Adds**: `electron-builder` (single dependency)
- **Result**: ~500 lines of build code → ~80-line JSON config
- **Bonus**: DMG creation (not just zip), NSIS installer (modern Windows), built-in notarization

The `afterCopy` hooks map to electron-builder equivalents:
- Platform resources → `extraResources` / `extraFiles` config
- Commit hash injection → `afterPack` hook or `buildVersion` field
- Symlink resolution → electron-builder handles this natively
- TypeScript transpilation → `beforeBuild` or `beforePack` hook
- chrome-sandbox permissions → handled automatically by electron-builder's Linux makers

### Option C: @electron/forge

- Officially recommended, but NSIS support requires third-party maker
- More opinionated plugin architecture
- Better if starting a new project; more migration friction for existing apps
- **Effort**: Medium-high

---

## Recommendation

**Option B (electron-builder)** is the pragmatic choice:

1. Battle-tested by Signal, Hyper, Bitwarden, Mattermost
2. Your current packager config maps almost 1:1 to `electron-builder.json` fields
3. Eliminates all custom installer scripts (mkdeb, mkrpm, create-mac-zip, create-signed-windows-installer)
4. Single dependency replaces 5+ tools
5. Declarative config is easier to maintain than imperative Grunt tasks
6. Gains DMG creation, modern NSIS installer, auto-update support if desired later

The migration can be done incrementally: first extract the TypeScript compilation step into a standalone script, then swap the packager, then remove the old Grunt infrastructure.
