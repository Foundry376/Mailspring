# Mailspring Architecture Documentation

This folder contains the architecture documentation for Mailspring (high-level design, data flow, deployment, and diagrams).

## Quick Links

| Document | Description |
|----------|-------------|
| [current-state.md](current-state.md) | Dual-Core architecture narrative (Electron + C++ Mailsync) |
| [diagrams/system-context.md](diagrams/system-context.md) | C4 system context: User, Mailspring, Email Providers |
| [diagrams/containers.md](diagrams/containers.md) | C4 containers: Renderer, Main, Mailsync, SQLite |
| [diagrams/components-mailsync.md](diagrams/components-mailsync.md) | Mailsync engine component view (inferred) |
| [diagrams/components-electron.md](diagrams/components-electron.md) | Electron Application and main-window Flux components |
| [integration-points.md](integration-points.md) | IMAP, SMTP, OAuth, CalDAV, CardDAV integration list |
| [technology-stack.md](technology-stack.md) | Languages, frameworks, versions (root + app + Mailsync) |
| [data-flow.md](data-flow.md) | Critical path: Internet → C++ → SQLite → IPC → Flux → React |
| [module-dependencies.md](module-dependencies.md) | Flux store and action listen relationships |
| [deployment.md](deployment.md) | Build, sign, and distribute (Grunt, packager, CI) |



