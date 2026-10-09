# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Run the app in development mode (uses --dev flag, data stored in Mailspring-dev folder)
npm start

# Run linting (prettier runs as an eslint rule); lint:check reports without fixing
npm run lint
npm run lint:check

# TypeScript type checking
npm run typecheck

# Run all tests, or only spec files whose path matches a regex
npm test
npm test -- --spec-file-pattern='calendar'

# Run window-specific tests
npm run test-window

# Run Playwright end-to-end tests
npm run test:e2e

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

> **IMPORTANT:** Application source code lives in **both** `app/src/` and `app/internal_packages/`. When searching for usages of a module, symbol, or pattern, always search both directories. Searching only `app/src/` will miss a large portion of the codebase and lead to incomplete changes.

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

## Comment Style

Write for a technical reader who prefers self-documenting code. Prefer clearer names and
smaller functions over commentary; a comment that restates the code should be deleted.

- State **current behavior and rationale** — why the code is the way it is, and what a
  reader would otherwise get wrong. Never narrate thought process, stream of
  consciousness, or the path you took to the answer.
- Never describe history: where code used to live, what it was folded out of, what the
  previous implementation did, or what a diff changed. Git records that.
- Cite external evidence when it exists — a Sentry issue ID (`MAILSPRING-CLIENT-AC`), an
  upstream commit or PR in mailcore2/libetpan/Electron, a spec section, a provider quirk.
  These justify code that otherwise looks arbitrary and are the most valuable comments in
  the codebase.
- Paragraph-length comments should be rare, and almost always attach to a function, class,
  or module rather than sitting inline. Inline comments belong on one non-obvious line and
  should be one or two lines long.

## Development Notes

- Reload the window with Developer > Reload: `Cmd+Option+L` (macOS), `Ctrl+Alt+L` (Linux), `Ctrl+Shift+R` (Windows). It reruns renderer code and recompiles edited files (the compile cache is keyed on file contents); main-process code in `app/src/browser` needs a full restart. `Cmd/Ctrl+R` is Reply
- Dev tools accessible via Menu > Developer > Toggle Developer Tools
- In dev tools console, `$m` provides access to `mailspring-exports` for debugging
- Dev mode data is stored separately (e.g., `~/.config/Mailspring-dev/` on Linux)
- The interface language is set in Preferences > General (`core.intl.language`) and read at launch, so relaunch to apply it. Arabic, Persian, Hebrew and Kurdish run right-to-left: the workspace gets `dir="rtl"` and every stylesheet goes through `rtlcss`

## Claude Hooks

A `PostToolUse` hook in `.claude/settings.json` runs `.claude/hooks/lint-edited-file.sh` after each edit to a `.ts`/`.tsx` file under `app/src` or `app/internal_packages`. It runs `eslint --fix` on that one file and reports anything it couldn't fix.
