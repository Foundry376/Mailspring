import Foundation

print("Starting Native Mailspring UI...")

// TODO: In a full macOS app, this entry point should be replaced with SwiftUI's `App` struct
// or an `NSApplicationDelegate`. This CLI-style run loop is only for initial backend testing.

// TODO: Resolve the actual path to the embedded `mailsync` binary (e.g., using `Bundle.main.url`).
let binaryPath = "/path/to/mailsync"

let migrationManager = MailsyncManager(binaryPath: binaryPath, mode: "migrate")
migrationManager.start()

let syncManager = MailsyncManager(binaryPath: binaryPath, mode: "sync", accountEmail: "user@example.com")
syncManager.start()

print("Native UI setup complete. Entering run loop.")
RunLoop.main.run(until: Date(timeIntervalSinceNow: 1.0))
