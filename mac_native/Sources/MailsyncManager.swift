import Foundation

/// `MailsyncManager` is responsible for spawning and managing the lifecycle of the C++ `mailsync` binary.
/// Mailspring relies on this separate C++ process to handle email synchronization (IMAP/SMTP/ActiveSync).
///
/// Future agents/developers should enhance this class to:
/// 1. Capture stdout/stderr via `Pipe()` to parse JSON messages from `mailsync`.
/// 2. Handle unexpected process terminations (e.g. `process.terminationHandler`).
/// 3. Pass environmental variables needed by `mailsync`.
class MailsyncManager {
    var process: Process?
    var binaryPath: String
    var mode: String
    var accountEmail: String?

    /// Initializes a new MailsyncManager.
    /// - Parameters:
    ///   - binaryPath: The absolute path to the `mailsync` executable.
    ///   - mode: The mode to run in (e.g., "sync", "migrate").
    ///   - accountEmail: The email address for the account to sync (passed as `--info`).
    init(binaryPath: String, mode: String = "sync", accountEmail: String? = nil) {
        self.binaryPath = binaryPath
        self.mode = mode
        self.accountEmail = accountEmail
    }

    /// Spawns the `mailsync` process asynchronously.
    func start() {
        process = Process()
        process?.executableURL = URL(fileURLWithPath: binaryPath)

        var args = ["--mode", mode]
        if let email = accountEmail {
            args.append("--info")
            args.append(email)
        }

        process?.arguments = args

        do {
            try process?.run()
            print("MailsyncManager: Started mailsync process for \(accountEmail ?? "migration").")
        } catch {
            print("MailsyncManager: Failed to start mailsync - \(error)")
        }
    }
}
