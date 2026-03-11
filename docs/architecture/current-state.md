# Mailspring: Current State Architecture Narrative

This document summarizes the **Dual-Core** architecture of Mailspring: the separation between the Electron frontend and the C++ Mailsync backend, their responsibilities, and the rationale for this design. For detailed data flow and task lifecycle, see [data-flow.md](data-flow.md).

## Dual-Core Design

Mailspring is built as a **Dual-Core** application:

1. **Electron Frontend (TypeScript/React)**  
   Responsible for the user interface, window management, and all user interaction. It renders mail threads, composer, preferences, and plugins. It does **not** write to the database; it only reads from SQLite and reacts to change events.

2. **C++ Mailsync Backend (Mailspring-Sync)**  
   A separate process (one per account) that handles all communication with email providers (IMAP, SMTP, OAuth, CalDAV, CardDAV). It is the **single writer** to the local SQLite database. It syncs mail, sends messages, and applies user-initiated actions (move, star, delete) by persisting changes locally and on the provider, then streaming change deltas back to the frontend.

This split keeps protocol logic, parsing, and heavy I/O in native code while the UI stays in a single, cross-platform Electron codebase.

## Why This Architecture?

- **Performance and isolation**  
  Sync and network I/O run in separate processes. A hung or slow provider does not freeze the UI. Each account has its own sync process, so one failing account does not block others.

- **Reuse of C++ mail libraries**  
  The sync engine (in the [Mailspring-Sync](https://github.com/Foundry376/Mailspring-Sync) repository, `mailsync` submodule) uses mature C++ libraries for IMAP/SMTP, MIME, and database access. The Electron app does not implement these protocols itself.

- **Single source of truth**  
  The database is written only by the C++ process. The UI observes the database and reacts to change records. This avoids split-brain writes and keeps consistency rules in one place.

- **Clear boundary**  
  Communication is explicit: JSON over stdin (commands/tasks) and newline-delimited JSON over stdout (database deltas). No shared memory or direct DB writes from the renderer.

## Responsibilities at a Glance

| Layer              | Responsibilities |
|--------------------|------------------|
| **Renderer**       | React views, composer, thread list, preferences UI, plugin UI. Reads from Flux stores; dispatches actions (e.g. `Actions.queueTask`). |
| **Main Process**   | Window lifecycle, auto-updates, menu. In the main window: MailsyncBridge (spawns sync processes, forwards tasks, receives deltas and rebroadcasts via IPC). |
| **Mailsync (C++)** | Connect to providers (IMAP/SMTP/OAuth/CalDAV/CardDAV), sync mail/contacts/calendar, write SQLite, run tasks, emit deltas. |
| **SQLite**         | Single database file (e.g. `edgehill.db`). WAL mode. Written only by C++; read only by Electron (better-sqlite3, readonly). |

## Key Documents

- **System context and containers**: [diagrams/system-context.md](diagrams/system-context.md), [diagrams/containers.md](diagrams/containers.md)
- **Integration points**: [integration-points.md](integration-points.md)
- **Data flow**: [data-flow.md](data-flow.md)
- **Task and sync details**: [data-flow.md](data-flow.md) (critical path and task completion)
