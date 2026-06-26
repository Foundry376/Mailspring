# Mailspring Discourse Reply Drafts — 2026-06-26

### 1. Automatic light/dark theme doesn't sync correctly with OS
**Thread:** https://community.getmailspring.com/t/automatic-light-dark-theme-doesnt-sync-correctly-with-os/14456
**Action:** Reply + mark Resolved

> Good news — the dark mode transition issue you're describing was fixed in **v1.21.1** (released May 19, 2026). Please update to the latest version and let us know if the toggling behavior is still happening!

---

### 2. Custom automatic themes
**Thread:** https://community.getmailspring.com/t/custom-automatic-themes/14457
**Action:** Reply + mark Resolved

> This shipped in **Mailspring 1.22.0** — you can now choose exactly which themes apply for light vs. dark when you're in Automatic mode, via **Preferences → Appearance**. Thanks again for the idea and the implementation, @Jayphen!

---

### 3. Roles not automatically applied, must run manually
**Thread:** https://community.getmailspring.com/t/roles-are-not-automatically-applied-must-run-manually-to-work/14477
**Action:** Reply

> Thanks for the detailed report. I think I know what's happening here. Mail rules automatically fire on new messages, but they use the `Date:` header from the email itself to decide if a message is "new enough" to process. Forwarded emails typically retain the original `Date:` header from the message they were forwarding — so if the original email was sent before you first launched Mailspring, the rule skips it silently. "Process entire mailbox" bypasses this check entirely, which is why that path works.
>
> This is a real limitation in the current implementation, and I've noted it as something we should improve — ideally by comparing delivery time rather than the message date. For now, "Process entire mailbox" is the reliable workaround for forwarded-email rules.

---

### 4. Inconsistency between deleting single mail and multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-mail-and-multiple-mails/14476
**Action:** Reply

> You're right, this is inconsistent — single-message deletion advances focus automatically but bulk deletion doesn't. I've noted it as a bug to fix. Thanks for the clear reproduction steps!

---

### 5. Building broken with Node.js 26.1.0+ and 24.16.0+
**Thread:** https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475
**Action:** Reply

> Thanks @LinusDierheimer — I'll take a look at bumping `@electron/packager` to 20.0.1 to pull in the fixed extraction dependency. Appreciate the diagnosis and the PR reference!

---

### 6. Attachments not showing in correct order
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> Thanks for the report — you're right that the attachment order doesn't reliably match the order files were selected in the file picker or File Explorer on Windows. This is a bug in how we receive the file list from the OS. I've noted it. In the meantime, adding files one at a time is the workaround to control ordering.

---

### 7. Mailspring not collecting email addresses starting with info@
**Thread:** https://community.getmailspring.com/t/mailspring-not-collecting-and-adding-email-address-starting-with-info/14481
**Action:** Reply

> This is a known quirk with the full-text search index we use for contact autocomplete. Short, common strings like "info" can behave unexpectedly with the underlying SQLite FTS tokenizer. As a workaround, try typing the domain part instead (e.g. `@example.com`) — that tends to surface these contacts reliably. I've noted this as a search issue to investigate further.

---

### 8. Bug: New signature image overwrote old assets on server
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server/14480
**Action:** Reply

> Thanks for the detailed report. The asset ID collision you're describing is a real bug — when a signature is created and then deleted without ever being assigned, the ID can be recycled and overwrite an existing asset on our server. I'll flag this for a fix.
>
> For the immediate issue of the overwritten asset URL on our servers, please email us directly at **support@getmailspring.com** with the asset URL and your account details and we'll sort out the deletion. Sorry for the hassle this caused your team.

---

### 9. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> The Reply All behavior in Mailspring follows the recipients listed in the `To:` and `CC:` fields of the original message. If the email had multiple addresses in `To:` and they all showed up there, Reply All should include all of them. One common edge case: if the message used a distribution list or mailing list address that expands on the server side (so Mailspring only sees the single list address, not the individual recipients), Reply All will only reply to the list address.
>
> Could you share a bit more about how the original email's recipients were structured — were the other addresses in `To:` or `CC:`, or was it a mailing list? That'll help me figure out if this is a bug or expected behavior.

---

### 10. Reply All 123456789
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply + mark Resolved

> The Reply All button is visible in the message toolbar when reading an email — it's the arrow-with-two-heads icon next to Reply. If your default reply type is set to **Reply** (rather than Reply All), it shows up as a secondary button. You can change the default under **Preferences → Composing → Default Reply Type** to make Reply All the primary button. The keyboard shortcut is **Shift+R** as well.

---

### 11. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply + mark Resolved

> Mailspring uses IMAP, which is a pull protocol — the sync engine polls your mail server on a schedule rather than receiving instant push notifications. For most accounts this means new mail appears within a minute or two. There's no manual "check now" button, but you can reduce the polling interval slightly by keeping the app running in the background (rather than suspended).
>
> For time-sensitive things like OTP codes, your phone's native mail app or your provider's own app will be faster since many providers offer a proprietary push mechanism (like Gmail's FCM) that isn't available to third-party IMAP clients.

---

### 12. Can't upgrade (500 error)
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply

> Sorry you hit a 500 error on checkout! We recently moved the payment flow to our website for a better Stripe integration — if you're still seeing the error, please try again at **[getmailspring.com](https://getmailspring.com)** directly. If the issue persists, email us at **support@getmailspring.com** and we'll get you sorted.

---

### 13. Installation error (local email database / mailsync: 0)
**Thread:** https://community.getmailspring.com/t/installation-error/14484
**Action:** Reply

> The "mailsync: 0" error on a fresh install usually means the background sync process exited unexpectedly before it could initialize the database. A few things to try:
>
> 1. Make sure your antivirus or Windows Defender isn't blocking `mailsync.exe` — it's a native process that Mailspring spawns, and security software sometimes quarantines it.
> 2. Try running Mailspring as Administrator once to let it create its database files, then restart normally.
> 3. If you're adding a Microsoft/Outlook account, we fixed an Outlook account setup issue in **v1.22.0** — make sure you're on the latest version.
>
> If none of those help, please share the log file from **Help → Export Logs** and I'll take a closer look.

---

### 14. Archive subfolders
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> Mailspring currently archives to a single folder per account (whichever folder your mail server designates as the archive, or a folder you configure in **Preferences → Accounts → Folder Settings**). There's no built-in support for routing archived mail into date-based subfolders like `archive/2026/01`.
>
> This is a reasonable feature request and I've noted it. For now, the closest workaround would be to create mail rules that move messages to specific folders based on date ranges — though that's admittedly manual to set up.

---

### 15. JMAP support
**Thread:** https://community.getmailspring.com/t/jmap-support/14487
**Action:** Reply

> JMAP is an interesting protocol and I've been watching its adoption with interest. Right now our sync engine is built entirely around IMAP/SMTP, and supporting JMAP would require a significant parallel implementation — it's not something we have planned for the near term. That said, FastMail (one of the few providers with native JMAP support) works very well with Mailspring over IMAP today. I'll note this as a feature request and revisit it as JMAP adoption grows. Thanks for raising it!

---

### 16. Attachments to emails / sending
**Thread:** https://community.getmailspring.com/t/attachments-to-emails-sending/14485
**Action:** Reply + mark Resolved

> To attach a file, open the compose window and click the **paperclip icon** in the toolbar at the bottom of the composer. You can also drag and drop files directly into the compose window. Hope that helps!

---

### 17. IMAP does not work (duplicate inbox)
**Thread:** https://community.getmailspring.com/t/imap-does-not-work/14479
**Action:** Reply + mark Resolved

> Glad it's working now! The two inboxes you're seeing — one labeled as IMAP and one as Gmail — are two separate account entries pointing to the same mailbox. To consolidate, go to **Preferences → Accounts**, remove the plain IMAP account (the one that isn't showing the Gmail branding), and keep only the Google/OAuth account. The Gmail account syncs the same mail but also has access to Gmail-specific features like labels.

