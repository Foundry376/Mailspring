# Mailspring Native macOS Port

This directory contains the foundation for rewriting the Mailspring frontend using native macOS technologies (Swift, AppKit, SwiftUI), fully replacing the legacy Electron/React monolith.

## Architecture Overview
Mailspring operates using a two-process architecture:
1. **The Backend (`mailsync`)**: A high-performance C++ executable responsible for communicating with email servers (IMAP, SMTP, etc.) and storing data in a local SQLite database.
2. **The Frontend**: The GUI that the user interacts with. It reads from the SQLite database and spawns/monitors the `mailsync` process to trigger syncs.

## Why Swift?
Electron applications consume significant RAM and CPU, and struggle to integrate deeply with native OS features (like macOS system menus, accessibility, and optimal battery life). While an initial attempt was made to port the React frontend to `pywebview`, the sheer volume of Node.js dependencies tightly coupled within the UI components made it untenable. A ground-up native Swift rewrite allows for a much faster, leaner, and more deeply integrated macOS application while still utilizing the robust C++ sync engine.

## Next Steps for Developers / Agents
If you are picking up this project, your immediate goals are:
1. **Process Management**: Enhance `MailsyncManager.swift` to capture and parse the JSON stdout from the `mailsync` binary using `Foundation.Pipe`.
2. **Database Integration**: Integrate a Swift SQLite wrapper (like `SQLite.swift` or `GRDB`) to connect to Mailspring's local database.
3. **App Lifecycle**: Transition `main.swift` into a proper SwiftUI `App` or AppKit `NSApplicationDelegate`.
4. **UI Construction**: Begin building the native interface (Thread List, Composer, Sidebar) reading directly from the SQLite database.
