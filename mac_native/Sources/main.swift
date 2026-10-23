import Foundation

print("Starting Native Mailspring UI...")

let binaryPath = "/path/to/mailsync"

let migrationManager = MailsyncManager(binaryPath: binaryPath, mode: "migrate")
migrationManager.start()

let syncManager = MailsyncManager(binaryPath: binaryPath, mode: "sync", accountEmail: "user@example.com")
syncManager.start()

print("Native UI setup complete. Entering run loop.")
RunLoop.main.run(until: Date(timeIntervalSinceNow: 1.0))
