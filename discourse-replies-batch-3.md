# Mailspring Discourse Reply Drafts — Batch 3

### 1. Unread in the Sidebar means Unread in INBOX only?
**Thread:** https://community.getmailspring.com/t/unread-in-the-sidebar-means-unread-in-inbox-only/10140
**Action:** Reply

> You're right that the "Unread" sidebar item shows unread messages across all accounts but scoped to your inbox. It's equivalent to searching `is:unread` on all inboxes.
>
> For a global unread view spanning all folders, the best approach right now is to use the search bar with `is:unread` — this will show unread messages everywhere regardless of folder. Unfortunately there's no way to save a persistent smart folder/search yet; that's a feature request we're tracking.
>
> The "Default Container Folder" setting in account preferences is unrelated — it controls which folder new messages are filed into by mail rules, not what the sidebar displays.

---


### 2. New mails in custom Labels won't give me notifications
**Thread:** https://community.getmailspring.com/t/new-mails-in-custom-labels-wont-give-me-notifications/9763
**Action:** Reply

> This is expected behavior, not a bug — Mailspring currently only triggers desktop notifications for new messages that land in your **Inbox**. Messages routed to custom labels by mail rules bypass the inbox and therefore don't trigger a notification.
>
> This is a known limitation. The workaround is to have your mail rules apply labels *without* removing the message from the inbox (i.e., don't add an "Archive" or "Move" action to the rule — just a "Label" action). That way the message stays in your inbox and triggers a notification, while also being labeled.
>
> I understand this isn't ideal if you specifically want to keep the inbox clean. Supporting notifications for custom-labeled folders is something I'd like to improve in a future release.

---


### 3. How to change account passwords
**Thread:** https://community.getmailspring.com/t/how-to-change-account-passwords/9898
**Action:** Reply + mark Resolved

> When you change your email account password, Mailspring will eventually show an authentication error (red indicator in the sidebar). To update the stored password:
>
> 1. Go to **Preferences > Accounts** and select the affected account.
> 2. Click the **"Reconnect"** button that appears in the account details panel (it's always visible at the bottom of the account details, even if there's no error yet).
> 3. This reopens the account setup flow — enter your new password there.
>
> Mailspring will resume syncing normally once the new credentials are saved.

---


### 4. Export Signatures?
**Thread:** https://community.getmailspring.com/t/export-signatures/9627
**Action:** Reply + mark Resolved

> There's no dedicated export/import UI for signatures, but it's easy to do manually since signatures are stored in Mailspring's `config.json` file.
>
> **To transfer your signatures:**
> 1. On your old machine, find the config file:
>    - **macOS:** `~/Library/Application Support/Mailspring/config.json`
>    - **Windows:** `%APPDATA%\Mailspring\config.json`
>    - **Linux:** `~/.config/Mailspring/config.json`
> 2. Open the file and copy out the `"signatures"` and `"defaultSignatures"` keys and their values.
> 3. On your new machine, open its `config.json` and paste those keys in (with Mailspring closed).
>
> Make sure Mailspring is fully quit before editing the file, then restart it on the new machine — your signatures should appear.

---


### 5. Automatic dark/light theme from system
**Thread:** https://community.getmailspring.com/t/automatic-dark-light-theme-from-system/9455
**Action:** Reply + mark Resolved

> Good news — Mailspring already supports this! By default, Mailspring follows your system's light/dark mode setting automatically.
>
> If it's not doing that, it may have been manually overridden at some point. To re-enable it, go to **Preferences > Appearance** and set the theme to **"Automatic"**. This will make Mailspring switch between light and dark themes whenever your OS switches.

---


### 6. Move accounts to another Windows computer
**Thread:** https://community.getmailspring.com/t/move-mailspring-accounts-information-to-another-computer-on-windows/9428
**Action:** Reply + mark Resolved

> To move your Mailspring setup to a new Windows computer, follow these steps:
>
> 1. On the old machine, copy the entire `%APPDATA%\Mailspring` folder.
> 2. On the new machine (with Mailspring installed but not yet set up), replace its `%APPDATA%\Mailspring` folder with the one from the old machine.
> 3. Launch Mailspring — it should pick up your accounts and settings.
>
> **Important caveats:**
> - Account passwords are stored in the Windows Credential Manager (not in the Mailspring folder), so you'll likely be prompted to re-enter passwords after the move. This is expected.
> - The local email cache (the `edgehill.db` database) can be large. If you want a clean start, you can delete it and let Mailspring re-sync — you'll just need to wait for messages to re-download.
>
> The simplest approach is usually to just re-add your accounts on the new machine from scratch via **Preferences > Accounts > Add Account**, since email itself lives on the server.

---


### 7. What is this number next to the folder
**Thread:** https://community.getmailspring.com/t/what-is-this-number-next-to-the-folder/9407
**Action:** Reply + mark Resolved

> That number is the **unread message count** for that folder. It counts messages that are marked as unread in your mailbox on the server.
>
> If it shows a number but you don't see any unread messages, there are a few possibilities:
> - There may be unread messages in a subfolder that isn't visible in the current view — try clicking directly on the folder.
> - Messages may be marked unread on the server but not displaying because of a sync lag. Try right-clicking the account and selecting **"Sync Now"**.
> - On Gmail, messages can sometimes be marked unread in categories (Promotions, Social, etc.) that contribute to the count even if you rarely check them.
>
> If the count persists after syncing, it's likely there are genuinely unread messages somewhere in that folder tree.

---


### 8. Archive folder not available
**Thread:** https://community.getmailspring.com/t/archive-folder-not-available/9461
**Action:** Reply

> Mailspring's archive feature depends on your email provider having a folder with the "Archive" role. If no such folder exists in your account, the Archive action (swipe, keyboard shortcut, toolbar button) won't be available.
>
> To fix this:
> 1. Log into your email provider's webmail interface and create an "Archive" folder if one doesn't exist.
> 2. Make sure your provider marks it with the Archive role (most providers do this automatically for a folder named "Archive").
> 3. Restart Mailspring or wait for a sync cycle — it should pick up the new folder.
>
> For some IMAP providers, you may need to check your provider's settings to enable an Archive folder. Once Mailspring detects a folder with the archive role, the Archive button and swipe gesture will become active.

---


### 9. Signature Picture — custom photo only works on some computers
**Thread:** https://community.getmailspring.com/t/signature-picture/9905
**Action:** Reply + mark Resolved

> The ability to upload a custom photo to your signature requires you to be **signed in with a Mailspring ID** (a free account at getmailspring.com). The photo is hosted on Mailspring's servers so it shows up correctly in all your recipients' email clients.
>
> On the laptop where you only see "Gravatar Profile Photo" or "Domain Logo", the photo upload area is hidden because Mailspring isn't signed in to a Mailspring ID on that machine. To fix it:
> 1. Go to **Preferences > Subscription** on the laptop.
> 2. Sign in (or create) a free Mailspring ID.
> 3. Go back to **Preferences > Signatures** — the photo upload option should now appear.

---


### 10. Constant 'Syncing Your Mailbox'
**Thread:** https://community.getmailspring.com/t/constant-syncing-your-mailbox/10052
**Action:** Reply

> The "Syncing Your Mailbox" message in the sidebar just means the sync engine is actively working through your messages — for new accounts or accounts with large mailboxes, this can take a while (hours for large Gmail accounts). The green status indicators you see when clicking the accounts confirm sync is actually proceeding without errors.
>
> A few things that may help:
> - Let it run — the initial sync usually completes on its own. Once Mailspring has finished the initial pass, the message will go away and only reappear briefly when new mail arrives.
> - Make sure your Mac isn't going to sleep during the initial sync, as that interrupts the sync engine.
> - If it seems stuck for more than a day with no progress, try right-clicking each account in the sidebar and choosing **"Sync Now"**, or go to **Preferences > Accounts** and click **"Reconnect"** on each account to restart the sync engine.

---


### 11. How do I remove default categories on the left side bar? (Starred, Snoozed, Reminders, etc.)
**Thread:** https://community.getmailspring.com/t/how-do-i-remove-default-categories-on-the-left-side-bar-starred-snoozed-reminders-etc/9729
**Action:** Reply

> Unfortunately there's no option to hide or reorder those built-in sidebar sections (Starred, Snoozed, Reminders, etc.) — they're hardcoded into the sidebar layout at the moment.
>
> This comes up fairly often as a request and I understand the desire for a more customizable sidebar. It's something I'd like to add in a future version. For now the best workaround is just to ignore those sections if you don't use them.

---


### 12. Inbox messages without content preview
**Thread:** https://community.getmailspring.com/t/inbox-messages-without-content-preview/9496
**Action:** Reply + mark Resolved

> There's no built-in setting to hide the message preview snippet from the thread list in Mailspring — the snippet is always shown alongside the subject line. This is a layout decision that hasn't been made configurable yet.
>
> If this is something you'd like to see, please add your vote on the feature requests category — it helps prioritize what gets built.

---


### 13. Read Receipts Missing / Read Receipts Not Showing (after re-adding account)
**Thread:** https://community.getmailspring.com/t/read-receipts-missing/9504
**Action:** Reply

> Unfortunately read receipt data (open/click tracking) is tied to the local Mailspring database for that account. When you delete an account and re-add it, the local database is rebuilt from scratch by re-syncing from the server — and since open tracking data is stored locally (not on the mail server), it can't be recovered.
>
> Going forward, the tracking data for emails sent after re-adding the account will work normally. But the historical tracking events from before the account deletion are not retrievable.

---


### 14. Sync errors - Keyring issue on Linux
**Thread:** https://community.getmailspring.com/t/mailspring-encountered-errors-syncing-this-account-suspect-keyring-issue/9514
**Action:** Reply

> On Linux, Mailspring requires a secret service (GNOME Keyring or KWallet) to store account passwords securely. The "could not store your password securely" error means Mailspring can't talk to that service.
>
> A few things to try:
>
> 1. **Make sure a secret service daemon is running.** On GNOME, run `gnome-keyring-daemon --start` in a terminal. On KDE, ensure KWallet is active.
>
> 2. **Launch Mailspring with the correct flag.** If you're using GNOME Keyring, start Mailspring with:
>    ```
>    mailspring --password-store="gnome-libsecret"
>    ```
>    If you're using KWallet:
>    ```
>    mailspring --password-store="kwallet5"
>    ```
>    You can add this flag to your desktop launcher or `.desktop` file to make it permanent.
>
> 3. **Reboot** — sometimes the keyring daemon isn't fully started on login, and a reboot resolves it (as one user in this thread found).
>
> 4. On some distros, `gnome-keyring` needs to be configured to auto-start with the session. Check your distro's documentation for "unlock GNOME Keyring on login."
>
> If none of these work, please share your distro and desktop environment and I'll dig deeper.

---


### 15. How do I respond from a different email address when I have more than 1 email on Mailspring?
**Thread:** https://community.getmailspring.com/t/how-do-i-respond-from-a-different-email-address-in-case-i-have-more-than-1-email-addresses-on-mailspring/9717
**Action:** Reply

> When replying to a message, Mailspring defaults to the account that received the email. There's no direct UI to switch the sending account on a reply at the moment — this is a known limitation.
>
> The best workaround right now is to **forward** the message instead of replying, which opens a new compose window where you can select any account from the "From" field dropdown. It's not as clean as a proper reply, but it gets the job done.
>
> For sending new emails you can already choose any account using the "From" dropdown in the composer. Allowing account-switching on replies is something I'd like to add — it's a frequently requested feature.

---


### 16. Mailspring ID connexion (repeated disconnection on Linux)
**Thread:** https://community.getmailspring.com/t/mailspring-id-connexion/9661
**Action:** Reply

> This is a known issue on Linux where the Mailspring ID token is stored in the system keyring. If the keyring isn't unlocked automatically on login, Mailspring can't retrieve the token and shows you as signed out.
>
> The fix is the same as for account password issues on Linux — make sure your secret service (GNOME Keyring or KWallet) is configured to unlock automatically when you log in.
>
> For Solus with GNOME: ensure `gnome-keyring-daemon` is set to start with your session and that "Automatically unlock this keyring when I log in" is enabled in the Passwords app (Seahorse). On Fedora with Cinnamon, you may need to install and configure `gnome-keyring` since Cinnamon doesn't always start it by default.
>
> Also make sure you're launching Mailspring with `--password-store="gnome-libsecret"`. You can add this to your `.desktop` launcher file.

---


### 17. Solution to constant Pop-Up "One or more accounts are having connection issues"
**Thread:** https://community.getmailspring.com/t/solution-to-constant-pop-up-one-or-more-accounts-are-having-connections-issues/8810
**Action:** Reply

> This notification appears when Mailspring's sync engine reports a connection error for any account — even a brief or transient one. The notification doesn't currently tell you which account is affected, which I know is frustrating.
>
> To identify the problem account, go to **Preferences > Accounts** and look for any account showing a red/error state. Common causes:
>
> - **Outlook/Hotmail accounts**: Microsoft periodically requires re-authentication. Click "Reconnect" to go through the OAuth flow again.
> - **IMAP accounts**: Check that your provider hasn't changed their server settings or required an app-specific password.
> - **Network interruptions**: If your internet drops briefly, the notification can appear and linger even after connectivity is restored. Clicking "Try now" usually clears it.
>
> If all accounts show green in preferences but you still get the notification, try restarting Mailspring — the sync processes sometimes get into a bad state that a restart clears.

---


### 18. iCloud not working with app password
**Thread:** https://community.getmailspring.com/t/icloud-not-working-with-app-password/8012
**Action:** Reply

> iCloud IMAP has some quirks. A few things to double-check:
>
> 1. **Use an App-Specific Password** — this is required since Apple enables 2FA by default. Generate one at [appleid.apple.com](https://appleid.apple.com) under Security > App-Specific Passwords.
>
> 2. **Use the correct server settings:**
>    - IMAP server: `imap.mail.me.com`, port `993`, SSL
>    - SMTP server: `smtp.mail.me.com`, port `587`, STARTTLS
>
> 3. **Username must be your full `@icloud.com` address** (or `@me.com`/`@mac.com`), not just the part before the @.
>
> 4. **Make sure IMAP is enabled in iCloud settings** — go to iCloud.com > Mail > Settings gear icon > Preferences > IMAP, and ensure it's turned on.
>
> If you're still seeing `AUTHENTICATIONFAILED` after checking all of the above, try generating a fresh app-specific password — they occasionally need to be regenerated.

---


### 19. Disable Automatic Formatting (asterisks converted to italic)
**Thread:** https://community.getmailspring.com/t/disable-automatic-formatting/4397
**Action:** Reply

> The rich text editor in Mailspring does convert markdown-style syntax (like `*text*`) to formatting automatically — that's by design for the HTML composer, but I understand it's a problem when you need to type literal asterisks or equations.
>
> The best workarounds:
>
> 1. **Use plain text mode for that draft** — hold **Alt** (Windows/Linux) or **Option** (macOS) when clicking Compose or Reply to open a plain-text draft. No formatting will be applied.
>
> 2. **Disable rich text globally** — in **Preferences > Sending**, uncheck "Enable rich text and advanced editor features". This switches the composer to plain text by default for all messages.
>
> There's currently no option to keep rich text enabled but disable specific auto-formatting rules. That level of control in the editor is something worth adding, and I'll keep it in mind for future improvements.

---


### 20. Filters Creation (mail rules for moving to folders)
**Thread:** https://community.getmailspring.com/t/filters-creation/1274
**Action:** Reply

> Mailspring does have mail rules — go to **Preferences > Mail Rules** to set them up. You can create rules that match on sender, subject, recipient, and more.
>
> **For Gmail accounts**, the available actions are label-based (since Gmail uses labels rather than folders), so you can automatically apply a label but messages stay in the inbox unless you also add "Archive" as an action.
>
> **For IMAP accounts with real folders**, there's a "Move to Folder" action available in mail rules that will route matching messages directly into a specific folder.
>
> If you're on Gmail and want messages to go to a specific label *and* skip the inbox, add both a "Apply Label" action and an "Archive" action to the same rule.

---


### 21. Outlook/Hotmail accounts won't connect every other day/week
**Thread:** https://community.getmailspring.com/t/outlook-hotmail-accounts-wont-connect-every-other-day-week/9879
**Action:** Reply

> This is primarily a Microsoft issue, not a Mailspring one — Microsoft has been aggressively enforcing token expiration and periodically deprecating older authentication methods for personal Outlook/Hotmail accounts.
>
> A few things that help:
>
> 1. **Reconnect via OAuth** — In Mailspring, go to **Preferences > Accounts**, select your Outlook account, and click "Reconnect." Choose the Microsoft login option (not manual IMAP) so it uses OAuth tokens instead of a password, which tend to be more stable.
>
> 2. **Check for "less secure app" policies** — Microsoft sometimes silently revokes access for IMAP clients. Signing back in through the Reconnect flow usually restores it.
>
> 3. **If using IMAP/SMTP manually** — Microsoft requires "Modern Authentication" (OAuth) for personal accounts now. Adding the account through Mailspring's built-in Microsoft option (which uses OAuth) is more reliable than manual IMAP setup.
>
> Unfortunately the frequency of these disconnects is determined by Microsoft's token lifetime policies, which we can't control on our end.

---


### 22. Mailspring still appears after deletion (macOS)
**Thread:** https://community.getmailspring.com/t/having-delete-mailspring-app-but-today-i-found-it-is-still-in-mail-app/9565
**Action:** Reply + mark Resolved

> This is a macOS behavior — the system caches registered URL handlers and mail client applications even after the app is deleted. Apple Mail's list of available email clients comes from Launch Services, which doesn't immediately remove entries when an app is uninstalled.
>
> To clean this up, run the following command in Terminal, which rebuilds the Launch Services database:
> ```
> /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
> ```
>
> After running it (it takes a few seconds), Mailspring should no longer appear as an option in Apple Mail's default client list.

