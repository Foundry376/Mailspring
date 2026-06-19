# Mailspring Discourse Reply Drafts — 2026-06-19

### 1. Attachments to emails / sending
**Thread:** https://community.getmailspring.com/t/attachments-to-emails-sending/14485
**Action:** Reply + mark Resolved

> To attach a file to an email in Mailspring, open a compose window and either drag and drop a file from your file manager directly onto the composer, or click the paperclip icon in the toolbar at the bottom of the compose window. Both methods work the same way — the file will appear as an attachment below your message body before you send.

### 2. Reply All button missing
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply + mark Resolved

> The Reply All option only appears when the message has more than one recipient or has CC recipients — if an email only had one recipient, there's no one to "reply all" to, so the button is hidden. When it is available, the primary button in the message toolbar defaults to either Reply or Reply All depending on your setting in **Preferences > General > Default reply type**. If you set it to "Reply All," it becomes the main button and the regular Reply becomes the secondary option in the dropdown. Hope that helps!

### 3. Reply All Doesn't Work (sends to only first recipient)
**Thread:** https://community.getmailspring.com/t/reply-all-doesn-t-work/14478
**Action:** Reply

> Thanks for the report. Could you share a bit more detail so I can track this down? Specifically: was the original email a group email thread (multiple addresses in the To field), or was it one person To with multiple CC'd? And did all the extra recipients end up missing from the draft, or did they show up in the To field but the message only got delivered to one? Any additional details — like whether the email came from an external list/group address — would help a lot.

### 4. Duplicate IMAP + Gmail accounts after switching
**Thread:** https://community.getmailspring.com/t/imap-does-not-work/14479
**Action:** Reply + mark Resolved

> Now that Gmail is syncing correctly via the OAuth setup, you can remove the old IMAP account to clean that up. Go to **Preferences > Accounts**, select the IMAP-based Gmail entry (it will show as a plain IMAP account rather than "Gmail"), and click the **–** (minus) button at the bottom to remove it. That will leave just the Gmail OAuth account and your inbox will consolidate back to a single view.

### 5. Mail rules not applied automatically to incoming mail
**Thread:** https://community.getmailspring.com/t/roles-not-automatically-applied/14477
**Action:** Reply

> Mail rules are applied automatically in Mailspring, but only to messages that arrive *after* Mailspring was first launched — and only once both the message headers and body have fully synced (to avoid running rules on partial data). There are a couple of things that can cause rules to silently not fire: (1) If the rule was created after the messages were already in your inbox, it won't apply retroactively — use "Process Entire Mailbox" to catch those up. (2) If you're on a forwarded address that doesn't match the account address configured in Mailspring, condition matches against "To" may not work as expected. Could you share what conditions your rule uses? That would help narrow down whether this is a matching issue or a timing issue.

### 6. Inconsistency deleting single vs. multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-multiple-mails/14476
**Action:** Reply

> You're right — this is an inconsistency. When you delete a single message the next one is auto-selected, but bulk deletion doesn't trigger the same behavior, leaving you with an empty selection. I'll note this for the next pass of UI polish. In the meantime, pressing the down arrow key after a bulk delete will move focus to the next thread.

### 7. Building broken with Node.js 26 / 24.16
**Thread:** https://community.getmailspring.com/t/building-broken-with-node-js-26-1-0-24-16-0/14475
**Action:** Reply

> Thanks Linus — confirmed, the hang in `@electron/packager` 18.x with newer Node.js versions is a known upstream issue caused by `extract-zip`. Upgrading to `@electron/packager` 20.x resolves it. I'll get that dependency bumped. In the meantime, building with Node.js ≤ 22 is a reliable workaround.

### 8. Can't upgrade — 500 error on subscription page
**Thread:** https://community.getmailspring.com/t/can-t-upgrade/14474
**Action:** Reply

> Thanks for the heads-up — a 500 on the upgrade page is a server-side issue on our end, not your browser or payment method. I'll investigate and get this fixed. I'll follow up here once it's resolved. Sorry for the friction!

### 9. Mailspring on ChromeOS
**Thread:** https://community.getmailspring.com/t/mailspring-on-chromeos/14473
**Action:** Reply

> Mailspring can run on ChromeOS via the Linux (Crostini) environment, but the experience has some rough edges that are tricky to address since ChromeOS doesn't provide a standard desktop keyring for Mailspring to store account credentials in. The keyring error you're seeing is the main blocker — the Crostini environment doesn't include GNOME Keyring or KWallet by default. You can try installing and starting `gnome-keyring` inside the Linux container (`sudo apt install gnome-keyring` and then `eval $(gnome-keyring-daemon --start)` before launching Mailspring from the terminal), which sometimes resolves it. I can't promise a smooth experience on ChromeOS given those platform constraints, but that's the best workaround we have right now.

### 10. Slow email push notification / no manual refresh
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply + mark Resolved

> Mailspring uses IMAP IDLE for push-style notifications, so new mail delivery speed depends largely on how well your email provider supports it. Gmail and Outlook push within seconds; some smaller providers poll on a longer interval (up to 5 minutes). If you're waiting for a time-sensitive email like an OTP, you can force an immediate sync by pressing **Ctrl+R** (Windows/Linux) or **Cmd+R** (macOS) — that reloads all accounts right away.

### 11. Send via mail (Nautilus "Email" context menu) doesn't attach file on Linux
**Thread:** https://community.getmailspring.com/t/send-via-mail-doesn-t-attach-file/14469
**Action:** Reply + mark Resolved

> This is intentional, unfortunately — in v1.21.0 we removed support for the `?attach=` parameter in `mailto:` links as a security hardening measure (it allowed arbitrary local file paths to be attached silently, which opened a potential attack vector). As a result, the Nautilus "Email" context menu no longer triggers an attachment. The workaround is to open a new compose window in Mailspring and drag the file in from the file manager, or use the paperclip icon to browse for it. I know that's less convenient and I'm sorry for the friction — it was a security/usability tradeoff we had to make.

### 12. SMTP test email rejected with 554 (Reply-To triggers spam rule)
**Thread:** https://community.getmailspring.com/t/smtp-test-failing-with-response-code-554/14467
**Action:** Reply

> You've correctly identified the cause — the test email Mailspring sends includes a Reply-To header that matches the From address, and Rspamd flags that as suspicious (the REPLYTO_EQ_TO_ADDR rule). This is a bug in how we construct the test message. As a workaround for now: if IMAP authentication succeeds during setup, you can dismiss or ignore the SMTP test failure and your account should still work for actual sending — the test email is just a check, not a blocker. I'll log this so we can fix the Reply-To on the test message in a future release.

### 13. Contacts — unable to add users
**Thread:** https://community.getmailspring.com/t/contacts-folder-on-pc-not-able-to-add-users/14461
**Action:** Reply + mark Resolved

> To add a contact manually in Mailspring, open the **Contacts** section from the left sidebar, then make sure you have a specific account selected (not "All Contacts" or "Found in Mail") — the "+" button is only enabled when a contact-syncing account like Google or an IMAP/CardDAV account is selected. If you're only on an account that doesn't support CardDAV contact sync, you won't be able to add contacts directly; in that case, adding them through your webmail provider's contacts interface (e.g., Google Contacts at contacts.google.com) will sync them into Mailspring automatically.

### 14. Service Crash on Linux (mailsync.bin fatal error)
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> The "mailsync.bin has encountered a fatal error" dialog you're seeing on Arch/Fedora is the app reporting that the background sync engine crashed and restarted — as you've noticed, it recovers automatically, so mail continues syncing. It's more annoying than harmful. The underlying cause on Linux can be a number of things (SQLite locking under certain kernel configurations, signal handling differences, etc.). The v1.21.1 release included a fix for a SQLite busy-timeout crash that may help — if you're seeing this frequently, please share the Mailspring logs from **Help > Export Logs** so we can see what's happening right before the crash.

### 15. Automatic light/dark theme sync incorrect on KDE
**Thread:** https://community.getmailspring.com/t/automatic-light-dark-theme-sync-issue/14456
**Action:** Reply

> Thanks for the detailed description of the toggle pattern. This is a KDE-specific interaction issue with how Electron receives the `nativeTheme` change event — on KDE Plasma, the signal sometimes fires twice (once for the transition and once for the final state), causing Mailspring to flip twice and land on the wrong theme. We made improvements to the automatic theme system in **v1.22.0** — could you update to the latest version and let me know if it's still happening? If so, I'd like to get more details about your exact KDE version and how you're switching themes (quick settings, a script, etc.).

### 16. 163.com / 126.com emails won't sync (Snoozed folder error)
**Thread:** https://community.getmailspring.com/t/163-com-126-com-emails-won-t-sync/14454
**Action:** Reply

> The `ErrorNonExistantFolder` you're seeing for `Mailspring/Snoozed` means 163.com's IMAP server doesn't allow Mailspring to create that folder — some providers restrict custom folder creation. This will prevent the **Snooze** feature from working, but it shouldn't block general email sync. The CardDAV error (501) means 163.com doesn't support contact syncing from Mailspring either, which is expected — most Chinese providers don't expose CardDAV. If email sync itself is broken beyond just those features, please share your full logs from **Help > Export Logs** and I'll take a closer look.

### 17. JMAP support
**Thread:** https://community.getmailspring.com/t/jmap-support/14487
**Action:** Reply

> JMAP is a great protocol and it's something I'd genuinely like to add eventually — it would significantly improve sync efficiency and could reduce the infrastructure we need for certain pro features. That said, implementing a new protocol in the sync engine is a substantial undertaking, and IMAP + OAuth still covers the vast majority of providers our users connect. I've noted this as a feature request and will keep it in mind as we plan future sync engine work. Thanks for the suggestion!

### 18. Archive subfolders by year/month
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> There's no built-in support for hierarchical archive folders today — Mailspring's archive action sends everything to a single folder. One partial workaround is to use **Mail Rules** with date-based conditions to file incoming mail into year/month folders automatically, though that works on arrival rather than at archive time. Archiving into nested date-based folders is a reasonable feature request; I'll add it to the list. For now, the mail rules approach or keeping everything in one archive folder and using search are the best options available.

### 19. Windows installation error — "problem with your local email database"
**Thread:** https://community.getmailspring.com/t/installation-error/14484
**Action:** Reply

> This error on first launch usually means Windows is preventing the sync engine (`mailsync.exe`) from starting — most commonly because of antivirus or Windows Defender blocking an unsigned binary. A few things to try: (1) Temporarily disable your antivirus and attempt setup again. (2) Right-click the Mailspring installer and choose **Run as administrator**. (3) Check **Windows Event Viewer > Windows Logs > Application** for any entries around the time Mailspring crashes — that often reveals the root cause. (4) If none of those help, delete the Mailspring data folder at `%APPDATA%\Mailspring` and rerun the installer for a clean start. Let me know what you find and I'll help from there.

### 20. Signature image assets overwritten on server
**Thread:** https://community.getmailspring.com/t/bug-signature-image-overwrote-old-assets-on-server/14480
**Action:** Reply

> Thanks for the detailed report. This is a real bug — when a signature with an image is created and then deleted before being assigned to an account, the asset cleanup logic can end up reusing the same asset ID for a subsequent upload, overwriting what's on our servers. That's clearly wrong behavior and I want to get this fixed. I'll look into the specific asset involved and see if we can restore it on the server side. Could you DM me the email address associated with your Mailspring account so I can find the affected asset? I'll also open a fix for the ID collision in the signature workflow.

### 21. Attachments not showing in correct order on Windows
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> You're right that this is inconsistent with most other email clients. The attachment ordering depends on the order the OS reports the files when they're selected or dropped, and Windows File Explorer doesn't always preserve the visual sort order when passing file paths to applications. There's no current UI for reordering attachments after adding them either, which makes this worse. I'll log this as a bug — ideally we'd sort attachments alphabetically (or by the order they were selected) to give predictable behavior. In the meantime, adding files one at a time in the order you want them is the only reliable workaround.
