# Mailspring Discourse Reply Drafts — v1.21.1 Release + Support

Generated: 2026-05-21

---

## PART 1 — Bugs Addressed in Recent Releases

These threads describe issues that have been fixed. Reply and close/resolve them.

---

### 1. Package Name Validation Breaks With Uppercase Letters
**Thread:** https://community.getmailspring.com/t/validate-package-name-breaks-with-capitalize-letters/14433
**Fixed in:** v1.21.1
**Action:** Reply + mark Resolved

> Good news — this is fixed in **v1.21.1** (released May 19, 2026)! The package name validation regex has been updated to accept uppercase letters, so themes with capital letters in their package or folder name will install and load correctly again. Please update and let us know if you're still seeing any issues.
>
> Thanks for tracking down the exact commit — that was extremely helpful.

---

### 2. 3rd Party Themes Suddenly Stopped Working
**Thread:** https://community.getmailspring.com/t/3rd-party-themes-suddenly-stopped-working/14440
**Fixed in:** v1.21.1 (root cause same as #14433)
**Action:** Reply + mark Resolved

> This was caused by a package name validation change in v1.21.0 that was stricter to prevent path injection attacks — it rejected any package name containing uppercase letters, which broke some existing themes. **This is fixed in v1.21.1** (released May 19, 2026). Please update and your themes should load again without any renaming needed.

---

### 3. v1.20.0 Keyboard Regression — Shortcuts Firing While Typing (7 duplicate threads)
**Fixed in:** v1.20.1 + v1.21.0

The following threads all describe the same regression where typing in the composer triggered global hotkeys instead of inserting text (backspace archived threads, spacebar starred, "e" archived, etc.). This was fixed in v1.20.1 and further hardened in v1.21.0.

**Primary thread (reply here first, use as canonical):**
- https://community.getmailspring.com/t/hotkey-shortcuts-triggering-while-trying-to-type/14400

**Duplicate threads to reply to and close as duplicate of #14400:**
- https://community.getmailspring.com/t/backspace-inside-draft-composer-archives-the-thread-in-v1-20-0/14410
- https://community.getmailspring.com/t/shortcuts-applied-in-text-editor/14415
- https://community.getmailspring.com/t/keypad-not-working-after-latest-update/14401
- https://community.getmailspring.com/t/reply-textbox-lost-focus-after-upgrading-to-release-1-20-0/14416
- https://community.getmailspring.com/t/keyboard-problem-with-forwarding-mail/14414

**Reply for primary thread #14400:**

> This was a regression introduced in v1.20.0 that caused keyboard events to leak through from the composer into the global keymap. It has been fixed — please update to **v1.21.0** or **v1.21.1** (the latest release as of May 19, 2026) and all keyboard behavior should be back to normal. Apologies for the disruption!

**Reply for duplicate threads (link to #14400):**

> This is a duplicate of https://community.getmailspring.com/t/hotkey-shortcuts-triggering-while-trying-to-type/14400 — the same keyboard regression from v1.20.0. It's been fixed, please update to **v1.21.1** (released May 19, 2026).

---

### 4. Message Sent Unexpectedly Before Clicking Send
**Thread:** https://community.getmailspring.com/t/message-is-unexpectedly-sent-before-i-click-send/14423
**Likely fixed in:** v1.21.0/v1.21.1 (keyboard shortcut in composer + activeMarks fixes)
**Action:** Reply + ask for confirmation after update

> Two things that likely address this:
>
> 1. **Update to v1.21.1**: The v1.20.0–v1.21.0 updates included fixes preventing global keyboard shortcuts from firing inside the composer. It's possible the Enter key (or another shortcut) was triggering send. Please update to **v1.21.1** (released May 19, 2026) and see if the issue recurs.
>
> 2. **Check your send shortcut**: Go to Preferences > Shortcuts and confirm the send shortcut is set to Ctrl+Enter (not just Enter). If "Enter" alone is mapped to send, that could explain accidental sends while typing.
>
> If it happens again after updating, please note the exact key sequence you were typing when the send occurred — that will help us narrow it down.

---

### 5. Database Locked Error on macOS
**Thread:** https://community.getmailspring.com/t/mac-os-26-4-problem/14343
**Fixed in:** v1.21.1 (SQLite busy timeout significantly increased)
**Action:** Reply + mark Resolved

> The SQLite busy timeout has been significantly increased in **v1.21.1** (released May 19, 2026), specifically to prevent "database is locked" errors during IMAP sync, especially when using many accounts at the same time. Please update and let us know if the issue persists.

---

### 6. Database Lock on Large Mailboxes (Pro user who cancelled)
**Thread:** https://community.getmailspring.com/t/database-lock-on-big-mailboxes/14387
**Fixed in:** v1.21.1
**Action:** Reply + offer to reinstate Pro

> Sorry you hit this and ended up cancelling — the underlying cause (SQLite lock timeouts during heavy sync) has been greatly improved in **v1.21.1** (released May 19, 2026). We've adjusted how the sync engine writes to the database, and also adjusted retires to account for heavy multi-account use cases. If you're willing to give it another try, please email us and we'll reinstate your subscription. We'd be glad to have you back.

---

### 7. Mailsync Crash While Streaming Metadata Deltas (HTTP/2)
**Thread:** https://community.getmailspring.com/t/mailsync-crash-while-streaming-metadata-deltas/14278
**Fixed in:** v1.21.0 (HTTP/2 framing error fix in sync engine)
**Action:** Confirm resolution

> Just to confirm: this was fixed in **v1.21.0** (released May 5, 2026) — the HTTP/2 framing errors from the metadata streaming endpoint no longer cause non-retryable crashes. Please update if you haven't already, and let us know if you see any further instability.

---

### 8. Blue Font and Keyboard Only Triggering Shortcuts (ARM Surface Pro)
**Thread:** https://community.getmailspring.com/t/blue-font-and-keys-only-triggering-shortcuts/14420
**Fixed in:** v1.20.1 (keyboard); v1.20.0 explains blue accent color
**Action:** Reply + close

> Thanks for reporting this, I think two separate things are happening here:
>
> **Keyboard issue**: The problem where keys triggered shortcuts instead of typing was a v1.20.0 regression, fixed in **v1.20.1**. Please update to **v1.21.1** (the latest) to get all fixes.
>
> **Blue font/accent**: This is likely the new system accent color feature added in v1.20.0. Mailspring now follows your OS accent color by default — if Windows is set to a blue accent, the app UI adopts it. To revert to the previous behavior (our green accent color): go to **Preferences > Appearance** and uncheck "Use system accent color", or change your Windows accent in Settings > Personalization > Colors.
>
> If the blue font appears and disappears randomly (not correlated with the accent color setting), please let us know — that would point to a different issue.

---

### 9. Reply-To Header Feature Request (Already Shipped!)
**Thread:** https://community.getmailspring.com/t/add-reply-to-header-support-to-the-mailspring-composer/14428
**Shipped in:** v1.21.0
**Action:** Reply + close as implemented

> Great news — your PR #2691 was merged and Reply-To is now a native composer field in **v1.21.0** (released May 5, 2026)! Thank you for the plugin and for submitting the PR — this was a great community contribution. Please update to v1.21.0 or later to use it natively alongside Cc/Bcc.

---

### 10. SMTP Error 296 Cluster (Fixed in v1.17.3) — Many duplicate threads
All of the following describe the same SMTP authentication regression from v1.17.2 that was fixed in v1.17.3:

- https://community.getmailspring.com/t/14135 (primary)
- https://community.getmailspring.com/t/14123
- https://community.getmailspring.com/t/14132
- https://community.getmailspring.com/t/14134
- https://community.getmailspring.com/t/14151
- https://community.getmailspring.com/t/14167
- https://community.getmailspring.com/t/14168

**Reply for any still-open threads:**

> This SMTP authentication issue was introduced in v1.17.2 and fixed in **v1.17.3**. Please update to the latest version (v1.21.1 as of May 19, 2026) — SMTP should work correctly. If you're still seeing Error 296 on a current version, please reply with your provider and Mailspring version and we'll investigate.

---

### 11. Wayland Window Not Opening (Fixed in v1.17.4) — Multiple duplicates

- https://community.getmailspring.com/t/14074 (primary, 32 replies)
- https://community.getmailspring.com/t/14108 (duplicate)
- https://community.getmailspring.com/t/14190 (duplicate)

**Reply for open duplicates:**

> This Wayland issue was fixed in **v1.17.4**. Please update to v1.21.1 (the latest) — if you're still experiencing window display issues on Wayland with a current version, the workaround `--ozone-platform=x11` in your launcher still applies as a fallback. Let us know if you see any further Wayland-specific problems.

---

### 12. Undo Doesn't Restore Deleted Emails (Fixed in v1.19.0)
**Thread:** https://community.getmailspring.com/t/14206

**Reply:**

> This was fixed in **v1.19.0**. Please update to v1.21.1 (latest) — Ctrl+Z should restore archived/deleted emails correctly. Note that undo also appears as a banner at the bottom of the screen immediately after the action, giving you a few seconds to cancel it.

---

### 13. Closing Mailspring Fails / Eats CPU (Flatpak — Fixed)
**Thread:** https://community.getmailspring.com/t/14284

**Reply:**

> This was fixed in the Flatpak packaging — the shell wrapper script now correctly forwards signals to child processes so `mailsync.bin` doesn't stay running after the app closes. Please run `flatpak update mailspring` and the orphaned process issue should be resolved.

---

### 14. New Mail Notification Click Doesn't Open App — Windows (Fixed in v1.19.1)
**Thread:** https://community.getmailspring.com/t/14326

> This was fixed in **v1.19.1** earlier this year. Please update to v1.21.1 and Windows notification clicks should open the app correctly.

---

### 15. Move-to Search Hangs 20-30 Seconds (Self-resolved)
**Thread:** https://community.getmailspring.com/t/14407

> Glad to hear this resolved itself — it was likely related to SQLite contention during sync. The SQLite busy timeout has been increased further in **v1.21.1** which should prevent similar hangs going forward.

---

## PART 2 — Active Bug Reports Needing Help

---

### 16. External Links Not Opening After 1.21.0 (macOS)
**Thread:** https://community.getmailspring.com/t/external-link-clicks-not-working-after-1-21-0-update/14438
**Action:** Reply + investigate

> The v1.21.0 security update tightened restrictions on `file://` URIs in email content — standard `http://` and `https://` links are not affected by that change. A few things to try:
>
> 1. **Check your macOS default browser**: Go to System Settings > Desktop & Dock > Default web browser and confirm Chrome is selected. If no default is set, `shell.openExternal` can fail silently on macOS.
>
> 2. **Check the developer console**: In Mailspring, go to Developer > Toggle Developer Tools > Console tab, then click a failing link. If an error appears, please paste it here.
>
> 3. **Try right-clicking a link**: Does "Open Link" in the context menu work?
>
> 4. **Try a fresh install**: Download v1.21.1 directly from getmailspring.com (rather than in-app update) — some macOS security entitlements can get confused after in-place updates.
>
> Any additional details (do all HTTP links fail, or specific ones? Does it work in a new email?) would help narrow this down.

---

### 17. Read Receipts Not Working — Multiple Threads

**Primary thread:** https://community.getmailspring.com/t/read-receipt-isnt-working/14431
**Related:** https://community.getmailspring.com/t/read-receipts-have-stopped-working/14042
**Related:** https://community.getmailspring.com/t/read-receipts-for-free/14087
**Older:** https://community.getmailspring.com/t/9225, /t/9354, /t/6074, /t/4679, /t/14043

**Reply for #14431 (most detailed):**

> Thanks for reporting this! A few things to check:
>
> 1. **It's a per-email toggle**: Read receipts are enabled individually for each email you send. Look for the **eye icon** in the composer toolbar when composing — click it so it turns blue/active before sending. If it's grey, tracking is off for that email.
>
> 2. **Pro subscription**: Read receipts require a Pro subscription (free accounts get a limited number per week). If you've subscribed but things still look wrong, try signing out and back in at Preferences > Mailspring ID.
>
> 3. **HTML emails only**: The feature injects a tracking pixel, so it won't work if you're composing in plain text mode.
>
> 4. **Recipient filtering**: Many corporate mail servers and clients strip tracking pixels, so even with everything set up correctly, the receipt may not fire depending on who you're emailing. In Gmail, recipients may need to have "Allow images from this sender" enabled. It's often nice to use read receipts in conjunction with link tracking because link tracking is harder to circumbent and very reliable across email apps.
>
> If the eye icon turns blue when you click it but receipts never arrive, try emailing yourself and verify that you receive a notification when you open the email.

**Reply for #14042 (close as duplicate):**

> Please see this thread for troubleshooting steps: https://community.getmailspring.com/t/read-receipt-isnt-working/14431 — the short version is that read receipts need to be enabled per-email using the eye icon in the composer toolbar. Let us know if you're still stuck after checking those steps.

**Reply for #14087 (IMAP return-receipt question):**

> Mailspring's read receipts work via a tracking pixel (web beacon) rather than the older IMAP `Return-Receipt-To` / `Disposition-Notification-To` header approach. The IMAP-based return receipts require the *recipient's* mail client to actively send back a response, which most modern clients don't do automatically. The tracking pixel approach is more reliable in practice. Both are Pro features in Mailspring. You can read more about how it works [here](https://community.getmailspring.com/t/read-receipts-link-tracking-and-activity-reports/162).

**Reply for older read-receipt threads (9225, 9354, 6074, 4679, 14043):**

> Please see the troubleshooting guide here: https://community.getmailspring.com/t/read-receipt-isnt-working/14431 — the most common cause is that read receipts need to be explicitly enabled per-email via the eye icon in the composer toolbar.

---

### 18. Window Size Not Remembered on Linux
**Thread:** https://community.getmailspring.com/t/mailspring-doesnt-remember-window-size-linux/14229

> This is a known issue on Linux under Wayland, unfortunately — the compositor doesn't honor window position/size hints consistently, and doesn't allow the application to move its own windows. (Though it can resize them, go figure...) I'm hoping improvements in Wayland and in Electron's Wayland support get us closer to full window state save/restore behavior in future releases.

---

### 19. Dark Theme Accent Color Changed from Green to Blue
**Thread:** https://community.getmailspring.com/t/what-happened-to-dark-theme-with-green-accent-colors/14417

> This changed in **v1.20.0**, which added system accent color support — Mailspring now follows your OS accent color by default. If your system accent is blue (which is GNOME's default on Fedora and many Linux distros), the app UI adopts it.
>
> To get your green accent back:
>
> - **Change system accent**: On GNOME, go to Settings > Appearance and pick a green accent. On Fedora 42+, it's in Settings directly. On older GNOME, use `gnome-tweaks`.
> - **Disable system accent in Mailspring**: Go to **Preferences > Appearance** and uncheck "Use system accent color" — this reverts to the theme's built-in accent color.

---

### 20. Unread Emails Auto-Marked as Read
**Thread:** https://community.getmailspring.com/t/unread-emails-show-as-read-automatically/14409

> Check your reading preferences: go to **Preferences > Reading** and look at "Mark messages as read after displaying for ___ seconds." It may be set to 0 (mark read immediately on click) or a very short interval. You can increase it or set it to "Never" to mark messages read only when you explicitly choose to.

---

### 21. Cannot Add Mailo Account (Endless Spinner)
**Thread:** https://community.getmailspring.com/t/add-account-with-french-mailo-provider/13947

> Mailo uses standard IMAP/SMTP — here are the server settings to use if auto-detection is looping:
>
> - **IMAP**: `imap.mailo.com`, port 993, SSL/TLS
> - **SMTP**: `smtp.mailo.com`, port 587, STARTTLS
>
> In the account setup screen, after the auto-detection spins without success, look for a **"Manual Setup (IMAP/SMTP)"** option or wait for the timeout error, which should offer manual entry. Enter your full Mailo email as the username and your Mailo password.
>
> If you have two-factor authentication enabled on your Mailo account, you'll need to generate an app password from the Mailo security settings first.

---

### 22. Cannot View Translated Message on macOS
**Thread:** https://community.getmailspring.com/t/cannot-view-translated-message-on-macbook/14442

> A few things to try:
>
> 1. **Scroll to the top of the email**: The translation replaces the email body and the scroll position sometimes stays at the bottom after it renders
> 2. **Toggle the translation off and on**: Click the translation button to dismiss, then click again to re-translate
>
> If none of those help, please share what language the original email is in — this will help us determine if it's a specific language pair issue or a rendering bug.

---

### 23. Color Pixelation / Distortion
**Thread:** https://community.getmailspring.com/t/color-pixelation-distortion/14439

> Dark mode CSS improvements were included in **v1.21.1** (released May 19, 2026) — please update and see if the rendering artifacts improve.
>
> If they persist, these kinds of artifacts are sometimes GPU-related. Try launching with `--disable-gpu` to rule out GPU acceleration as the cause. On Windows: right-click your Mailspring shortcut > Properties and add `--disable-gpu` to the Target field.
>
> Could you also share your OS and display setup (resolution, HiDPI/scaling)? That will help narrow it down.

---

### 24. Sent Mail Not Showing Unless Searched (macOS)
**Thread:** https://community.getmailspring.com/t/sent-mail-not-showing-up-unless-searched-for/14321

> This is usually a folder mapping issue. Go to **Preferences > Accounts > [your account] > Folder Settings** and verify the "Sent" role is mapped to the correct server-side folder. For Gmail it should be `[Gmail]/Sent Mail`; for Outlook it's typically `Sent Items`.
>
> If the mapping looks correct, try **Preferences > General > Reset Cache** — this forces a full re-sync from the server and often resolves folder display gaps.

---

### 26. Autostart on Windows Not Working
**Thread:** https://community.getmailspring.com/t/autostart-with-windows-not-working/14298

> This is a known Windows issue where the login item registration can fail or get cleared after updates. As a reliable workaround:
>
> 1. Open `%AppData%\Microsoft\Windows\Start Menu\Programs\Startup` in File Explorer
> 2. Create a shortcut to the Mailspring executable (usually `%LocalAppData%\mailspring\app-X.X.X\Mailspring.exe`)
> 3. Add `--background` to the shortcut's target so it starts minimized to the system tray
>
> This persists across updates and is more reliable than the built-in setting on Windows.

---

### 29. Outlook "No Email Mailbox Associated"
**Threads:** https://community.getmailspring.com/t/9335, /t/14029

> This error means the Microsoft account doesn't have an active Exchange mailbox provisioned, or IMAP access isn't enabled. Things to check:
>
> - **Personal accounts** (@outlook.com, @hotmail.com): Log into outlook.live.com > Settings > View all Outlook settings > Mail > Sync email > enable "Let devices and apps use IMAP"
> - **New accounts**: A brand-new Microsoft account sometimes needs to be logged into Outlook on the web once before the mailbox is provisioned
> - **Work/school accounts**: Your IT admin needs to enable IMAP access in the Exchange admin center
>
> If none of those apply, try removing and re-adding the account, or use manual IMAP setup with `imap-mail.outlook.com` (personal) or `outlook.office365.com` (work).

---

### 30. Office 365 / Exchange Account Setup Failures
**Threads:** https://community.getmailspring.com/t/3998, /t/5994, /t/6895

> Office 365 account setup guidance was improved in **v1.20.0** with updated documentation and prompts. The key things for O365 accounts:
>
> 1. **Use OAuth (recommended)**: In account setup, select "Office 365 / Outlook" and complete the OAuth flow — this is the most reliable method
> 2. **Enable IMAP**: Make sure that you've enabled IMAP and SMTP in your Outlook settings. If you don't see the SMTP option, Outlook may be entirely blocking you from using third-party email clients to send mail.
>
> Note: Microsoft has deprecated basic authentication for Exchange, so OAuth is the preferred path going forward.

---

### 31. Missing Strings in Translation Source Files
**Thread:** https://community.getmailspring.com/t/missing-strings-in-translations-source-files/14436

> Thanks for documenting these — this is genuinely helpful for our localization community! We'll do a pass through `app/lang/en.json` to add the missing strings you've identified (grammar check, swipe gestures, appearance options, etc.) in an upcoming update.
>
> In the meantime, if you're actively working on a translation, you can add the missing keys directly to your language file using the English text as the value — they'll display correctly once the source file is updated and the strings will flow into the official translation workflow.

---

### 33. Undo Send Banner Not Appearing
**Thread:** https://community.getmailspring.com/t/undo-pop-up-banner-gone-when-sending/14283

> Please check **Preferences > Sending** and confirm "Undo Send" is enabled with a delay (e.g., 10 seconds). If it's enabled but the banner doesn't appear, could you share your OS and Mailspring version? Is this specific to the inline composer or the pop-out (full window) composer? That'll help us figure out if it's a display rendering issue.

---

### 34. "Return to Conversation List" Shortcut Still Broken in v1.20.1
**Thread:** https://community.getmailspring.com/t/return-to-conversation-list-shortcut-broken/14389

> Could you share more details about where this fails for you? Specifically:
> - Your OS and Mailspring version
> - Which view you're in when you press the shortcut
> - What happens (nothing? navigates somewhere unexpected?)
>
> Also, please try updating to **v1.21.1** and let us know if the behavior changes. The fix that landed in v1.20.0 addressed one specific flow — if it's still broken in another flow we want to track it down.

---

### 35. Outlook OAuth Reconnect Loop
**Thread:** https://community.getmailspring.com/t/outlook-oauth-reconnect-loop/14396

> When an Outlook OAuth token expires and the re-auth loop doesn't complete cleanly, the most reliable fix is a full re-auth:
>
> 1. Go to Preferences > Accounts and remove the Outlook account
> 2. Visit [Microsoft My Apps](https://myapps.microsoft.com) > revoke Mailspring's access
> 3. Re-add the account in Mailspring from scratch via OAuth
>
> This forces a clean token issuance. The re-auth loop should handle this automatically — we're looking at improving the recovery flow for expired tokens to avoid this manual process.

---

### 36. Calendar Recurring Events Not Shown
**Thread:** https://community.getmailspring.com/t/calendar-recurring-events-not-shown/14281

> Recurring events added after the last sync now appear correctly (fixed in v1.19.0). For existing recurring events that were already in your calendar before that fix, a full resync is needed: go to Preferences > Accounts, remove and re-add your calendar account to pull fresh data. We know that's not ideal and we're working on an in-app "Resync Calendar" button.

---

### 37. Home/End Keys Require Double-Press in Composer
**Thread:** https://community.getmailspring.com/t/hitting-home-key-or-end-key-takes-two-hits-instead-of-one/14230

> This was fixed via PR #2644. Please update to **v1.21.1** and Home/End should jump to the start/end of line on the first press.

---

### 38. Spell Check Not Working on Windows
**Threads:** https://community.getmailspring.com/t/spell-check-not-working/4762, /t/14046

> Spellcheck in the rich text composer on Windows was overhauled in a release earlier this year to use the system spellcheck system. If you're still encountering spellcheck issues, try updating to the latest version, 1.21.1!

---

### 39. Multiple Mailspring Instances / Sync Conflicts
**Thread:** https://community.getmailspring.com/t/multiple-mailspring-instances-accessing-same-imap-mailbox/14225

> IMAP is designed to be used from multiple clients simultaneously — that's not the issue here. For the missing emails (350 messages from one month): try **Preferences > General > Reset Cache** on the affected machine to force a full re-sync from the server. If messages are also missing from the IMAP server itself (you can verify by checking in your webmail), they may have been accidentally deleted and moved to Trash.
>
> Using Mailspring on multiple computers with the same IMAP account is fully supported and shouldn't cause data loss.

---

### 40. Phantom Unread Count
**Thread:** https://community.getmailspring.com/t/unread-count-still-on-without-unread-messages/350

> The quickest fix for phantom unread counts is **Preferences > General > Reset Cache** — this rebuilds the local database from the server and usually clears the discrepancy. If it recurs frequently, try manually marking all as read in the affected folder, which forces a sync of the read state to the server.

---

### 41. White Screen of Death
**Thread:** https://community.getmailspring.com/t/white-screen-of-death/1450

> If you're still experiencing blank white/black screens in 2026, please first update to **v1.21.1**. If it persists, try launching with `--disable-gpu` (add to your shortcut/launcher) to rule out GPU acceleration as the cause. Also, if you have multiple monitors with different scaling factors, try running Mailspring on the primary display only to see if that affects it.
>
> If it's consistently reproducible, the developer tools console (Developer > Toggle Developer Tools) often shows the error that caused the blank screen.

---

### 42. The Eternal Sync Bug / Stuck Scanning
**Threads:** https://community.getmailspring.com/t/the-eternal-sync-bug/334, /t/6335

> **v1.21.1** includes an increased SQLite busy timeout that should reduce sync stalls significantly. Steps to try:
>
> 1. Update to **v1.21.1**
> 2. **Preferences > General > Reset Cache** to rebuild the local database
> 3. **Exclude Mailspring from antivirus real-time scanning** — antivirus tools scanning SQLite WAL files during writes is a very common cause of stuck syncs
> 4. For very large mailboxes (100k+ messages), initial sync genuinely takes many hours — leaving it running overnight often resolves it
>
> For Zoho IMAP specifically: ensure IMAP is enabled in Zoho settings (Settings > Mail Accounts > IMAP Access) and use an app-specific password if MFA is enabled.

---

### 43. Duplicate Sent Mail (Outlook/Microsoft)
**Thread:** https://community.getmailspring.com/t/duplication-of-sent-mail/275

> This is a long-standing known issue with Microsoft/Outlook accounts — Outlook's server automatically saves sent messages to Sent, but often does it very slowly. Mailspring thinks the server will not save a copy, and saves its own to ensure the sent message is not lost, resulting in duplicates.
>
> **Workaround**: Go to outlook.live.com (or Outlook on the web for work accounts) > Settings > Mail > Compose and reply > disable **"Save copies of messages in the Sent Items folder"**. This lets Mailspring manage the sent copy exclusively.
>
> I'll see if we can include a broader fix for this in an upcoming relase.

---

### 44. Gmail Signatures Not Showing in Message View
**Threads:** https://community.getmailspring.com/t/gmail-signatures-not-showing-in-message-view/682, /t/14380

> Gmail's server-side signatures (set in Gmail web settings) are appended to emails by Gmail's servers, Mailspring's own signature system (Preferences > Signatures) is independent of Gmail's server-side signature. I'll see if we can support reading and displaying your Gmail-configured signature in the composer in future releases.

---

### 45. Windows Notification Click Doesn't Open App
**Thread:** https://community.getmailspring.com/t/new-mail-notification-open-directly-by-clicking-on-the-notification/8079

> This should be fixed in the 1.21.0 release thanks to an upstream fix in the Electron projct. Please download the latest version and let me know if you're still running into issues!

---

### 46. Mailspring Not in Windows Default Apps List
**Thread:** https://community.getmailspring.com/t/mailspring-not-available-as-default-mail-client-on-windows/8815

> A few things to try:
>
> 1. **Re-run the latest installer** from getmailspring.com — this re-registers protocol handlers and should add Mailspring to the Default Apps list
> 2. **Set via protocol**: Search "Default apps" in Windows Start > scroll to "Email" > select Mailspring
> 3. **For `mailto:` links**: Search "Default apps" > scroll down to "Choose default apps by protocol" > find `MAILTO` > select Mailspring
>
> If re-running the installer still doesn't help, please share your Windows version and we'll look into the registration issue.

---

### 47. Shared Office 365 Inbox
**Thread:** https://community.getmailspring.com/t/shared-inbox-for-office-365-account/1594

> Shared Mailboxes in Microsoft 365 aren't a first-class account type, but you can add one as a regular IMAP account:
>
> 1. In the Microsoft 365 admin center, assign a direct login password to the shared mailbox
> 2. Enable IMAP/SMTP AUTH on it (Exchange admin > Recipients > Mailboxes > [shared mailbox] > Email apps > enable IMAP)
> 3. In Mailspring, add it as a manual IMAP/SMTP account using the shared mailbox email address and the password you set
>
> Note: Microsoft has deprecated basic SMTP auth for most tenants — you may need an Admin to enable "SMTP AUTH" specifically for the shared mailbox in your Exchange tenant security settings.

---

### 48. Window Not Opening on Startup / Application Window Doesn't Appear
**Thread:** https://community.getmailspring.com/t/the-application-window-does-not-appear/14201

> This was a Wayland issue fixed in v1.17.4. If you're on a current version and still seeing this, add `--ozone-platform=x11` to your launcher arguments as a fallback. Also check your compositor/desktop environment version — some KDE/GNOME Wayland versions have known issues with Electron window activation.

---

### 50. Cannot Find How to Delete an IMAP Account
**Thread:** https://community.getmailspring.com/t/deleting-an-imap-account/14090

> Go to **Preferences > Accounts**, click on the account you want to remove, and look for a **-** button in the bottom left of the account list. This removes it from Mailspring without affecting mail on the server.

---

### 52. How to Set Per-Account Signatures
**Thread:** https://community.getmailspring.com/t/how-to-set-different-signatures-for-each-email-account/14056

> Go to **Preferences > Signatures**. Create a signature for each account, then use the account dropdown at the top right of the signature editor to assign it. Mailspring will automatically use the assigned signature when composing from that account.

---

### 54. Mailing Groups / Mac Contacts Groups
**Thread:** https://community.getmailspring.com/t/mailing-groups/14312

> Mailspring doesn't currently import contact groups from macOS Contacts directly. We support importing contact groups from Google Contacts for Gmail accounts, and from other CARDDAV compatible email providers. I'll see if we can support import from macOS contacts in the near future.

---

### 55. Import Google Contacts
**Thread:** https://community.getmailspring.com/t/import-google-contacts/14275

> Mailspring automatically syncs Google Contacts when you add a Gmail account — no manual import needed. Contacts appear in autocomplete when composing. If they're missing, try **Preferences > General > Reset Cache** to force a contacts re-sync.

---

### 56. Moving Messages Between Accounts
**Thread:** https://community.getmailspring.com/t/moving-messages-between-accounts/9519

> Moving emails between IMAP accounts isn't directly supported (IMAP mailboxes are separate stores with no protocol-level "move between accounts" operation).
>
> **Workaround**: Right-click a message > **Export as EML** (added in v1.20.0), then in the destination account, import the EML file by dragging it into Mailspring. It works for individual messages, though it's not seamless for bulk operations.

---

### 57. Delete Individual Autocomplete Suggestions
**Thread:** https://community.getmailspring.com/t/when-typing-email-address-to-send/14384

> There's no per-entry delete in the autocomplete dropdown currently. Suggestions come from:
> - Imported contacts (Preferences > Accounts > Manage contacts — you can delete entries there)
> - Previous recipients tracked by the app
>
> For "previous recipient" entries, **Preferences > General > Reset Cache** will clear them (along with other cached data). Per-entry removal from the dropdown is a reasonable feature request that we'd like to add.

---

### 58. Progressively Blurry UI
**Thread:** https://community.getmailspring.com/t/blurry-ui-even-after-reinstall-and-rollback/14122

> This sounds like a display scaling/DPI issue. Things to try:
>
> 1. Launch with `--force-device-scale-factor=1` to override automatic scaling
> 2. On Windows: right-click Mailspring.exe > Properties > Compatibility > Change high DPI settings > try "System (Enhanced)"
>
> Could you share your OS, display resolution, and whether you use custom display scaling? That would help us understand if it's a specific Electron rendering issue.

---

### 59. Transfer Settings Between PCs
**Thread:** https://community.getmailspring.com/t/transfer-settings-between-multiple-pcs/14062

> Mailspring's settings and rules are stored in:
> - **Linux/macOS**: `~/.config/Mailspring/`
> - **Windows**: `%AppData%\Mailspring\`
>
> Copy that folder to the same location on the new machine (with Mailspring closed on both). Account credentials are stored in the system keychain, not in these files — you'll need to re-enter passwords on the new machine, but all rules, templates, and preferences will carry over.

---

### 60. All Accounts Disappeared
**Thread:** https://community.getmailspring.com/t/sudden-loss-of-all-my-email-accounts/14054

> Unfortunately there's no automatic recovery when the account store gets cleared — accounts need to be re-added manually. To prevent this in future: periodically back up `~/.config/Mailspring/` (Linux/macOS) or `%AppData%\Mailspring\` (Windows).
>
> If you're a Pro subscriber and lost access to your subscription alongside the accounts, email us and we'll sort it out.

---

### 61. Emails Not Sending / Going to Draft (Sync Issues)
**Thread:** https://community.getmailspring.com/t/emails-go-to-draft-instead-of-sending/9416

> If emails are saving to draft instead of sending, check:
> 1. SMTP credentials are correct (Preferences > Accounts > [account] > Connection Settings)
> 2. The SMTP server and port are reachable (try sending from webmail to confirm)
> 3. Update to **v1.21.1** — sync engine stability improvements may help
>
> Also try **Preferences > General > Reset Cache** which sometimes resolves stuck send queues.

---

### 62. iCloud IMAP Email Delivery Fails
**Thread:** https://community.getmailspring.com/t/icloud-imap-email-delivery-fails/2207

> For iCloud, make sure you're using an **app-specific password** (not your Apple ID password). Generate one at appleid.apple.com > Sign-In and Security > App-Specific Passwords. Use:
> - IMAP: `imap.mail.me.com`, port 993, SSL
> - SMTP: `smtp.mail.me.com`, port 587, STARTTLS
> - Username: your iCloud email (e.g. `yourname@icloud.com`)
> - Password: the app-specific password you generated

---

### 64. Possible Trojan False Positive (DrWeb)
**Thread:** https://community.getmailspring.com/t/virus-trojan-js-siggen5-on-mailspring-pro/14039

> This is a false positive. The detection is triggered by the `es5-ext` JavaScript library bundled in Mailspring, which displays an anti-war message — this was flagged as suspicious behavior by some AV engines. The library has since been updated. Please update to **v1.21.1** and the detection should no longer occur. You can also add Mailspring's directory to your DrWeb exclusions.

---

## PART 3 — Duplicate Clusters to Close

These threads are duplicates of each other or of canonical answered threads. Reply with a pointer to the canonical thread and close/mark as duplicate.

| Duplicate Thread | Canonical Thread | Status |
|---|---|---|
| /t/14042 (read receipts) | /t/14431 | Reply + close |
| /t/14087 (read receipts free) | /t/162 (docs) + /t/14431 | Reply with explanation |
| /t/9225, /t/9354, /t/6074, /t/4679, /t/14043 (old read receipt threads) | /t/14431 | Reply + close |
| /t/14410 (backspace archives) | /t/14400 (keyboard regression, fixed) | Reply + close |
| /t/14415 (shortcuts in text editor) | /t/14400 | Reply + close |
| /t/14401 (keypad not working) | /t/14400 | Reply + close |
| /t/14416 (reply textbox lost focus) | /t/14400 | Reply + close |
| /t/14414 (keyboard forward) | /t/14400 | Reply + close |
| /t/14403, /t/14404 (spacebar shortcuts) | /t/14400 | Reply + close |
| /t/14440 (themes stopped working) | /t/14433 (root cause, fixed in v1.21.1) | Reply + close |
| /t/14108, /t/14190 (Wayland no window) | /t/14074 (fixed in v1.17.4) | Reply + close |
| /t/14280, /t/14055 (hide folders) | /t/14068 | Reply + close |
| /t/14395, /t/14025, /t/14026 (Gmail not syncing) | /t/14265 | Reply + close |
| /t/14380 (Gmail signatures) | /t/682 | Reply + close |
| /t/8395 (search + trashed messages) | /t/915 | Reply + close |
| /t/14148 (SMTP auth v1.17.2) | /t/14124 (fixed in v1.17.3) | Reply + close |
| /t/14123, /t/14132, /t/14134, /t/14151, /t/14167, /t/14168 (SMTP 296) | /t/14135 (fixed in v1.17.3) | Reply + close |
| /t/14046 (spell check Windows) | /t/5492 / /t/4762 | Reply + close |
| /t/14029 (Outlook no mailbox) | /t/9335 | Reply + close |
| /t/14321, /t/14252 (sent mail missing) | Merge into one answer | Reply both |
