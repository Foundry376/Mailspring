# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Run the app in development mode (uses --dev flag, data stored in Mailspring-dev folder)
npm start

# Run with specific language locale
npm start -- --lang=de

# Run linting (prettier + eslint)
npm run lint

# Run all tests
npm test

# Run window-specific tests
npm test-window

# TypeScript type checking in watch mode
npm run tsc-watch

# Build for production
npm run build
```

## Architecture Overview

Mailspring is an Electron-based email client written in TypeScript with React. It uses a plugin architecture where features are implemented as internal packages.

### Key Directories

- **`app/src/`** - Core application source code
  - `browser/` - Main process code (application lifecycle, window management, auto-updates)
  - `flux/` - Flux-based state management (actions, stores, models, tasks)
  - `components/` - Reusable React UI components
  - `services/` - Application services (search, sanitization, etc.)
  - `registries/` - Extension registries (components, extensions, database objects)
  - `global/` - Global exports (`mailspring-exports`, `mailspring-component-kit`)

- **`app/internal_packages/`** - Built-in plugins implementing features (composer, message-list, thread-list, preferences, themes, etc.)

- **`app/spec/`** - Jasmine test specs

### Core Modules

**Global exports for plugins:**
- `mailspring-exports` - Core APIs: Actions, Stores, Models, Tasks, Utils, database access
- `mailspring-component-kit` - Reusable UI components

**Flux Architecture:**
- **Models** (`flux/models/`) - Data models: Message, Thread, Contact, Account, Folder, Label, etc.
- **Stores** (`flux/stores/`) - Application state: DatabaseStore, DraftStore, AccountStore, etc.
- **Tasks** (`flux/tasks/`) - Async operations: SendDraftTask, ChangeFolderTask, etc.
- **Actions** (`flux/actions.ts`) - Application-wide action dispatcher

### Plugin Structure

Each plugin in `internal_packages/` has:
- `package.json` - Metadata with `windowTypes` specifying where plugin loads
- `lib/main.ts` - Entry point with `activate()` and `deactivate()` lifecycle hooks
- `lib/` - Plugin source code
- `styles/` - LESS stylesheets
- `keymaps/` - Keyboard shortcut definitions

### Sync Engine

The email sync is handled by a separate C++ process (Mailspring-Sync) that communicates with the Electron app. The `MailsyncBridge` (`mailsync-bridge.ts`) manages this communication.

### Database

Uses SQLite via better-sqlite3. The `DatabaseStore` provides the data access layer with a query DSL for type-safe queries.

## Development Notes

- Hot reload is available via `CTRL+R` (Windows/Linux) or `CMD+R` (macOS)
- Dev tools accessible via Menu > Developer > Toggle Developer Tools
- In dev tools console, `$m` provides access to `mailspring-exports` for debugging
- Dev mode data is stored separately (e.g., `~/.config/Mailspring-dev/` on Linux)

## Claude Hooks

### after_edit

Run linting after modifying TypeScript or JavaScript files.

```json
{
  "hooks": {
    "after_edit": [
      {
        "command": "npm run lint",
        "file_paths": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
      }
    ]
  }
}
```
