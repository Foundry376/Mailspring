# ADR-001: Split-Engine Architecture (Electron + C++)

## Status

Accepted (retrospective). The system has been built this way since the Nylas Mail / Mailspring lineage.

## Context

Mailspring is a desktop email client that must:

- Provide a rich, cross-platform UI (mail list, composer, calendar, contacts, preferences).
- Sync with many providers (IMAP, SMTP, Gmail, Outlook, CalDAV, CardDAV) and handle large mailboxes efficiently.
- Persist data locally and keep the UI responsive while sync and network I/O run.

A single-process, pure-JavaScript/Node stack would have to reimplement or bind to IMAP/SMTP/MIME and deal with heavy parsing and I/O on the main thread or in worker threads, with a single runtime and dependency tree for both UI and sync.

## Decision

Use a **split-engine architecture**:

- **Electron (TypeScript/React)** for the UI: windows, Flux state, React views, plugin system. One codebase for macOS, Windows, and Linux.
- **C++ sync engine (Mailspring-Sync)** as a separate process (one per account): all provider communication (IMAP, SMTP, OAuth, CalDAV, CardDAV), MIME parsing, and local SQLite writes. Communication is **stdin (JSON commands) / stdout (newline-delimited JSON deltas)**.

The Electron app does **not** implement IMAP/SMTP or write to the database; it only reads from SQLite (read-only) and reacts to change records streamed from the C++ process.

## Rationale

- **Performance and isolation**: Sync and network I/O run in separate processes. A slow or stuck provider does not freeze the UI. Each account has its own process, so one bad account does not block others.
- **Reuse of C++ mail stack**: The sync engine can use mature C++ libraries for IMAP/SMTP, MIME, and SQLite, with a single, optimized native binary per platform.
- **Single writer to the database**: All persistence is in the C++ process. The UI observes the database and reacts to deltas. This avoids split-brain writes and keeps consistency rules in one place.
- **Clear contract**: The boundary is explicit (stdin/stdout JSON). No shared memory or direct DB access from the renderer; easier to reason about and test each side.

## Consequences

### Positive

- UI stays responsive; sync can run in the background.
- Native code handles protocol and parsing performance.
- Clear separation of concerns: UI vs. sync vs. persistence.

### Negative

- **Complexity**: Two codebases (Electron + Mailspring-Sync), two build/release paths. Mailsync is distributed as a prebuilt binary (e.g. from S3) keyed by submodule commit.
- **IPC and debugging**: All sync→UI updates flow through stdout parsing and `DatabaseStore.trigger`. Debugging requires tracing both processes and the JSON protocol.
- **Deployment**: Packager must unpack the Mailsync binary from the ASAR; CI must produce or fetch the correct binary per platform.

## Alternatives Considered

- **Pure Node/Electron sync**: Would require Node IMAP/SMTP libraries and likely worker threads or a separate Node process anyway; still one runtime and more risk of UI jank from heavy I/O or parsing.
- **Single C++ app with embedded UI**: Would lose the cross-platform UI and plugin ecosystem that Electron and React provide.
- **Sync in the main process (same process as UI)**: Would couple sync to the UI process and make it harder to isolate failures and scale to many accounts.

## References

- [Current State Architecture](../architecture/current-state.md)
- [Container Diagram](../architecture/diagrams/containers.md)
- [Data Flow](../architecture/data-flow.md)
- [CLAUDE.md](../../CLAUDE.md) (Sync Engine Communication, Task System)
