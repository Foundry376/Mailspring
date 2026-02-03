# BMAD Documentation Review Submission

This folder contains the Mailspring brownfield documentation deliverables organized for review. The structure mirrors the BMAD phases (Big Picture, Mechanics, Analysis & Logic).

---

## Where to Start

| Start here | Purpose |
| ---------- | ------- |
| **[PLAN.md](PLAN.md)** | The roadmap: three phases, to-do list, and suggested deliverable locations. |
| **[CLAUDE.md](CLAUDE.md)** | Legacy developer guidance: build commands, architecture overview, data flow, and task lifecycle. |

---

## Table of Contents

### Root

| File | Description |
| ---- | ----------- |
| [PLAN.md](PLAN.md) | Mailspring Documentation Roadmap (BMAD) – Phase 1–3 tasks and to-do list. |
| [CLAUDE.md](CLAUDE.md) | Claude/developer guidance – build, architecture, sync engine, tasks, observable database. |

### docs/architecture (Phase 1 & 2)

| File | Description |
| ---- | ----------- |
| [docs/architecture/README.md](docs/architecture/README.md) | Index of architecture docs. |
| [docs/architecture/current-state.md](docs/architecture/current-state.md) | Dual-Core architecture narrative (Electron + C++ Mailsync). |
| [docs/architecture/integration-points.md](docs/architecture/integration-points.md) | IMAP, SMTP, OAuth, CalDAV, CardDAV integration list. |
| [docs/architecture/technology-stack.md](docs/architecture/technology-stack.md) | Technology stack inventory (root, app, Mailsync). |
| [docs/architecture/data-flow.md](docs/architecture/data-flow.md) | Critical path: Internet → C++ → SQLite → IPC → Flux → React. |
| [docs/architecture/module-dependencies.md](docs/architecture/module-dependencies.md) | Flux store and action listen relationships. |
| [docs/architecture/deployment.md](docs/architecture/deployment.md) | Build, sign, and distribute (Grunt, packager, CI). |
| [docs/architecture/data-model.md](docs/architecture/data-model.md) | SQLite/Flux data model – ER diagram (Thread, Message, Contact) and Message fields table. |
| [docs/architecture/diagrams/system-context.md](docs/architecture/diagrams/system-context.md) | C4 system context diagram (User, Mailspring, Email Providers). |
| [docs/architecture/diagrams/containers.md](docs/architecture/diagrams/containers.md) | C4 container diagram (Renderer, Main, Mailsync, SQLite). |
| [docs/architecture/diagrams/components-mailsync.md](docs/architecture/diagrams/components-mailsync.md) | Mailsync engine component view (inferred). |
| [docs/architecture/diagrams/components-electron.md](docs/architecture/diagrams/components-electron.md) | Electron Application and main-window Flux components. |

### docs/guides

| File | Description |
| ---- | ----------- |
| [docs/guides/debugging-dual-core.md](docs/guides/debugging-dual-core.md) | Debugging the Electron–C++ bridge: verbose logging, stdout/logs, Dev Mode, Inspector, attach to C++. |

### docs/adr (Decisions)

| File | Description |
| ---- | ----------- |
| [docs/adr/0001-split-engine-architecture.md](docs/adr/0001-split-engine-architecture.md) | ADR: Split-Engine Architecture (Electron + C++). |
| [docs/adr/0002-local-first-strategy.md](docs/adr/0002-local-first-strategy.md) | ADR: Local-First Strategy (single writer, task queue). |

### docs (Analysis)

| File | Description |
| ---- | ----------- |
| [docs/technical-debt.md](docs/technical-debt.md) | Technical debt register (TODO/FIXME scan) and legacy patterns. |

---

## Folder Structure

```
review-submission/
├── README.md          (this file)
├── PLAN.md
├── CLAUDE.md
└── docs/
    ├── architecture/
    │   ├── README.md
    │   ├── current-state.md
    │   ├── data-flow.md
    │   ├── data-model.md
    │   ├── deployment.md
    │   ├── integration-points.md
    │   ├── module-dependencies.md
    │   ├── technology-stack.md
    │   └── diagrams/
    │       ├── components-electron.md
    │       ├── components-mailsync.md
    │       ├── containers.md
    │       └── system-context.md
    ├── guides/
    │   └── debugging-dual-core.md
    ├── adr/
    │   ├── 0001-split-engine-architecture.md
    │   └── 0002-local-first-strategy.md
    └── technical-debt.md
```
