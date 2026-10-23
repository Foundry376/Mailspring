import Foundation

class MailsyncManager {
    var process: Process?
    var binaryPath: String
    var mode: String
    var accountEmail: String?

    init(binaryPath: String, mode: String = "sync", accountEmail: String? = nil) {
        self.binaryPath = binaryPath
        self.mode = mode
        self.accountEmail = accountEmail
    }

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
