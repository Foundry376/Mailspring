# ADR-002: Local-First Strategy (Data Persistence and Sync)

## Status

Accepted (retrospective). The application has always been local-first with a single-writer sync engine.

## Context

Users expect email to be available offline and to see updates quickly. The system must:

- Store mail, threads, contacts, and calendar data locally.
- Sync with providers in the background and apply changes without blocking the UI.
- Allow the UI to query and display data without waiting on the network.
- Ensure user actions (send, move, delete) are applied consistently locally and on the server.

## Decision

Adopt a **local-first strategy** with the following rules:

1. **Single writer to the database**  
   Only the C++ sync engine (Mailsync) writes to the local SQLite database. The Electron app opens the database in **read-only** mode (WAL) and never performs writes.

2. **Observable read-only UI**  
   The UI reads from the database via `DatabaseStore` (queries, findAll, etc.). All changes to the displayed data come from **change records** emitted by the sync engine and delivered via `DatabaseStore.trigger(record)`. Stores and components subscribe to DatabaseStore and refresh when relevant models change.

3. **Task queue for mutations**  
   User-initiated mutations (send draft, move thread, mark read, etc.) are represented as **Tasks** (persisted models). The UI calls `Actions.queueTask(task)`. The MailsyncBridge forwards the task to the sync engine via stdin. The sync engine executes the task (local DB updates + provider API calls), then emits deltas so the UI sees the updated state. Task completion triggers `onSuccess()` or `onError()` callbacks.

4. **No direct DB writes from the renderer**  
   `DatabaseStore.inTransaction()` throws in the Electron app; there is no code path for the UI to insert/update/delete in SQLite. This guarantees a single writer and avoids race conditions.

## Rationale

- **Predictable consistency**: One process owns all writes; no split-brain or write conflicts between UI and sync.
- **Offline and responsiveness**: The UI always reads from local SQLite. Sync runs in the background and streams changes; the UI does not block on the network for reads.
- **Clear data flow**: All updates flow in one direction: Provider → Sync engine → SQLite → stdout → DatabaseStore.trigger → listeners. Mutations flow: User → Actions.queueTask → Sync engine → SQLite + Provider → stdout → DatabaseStore.trigger (and task callbacks).

## Consequences

### Positive

- Simple mental model: “If it’s on screen, it’s in the DB; if it changed, a delta was emitted.”
- Safe concurrency: Readers (Electron) and writer (C++) can coexist with WAL and readonly connections.
- Task queue provides a single place to track in-flight mutations and surface errors.

### Negative

- **Latency for user actions**: The UI cannot optimistically write to the DB; it must wait for the sync engine to apply the change and emit a delta (or for the task to complete and callbacks to run). Optimistic UI would require a different design (e.g. temporary local state or a dedicated “pending” store).
- **Dependency on sync process**: If the sync process is down or slow, task completion is delayed and the UI may show stale state until the process catches up.

## Alternatives Considered

- **UI can write to DB**: Would require careful coordination with the sync engine (e.g. conflict resolution, dual writers) and complicate the model; rejected in favor of a single writer.
- **No local DB; always fetch from server**: Would hurt offline support and perceived performance; inconsistent with the product goal of a fast, local client.
- **Optimistic writes from UI with rollback**: Would need a way to revert if the server rejects the change; current design prefers “task in progress” then “task complete” with a single source of truth.

## References

- [Current State Architecture](../architecture/current-state.md)
- [Data Flow](../architecture/data-flow.md)
- [CLAUDE.md](../../CLAUDE.md) (Observable Database Pattern, Task System, Task Queue)
- [Module Dependencies](../architecture/module-dependencies.md)
