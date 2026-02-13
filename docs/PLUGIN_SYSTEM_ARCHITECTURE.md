# Mailspring Plugin System Architecture

This document provides a comprehensive overview of the Mailspring plugin system for developers looking to understand, extend, or improve the plugin infrastructure.

## Table of Contents

- [Overview](#overview)
- [Plugin Directory Locations](#plugin-directory-locations)
- [Plugin Structure](#plugin-structure)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Extension Points & Registries](#extension-points--registries)
- [User Plugin Installation](#user-plugin-installation)
- [Theme System](#theme-system)
- [Current Limitations](#current-limitations)
- [Developer Resources](#developer-resources)

---

## Overview

Mailspring uses a robust plugin architecture where features are implemented as "packages". The system is managed by two core files:

| File | Purpose |
|------|---------|
| `app/src/package-manager.ts` | Discovers, validates, and activates packages |
| `app/src/package.ts` | Represents individual plugin instances |

The `PackageManager` is instantiated as part of the `AppEnv` singleton during application startup (see `app/src/app-env.ts`).

---

## Plugin Directory Locations

Plugins are discovered from these directories in order:

| Directory | Purpose | Notes |
|-----------|---------|-------|
| `<resourcePath>/internal_packages/` | Built-in plugins | 51 packages bundled with Mailspring |
| `<configDirPath>/packages/` | User-installed plugins | Skipped in safe mode |
| `<configDirPath>/dev/packages/` | Developer mode plugins | Only loaded in dev mode |
| `<resourcePath>/spec/fixtures/packages/` | Test packages | Only in spec mode |

### Platform-Specific Config Directories

| Platform | Config Directory |
|----------|------------------|
| Linux | `~/.config/Mailspring/` |
| macOS | `~/Library/Application Support/Mailspring/` |
| Windows | `%APPDATA%\Mailspring\` |

In development mode, data is stored separately (e.g., `~/.config/Mailspring-dev/` on Linux).

---

## Plugin Structure

### Directory Layout

```
my-plugin/
├── package.json          # Required - metadata and configuration
├── lib/
│   └── main.ts          # Required - entry point with activate/deactivate
├── styles/              # Optional - LESS stylesheets (auto-loaded)
│   └── my-plugin.less
├── keymaps/             # Optional - keyboard shortcuts (auto-loaded)
│   └── my-plugin.json
├── menus/               # Optional - menu definitions (auto-loaded)
│   └── my-plugin.json
├── assets/              # Optional - images, sounds, etc.
└── spec/                # Optional - Jasmine test specs
```

### package.json Schema

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "displayName": "My Plugin",
  "description": "What the plugin does",
  "main": "./lib/main",
  "license": "GPL-3.0",

  "engines": {
    "mailspring": "*"
  },

  "windowTypes": {
    "default": true,
    "composer": true,
    "thread-popout": true
  },

  "isOptional": true,
  "isDefault": true,
  "syncInit": false,
  "isIdentityRequired": false,
  "isHiddenOnPluginsPage": false,

  "theme": false
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package identifier (kebab-case) |
| `version` | Yes | Semantic version |
| `main` | Yes* | Entry point path (required for non-theme plugins) |
| `engines.mailspring` | Yes | **Required for validation** - target engine version |
| `displayName` | No | Human-readable name for UI |
| `description` | No | Plugin description |
| `windowTypes` | No | Which window types load this plugin |
| `isOptional` | No | If true, can be disabled by user |
| `isDefault` | No | If true, enabled by default |
| `syncInit` | No | If true, loads immediately during startup |
| `isIdentityRequired` | No | If true, requires Mailspring account to activate |
| `theme` | No | Set to `"ui"` for theme plugins |

### Window Types

| Type | Description |
|------|-------------|
| `default` | Main application window |
| `composer` | Composer/draft windows |
| `thread-popout` | Thread popout windows |
| `emptyWindow` | Empty window |
| `all` | All window types |

---

## Plugin Lifecycle

### Entry Point (lib/main.ts)

Every plugin must export `activate()` and `deactivate()` functions:

```typescript
import { ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
import MyComponent from './my-component';
import MyExtension from './my-extension';

export function activate() {
  // Register UI components
  ComponentRegistry.register(MyComponent, {
    role: 'Composer:ActionButton'
  });

  // Register extensions
  ExtensionRegistry.MessageView.register(MyExtension);
}

export function deactivate() {
  // Clean up all registrations
  ComponentRegistry.unregister(MyComponent);
  ExtensionRegistry.MessageView.unregister(MyExtension);
}

// Optional: Persist state across reloads
export function serialize() {
  return { myState: 'value' };
}
```

### Optional Configuration Support

```typescript
// Define configuration schema
export const config = {
  myOption: {
    type: 'string',
    default: 'value',
    description: 'Description of the option'
  }
};

// Or legacy style
export const configDefaults = {
  myOption: 'value'
};

// Hook called after config is registered
export function activateConfig() {
  AppEnv.config.onDidChange('my-plugin.myOption', (newValue) => {
    // Handle config change
  });
}
```

### Loading Sequence

1. **Discovery**: `PackageManager.discoverPackages()` scans configured directories
2. **Filtering**: Packages filtered by `windowTypes` for current window
3. **Validation**: Checks for valid `package.json` with `engines.mailspring`
4. **Sync Loading**: Plugins with `syncInit: true` activate immediately
5. **Delayed Loading**: Other plugins activate after 2.5 second delay
6. **Resource Loading**: Keymaps, stylesheets, menus auto-loaded
7. **Activation**: `activate()` function called on main module

### Activation Flow (package-manager.ts)

```
activatePackages(windowType)
    │
    ├── For each available package:
    │   ├── Check windowTypes match
    │   ├── If syncInit → activatePackage() immediately
    │   └── Else → queue for delayed activation
    │
    └── After 2.5s timeout:
        └── activatePackage() for queued packages

activatePackage(pkg)
    │
    ├── Skip if already active
    ├── Skip if theme (handled separately)
    ├── Skip if optional and disabled in config
    ├── Skip if identity required but not present
    ├── Verify engines.mailspring is set
    │
    ├── Mark as active
    └── Call pkg.activate()

Package.activate()
    │
    ├── Load keymaps from keymaps/ directory
    ├── Load stylesheets from styles/ directory
    ├── Load menus from menus/ directory
    ├── require(main module)
    ├── Call module.activate()
    └── Register config schema if present
```

---

## Extension Points & Registries

### ComponentRegistry

Injects React components into UI locations:

```typescript
import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

// Register with a role
ComponentRegistry.register(MyButton, {
  role: 'Composer:ActionButton'
});

// Register at a location
ComponentRegistry.register(MySidebar, {
  location: WorkspaceStore.Location.MessageListSidebar
});

// Register with mode constraints
ComponentRegistry.register(MyComponent, {
  role: 'ThreadListIcon',
  modes: ['list', 'split']
});
```

**Common Roles:**

| Role | Description |
|------|-------------|
| `Composer` | Main composer component |
| `Composer:ActionButton` | Buttons in composer action bar |
| `Composer:Footer` | Footer area in composer |
| `ThreadActionsToolbarButton` | Thread toolbar buttons |
| `ThreadListIcon` | Icons in thread list items |
| `ThreadListQuickAction` | Quick action buttons |
| `MessageListHeaders` | Headers above message list |
| `MessageHeader` | Message header area |
| `MessageHeaderStatus` | Status in message header |
| `MessageFooterStatus` | Status in message footer |
| `DraftList:DraftStatus` | Draft status indicators |
| `message:BodyHeader` | Headers within message body |

**Common Locations:**

| Location | Description |
|----------|-------------|
| `WorkspaceStore.Location.RootSidebar` | Left sidebar |
| `WorkspaceStore.Location.RootSidebar.Toolbar` | Sidebar toolbar |
| `WorkspaceStore.Location.ThreadList` | Thread list area |
| `WorkspaceStore.Location.MessageList` | Message list area |
| `WorkspaceStore.Location.MessageListSidebar` | Sidebar next to messages |
| `WorkspaceStore.Location.Center` | Main content area |

### ExtensionRegistry

Register behavioral extensions:

```typescript
import { ExtensionRegistry } from 'mailspring-exports';

// Available extension registries:
ExtensionRegistry.Composer.register(MyComposerExtension);
ExtensionRegistry.MessageView.register(MyMessageExtension);
ExtensionRegistry.ThreadList.register(MyThreadListExtension);
ExtensionRegistry.AccountSidebar.register(MySidebarExtension);
```

#### ComposerExtension

```typescript
class MyComposerExtension extends ComposerExtension {
  // Add custom send actions (e.g., "Send Later")
  static sendActions() {
    return [{
      title: 'Send Later',
      iconUrl: 'mailspring://my-plugin/assets/clock.png',
      isEnabled: ({ draft }) => true,
      performSendAction: ({ draft }) => { /* ... */ }
    }];
  }

  // Display warnings before sending
  static warningsForSending({ draft }) {
    return ['Warning message'];
  }

  // Modify new drafts
  static prepareNewDraft({ draft }) {
    draft.body = draft.body + '<signature>';
  }

  // Transform draft before sending
  static applyTransformsForSending({ draft, draftBodyRootNode }) {
    // Add tracking pixels, etc.
    return draft;
  }
}
```

#### MessageViewExtension

```typescript
class MyMessageExtension extends MessageViewExtension {
  // Modify message HTML before rendering
  static formatMessageBody({ message }) {
    message.body = processHTML(message.body);
  }

  // Manipulate DOM after rendering
  static renderedMessageBodyIntoDocument({ document, message, iframe }) {
    // Post-process rendered content
  }

  // Filter which attachments to display
  static filterMessageFiles({ message, files }) {
    return files.filter(f => !f.filename.endsWith('.sig'));
  }
}
```

### Other Registries

| Registry | Purpose | Key Methods |
|----------|---------|-------------|
| `CommandRegistry` | Keyboard commands | `add()`, `dispatch()` |
| `SoundRegistry` | Notification sounds | `register()`, `playSound()` |
| `ServiceRegistry` | Service injection | `registerService()`, `withService()` |
| `DatabaseObjectRegistry` | Custom data models | `register()`, `deserialize()` |

---

## User Plugin Installation

### Current Implementation

The `PackageManager` provides installation functionality (see `package-manager.ts:152-179`):

```typescript
// Opens file dialog, validates, copies to packages/, activates
AppEnv.packages.installPackageManually();

// Opens plugin starter template repo
AppEnv.packages.createPackageManually();
```

**Access Methods:**
- Developer console: `$m.packages.installPackageManually()`
- Command: `window:install-package` (not in any menu by default)

### Manual Installation

1. Download/create plugin folder with valid `package.json`
2. Copy to `~/.config/Mailspring/packages/` (or platform equivalent)
3. Restart Mailspring (or call `installPackageFromPath()`)

### Validation Requirements

- Must have `package.json` file
- Must have `engines.mailspring` field
- Main entry point must exist (for non-themes)

---

## Theme System

Themes are plugins with special handling:

```json
{
  "name": "my-theme",
  "theme": "ui",
  "displayName": "My Theme",
  "engines": { "mailspring": "*" }
}
```

### Theme Picker

Located in `internal_packages/theme-picker/`:
- Accessible via Preferences > Appearance > "Change Theme..."
- Lists all discovered theme packages
- Supports live switching without restart
- Only one theme active at a time

### Built-in Themes

- `ui-light` (base theme)
- `ui-dark`
- `ui-darkside`
- `ui-taiga`
- `ui-ubuntu`
- `ui-less-is-more`

---

## Current Limitations

| Limitation | Impact |
|------------|--------|
| No plugin management UI | Users must manually copy folders or use dev console |
| No marketplace/store | No central discovery for community plugins |
| No enable/disable UI | Plugins require config file editing (themes have UI) |
| No update mechanism | Manual updates only |
| No sandboxing | Plugins have full API access |
| Limited version checking | `engines.mailspring: "*"` is common |

### Disabled Plugins Configuration

Optional plugins can be disabled via config:

```json
{
  "core": {
    "disabledPackages": ["plugin-name-1", "plugin-name-2"]
  }
}
```

---

## Developer Resources

### Global APIs

**mailspring-exports:**
- `Actions` - Flux action dispatcher
- `DatabaseStore` - Read-only database queries
- `Stores` - Application state (DraftStore, MessageStore, TaskQueue, etc.)
- `Models` - Data models (Message, Thread, Contact, Account, etc.)
- `Tasks` - Async operations (SendDraftTask, ChangeLabelsTask, etc.)
- All registries

**mailspring-component-kit:**
- `InjectedComponent`, `InjectedComponentSet`
- `Modal`, `Menu`, `Flexbox`, `Spinner`
- `KeyCommandsRegion`, `ListensToFluxStore`

### Debugging

- Hot reload: `Ctrl+R` (Windows/Linux) or `Cmd+R` (macOS)
- Dev tools: Menu > Developer > Toggle Developer Tools
- Console access: `$m` provides `mailspring-exports`

### External Resources

- Plugin Starter: https://github.com/Foundry376/Mailspring-Plugin-Starter
- Theme Starter: https://github.com/Foundry376/Mailspring-Theme-Starter
- Community: https://community.getmailspring.com/

---

## Key Source Files Reference

| File | Purpose |
|------|---------|
| `app/src/package-manager.ts` | Package discovery and activation |
| `app/src/package.ts` | Package class implementation |
| `app/src/app-env.ts` | AppEnv singleton, initializes PackageManager |
| `app/src/registries/component-registry.ts` | UI component registration |
| `app/src/registries/extension-registry.ts` | Extension registration |
| `app/src/extensions/composer-extension.ts` | ComposerExtension base class |
| `app/src/extensions/message-view-extension.ts` | MessageViewExtension base class |
| `app/src/components/injected-component.tsx` | Renders registered components |
| `app/src/global/mailspring-exports.ts` | Global API exports |
| `app/internal_packages/theme-picker/` | Theme selection UI (reference for plugin UI) |
