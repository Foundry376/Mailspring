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

## Core Data Flow: Sync Engine, Tasks, and Observable Database

**Important:** The UI is read-only with respect to the database. All database modifications happen in the C++ sync engine (Mailspring-Sync). The Electron app requests changes via Tasks, and the sync engine streams entity changes back to create a real-time UI.

### Sync Engine Communication (`mailsync-process.ts`, `mailsync-bridge.ts`)

The sync engine is a separate C++ process spawned per account:

1. **Electron → Sync Engine**: JSON messages sent via stdin (task requests, commands)
2. **Sync Engine → Electron**: Newline-delimited JSON streamed via stdout (database change deltas)

```
┌─────────────────┐         stdin (JSON)          ┌──────────────────┐
│   Electron UI   │ ──────────────────────────────▶│  Mailspring-Sync │
│  (TypeScript)   │                                │      (C++)       │
│                 │ ◀────────────────────────────── │                  │
└─────────────────┘    stdout (JSON deltas)        └──────────────────┘
```

The `MailsyncBridge` (in main window only) manages sync process lifecycle, listens to `Actions.queueTask`, and forwards tasks to the appropriate account's sync process.

### Task System (`flux/tasks/`)

Tasks represent operations the user wants to perform (send email, star thread, move to folder). They are **persisted models** stored in the database.

**Task Lifecycle:**
1. UI calls `Actions.queueTask(new SomeTask({...}))`
2. `MailsyncBridge._onQueueTask()` validates and sends to sync engine via stdin
3. Sync engine executes the task (local changes + remote API calls)
4. Sync engine persists task status updates and emits deltas
5. Task completion triggers `onSuccess()` or `onError()` callbacks

**Task States** (`flux/tasks/task.ts`):
- `local` - Not yet executed
- `remote` - Local phase complete, waiting for remote
- `complete` - Finished successfully
- `cancelled` - Cancelled before completion

**Key Task Classes:**
- `SendDraftTask`, `DestroyDraftTask` - Email composition
- `ChangeLabelsTask`, `ChangeFolderTask` - Organization
- `ChangeStarredTask`, `ChangeUnreadTask` - Status flags
- `SyncbackMetadataTask` - Plugin metadata sync
- `SyncbackEventTask` - Calendar event sync

**Undoable Tasks:**

Tasks can support undo/redo by implementing `canBeUndone` and `createUndoTask()`. The `UndoRedoStore` automatically registers tasks with `canBeUndone = true` for undo.

Two patterns exist:
1. **Toggle pattern** (`ChangeStarredTask`): Undo simply flips a boolean flag
2. **Snapshot pattern** (`SyncbackMetadataTask`, `SyncbackEventTask`): Store original state in `undoData`, swap on undo

```typescript
// Snapshot pattern example
const undoData = { ics: event.ics, recurrenceStart: event.recurrenceStart };
event.ics = newIcs;  // Modify after capturing
Actions.queueTask(SyncbackEventTask.forUpdating({ event, undoData, description: 'Edit event' }));
```

See `docs/undo-redo-task-pattern.md` for detailed implementation guide.

### Task Queue (`flux/stores/task-queue.ts`)

The TaskQueue store observes Task model changes from the database and provides:
- `queue()` - Active tasks
- `completed()` - Finished tasks
- `waitForPerformLocal(task)` - Promise that resolves when task runs locally
- `waitForPerformRemote(task)` - Promise that resolves when task fully completes

### Observable Database Pattern

**Database is read-only in Electron** (`flux/stores/database-store.ts`):
- `DatabaseStore.inTransaction()` throws - writes are not allowed
- Uses SQLite in WAL mode via better-sqlite3 for concurrent reads
- The sync engine exclusively handles writes

**Change Records** (`flux/stores/database-change-record.ts`):

When the sync engine modifies data, it emits JSON deltas that become `DatabaseChangeRecord` objects:
```typescript
{
  type: 'persist' | 'unpersist',
  objectClass: 'Thread' | 'Message' | ...,
  objects: Model[],
  objectsRawJSON: object[]
}
```

**Reactive Queries** (`flux/models/query-subscription.ts`):

`QuerySubscription` provides live-updating query results:
```typescript
// Subscribe to all unread threads
const subscription = new QuerySubscription(
  DatabaseStore.findAll(Thread).where({ unread: true })
);
subscription.addCallback((threads) => this.setState({ threads }));

// Subscription automatically updates when DatabaseStore triggers
```

**Observable Integration** (`Rx.Observable.fromQuery`):

Wrap queries as RxJS observables for reactive UI updates:
```typescript
Rx.Observable.fromQuery(DatabaseStore.findAll(Thread))
  .subscribe(threads => this.updateUI(threads));
```

**ObservableListDataSource** (`flux/stores/observable-list-data-source.ts`):

Adapts QuerySubscription for virtualized list components (MultiselectList), supporting:
- Windowed/paginated data loading
- Selection state management
- Automatic updates from database changes

### Data Flow Summary

```
User Action → Actions.queueTask() → MailsyncBridge → stdin → Sync Engine
                                                              │
                                                              ▼
UI Updates ← QuerySubscription ← DatabaseStore.trigger() ← stdout deltas
```

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
