# Mailspring Discourse Reply Drafts — 2026-06-12

---

## New topics this week

### 1. Bug: New signature image overwrote old assets on Mailspring server
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server/14480
**Action:** Reply

> Thanks for reporting this — that's a serious asset-management bug. When you created and then deleted the new signature before assigning it to an account, the upload still went through and appears to have been assigned an ID that collided with one of your existing signature images, silently overwriting it on our servers.
>
> I'll look into how asset IDs are assigned during signature creation to prevent this collision from happening in the future. In the meantime, to get your original image restored, please email **support@getmailspring.com** with your Mailspring account email and a description of the signature that was overwritten — include the approximate date it was originally uploaded if you know it. We can purge the bad asset so the CDN URL stops serving the wrong image.
>
> Sorry for the trouble with your shared account — this shouldn't have happened.

---

### 2. Roles are not automatically applied, must run manually to work
**Thread:** https://community.getmailspring.com/t/roles-are-not-automatically-applied-must-run-manually-to-work/14477
**Action:** Reply

> There are two things that could explain this. First, Mailspring only runs mail rules automatically on messages whose `Date:` header is newer than the timestamp stored when Mailspring was first launched — this filter exists to avoid re-processing old email during the initial sync. If your Domain Aggregate Reports are composed with a date that predates that cutoff, they'd be silently skipped by the automatic trigger even though they pass the condition check. "Process Entire Mailbox" bypasses this date filter, which is why it works there.
>
> Second, when Gmail receives a forwarded/redirected message, it may rewrite the `To:` header to show your Gmail address rather than the original `dev@mydomain.com`. Mailspring's `To` condition matches only the `To:` header — not `X-Original-To` or `Delivered-To`. You can test this by opening one of the arriving reports in Mailspring, clicking the message header area to expand it, and checking what the `To:` field actually shows.
>
> If the To header has been rewritten to your Gmail address, switching the rule condition to match on **From** (the DMARC report sender) or a **Subject** keyword will be much more reliable.

---

### 3. Inconsistency between deleting single mail and multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-mail-and-multiple-mails/14476
**Action:** Reply

> That's a valid inconsistency — when you delete a single thread the next one in the list is automatically selected, but bulk delete leaves nothing selected. They should behave the same way. I'll note this as a UI bug to fix. Thanks for the detailed report (version + OS + install method is exactly what's useful).

---

### 4. Building is broken with Node.js 26.1.0+ and 24.16.0+
**Thread:** https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475
**Action:** Reply

> Thanks for tracking this down, Linus — and for the specific fix. I can confirm we're on `@electron/packager` 18.3.6 and the `extract-zip` 2.0.1 dependency is indeed the issue. Upgrading to `@electron/packager` 20.0.1 is the right call; I'll get that bumped. PRs welcome if you want to send one, otherwise I'll get it in shortly.

---

### 5. Can't upgrade (500 internal server error on Stripe)
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply

> Sorry about that — a 500 on our side means something went wrong with the payment processing backend, not with your card or Stripe itself. Please email **support@getmailspring.com** with the browser you were using and roughly what time you tried, and we'll look into what happened on our end and get your upgrade sorted.

---

### 6. Mailspring on ChromeOS
**Thread:** https://community.getmailspring.com/t/mailspring-on-chromeos/14473
**Action:** Reply

> Mailspring on ChromeOS runs inside the Linux (Crostini) container, which isn't a configuration we actively test against, so your mileage will vary. The keyring and connection issues you're describing are common in that environment — the Crostini container doesn't run GNOME Keyring by default, which causes Mailspring to fail on startup when it can't securely store credentials.
>
> Two things worth trying:
> 1. Launch Mailspring with `--password-store=basic` (add this to the desktop shortcut command) — this skips the keyring and stores credentials locally. It's less secure but will get the app running.
> 2. Or install and start GNOME Keyring in your Crostini container: `sudo apt install gnome-keyring` and then run `eval $(gnome-keyring-daemon --start --components=secrets)` before launching Mailspring.
>
> Native ChromeOS support with proper keyring integration isn't on the roadmap right now, but the workarounds above should at least make it usable.

---

### 7. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply

> Mailspring uses **IMAP IDLE** to receive new email — the sync engine keeps an open connection to your mail server and waits for the server to push a notification when new mail arrives. How fast this feels depends on your provider: Gmail and Fastmail are typically quick; some providers have longer IDLE timeouts or don't implement it well.
>
> You can trigger an immediate sync at any time with **F5** (on all platforms) — this is useful when you're waiting for something time-sensitive like an OTP code. For OTPs specifically, I'd suggest keeping a browser tab or your phone's native app open alongside Mailspring, since those often get push delivery from the provider faster than third-party IMAP clients can.

---

### 8. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> Thanks for the report — could you share a bit more detail to help narrow this down? Specifically:
> - When the reply only went to the first recipient, was the big **Reply** button used, or **Reply All** (the secondary option from the arrow dropdown)?
> - Was the original group email sent with multiple addresses in the **To** field, or was it one address in **To** with many addresses in **CC**?
>
> The reason I ask: Mailspring's "Reply All" preference sets the *default* action for the main reply button when the message has multiple participants. If the message only had a single address in `To` (with recipients in `CC`), the button behavior differs from a message with several direct `To` addresses. Knowing which case you hit will help identify whether this is a settings issue or something we need to fix.

---

## Previously drafted — not yet posted

### 9. Send via mail opens new email dialog but doesn't attach file
**Thread:** https://community.getmailspring.com/t/send-via-mail-opens-new-email-dialog-but-doesnt-attach-file/14469
**Action:** Reply

> Thanks for the report. This is a known regression introduced in **v1.21.0** as part of a security audit. Support for the `?attach=` / `?attachment=` parameter in `mailto:` links was intentionally removed (#2703) because it could be exploited to attach arbitrary local files via a malicious link in an email. Unfortunately this also breaks the legitimate "Send via mail" workflow in Nautilus and other file managers on Linux.
>
> We understand this is frustrating for everyday use. I've noted this thread and we'll look at whether we can re-enable the feature with proper path sandboxing in a future release. In the meantime there's no workaround short of attaching the file manually after the compose window opens.

---

### 10. SMTP test failing with response code 554
**Thread:** https://community.getmailspring.com/t/smtp-test-failing-with-response-code-554/14467
**Action:** Reply

> The 554 rejection is coming from your own mail server's Rspamd filter, not from Mailspring itself. The rule `REPLYTO_EQ_TO_ADDR` fires when an email's Reply-To header matches its To address, which Rspamd treats as a spam signal. Mailspring sends a short test message during account setup to verify the SMTP connection, and that test email appears to be triggering this rule.
>
> The quickest fix is on your server side: adjust the Rspamd score for `REPLYTO_EQ_TO_ADDR` (set it lower or to a negative weight for your own domain), or add a whitelist entry for messages sent from your own address to itself. Once you've added the account successfully, outgoing mail from your normal address shouldn't trigger this rule.

---

### 11. Installation/running issues on Debian stable (.deb, snap)
**Thread:** https://community.getmailspring.com/t/installation-running-issues-on-debian-stable-deb-snap/14463
**Action:** Reply

> There are two separate issues here. The `chrome-i18n manifest` error usually means the installation is incomplete or partially corrupted — a clean reinstall of the `.deb` package typically clears it.
>
> The keyring failure on Parrot/Debian is a common Linux issue. Make sure `gnome-keyring` and `libsecret-1-0` are installed, then start a keyring session before launching Mailspring:
> ```
> eval $(gnome-keyring-daemon --start --components=secrets)
> ```
> If you'd prefer to skip the keyring entirely, you can launch Mailspring with `--password-store=basic`, which stores credentials in a local (unencrypted) file instead. I'd recommend the gnome-keyring route if possible, but `--password-store=basic` will at least get you running.
>
> The snap version has stricter sandboxing that can interfere with keyring access, so the `.deb` package is generally a better choice on Debian-based distros.

---

### 12. Service Crash (mailsync.bin fatal error on Linux)
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> Thanks for the reports — I can see this affecting Arch and Fedora users on 1.21.1. **v1.21.1** includes a fix for a sync engine crash that occurred during many-account sync (increased the SQLite busy timeout), which may be related if you have more than one account configured.
>
> If you're still seeing this on 1.21.1 and the crash-then-restart cycle is frequent, it would help to see the mailsync log. On Linux you can find it at `~/.config/Mailspring/logs/mailsync-[account].log` — if you're willing to share the tail of that file (sanitized of any credentials) either here or as a GitHub issue, I can take a closer look at the root cause.

---

### 13. Compose Key not fully working (Ubuntu snap, German characters)
**Thread:** https://community.getmailspring.com/t/compose-key-not-fully-working/14458
**Action:** Reply

> This is a known pain point — Electron processes key events through its own input stack, which can shorten the window available for multi-key compose sequences like Right-Ctrl → " → o. The Snap package adds an extra layer of input event handling due to its confinement model, which can make this worse. If you haven't tried it, I'd recommend installing the **.deb package** from [getmailspring.com](https://getmailspring.com) directly instead of Snap — many users on Ubuntu report significantly better keyboard behavior outside of the Snap sandbox. If you're using Wayland, try switching to an X11 session and see if the timing improves, as Wayland can also affect compose key delivery to Electron apps. I've noted this as an ongoing issue for us to improve.

---

### 14. Custom automatic themes — choose per-mode themes
**Thread:** https://community.getmailspring.com/t/custom-automatic-themes/14457
**Action:** Reply + mark Resolved

> Good news — this is already supported! When you open the theme picker (**Preferences > Appearance > Change Theme...**) and select the **Automatic** theme, two dropdown menus appear beneath the theme list: one for "When light" and one for "When dark." Both dropdowns let you pick any installed theme, including community themes. So you can pair any two themes together and have Mailspring switch between them automatically based on your OS setting.

---

### 15. Automatic light/dark theme doesn't sync correctly with OS (KDE Plasma)
**Thread:** https://community.getmailspring.com/t/automatic-light-dark-theme-doesnt-sync-correctly-with-os/14456
**Action:** Reply

> Thanks for documenting this so clearly — the one-step-behind toggle pattern you've described is a real bug. Mailspring listens for Electron's `nativeTheme.updated` event and reads `nativeTheme.shouldUseDarkColors` at that moment. On KDE Plasma, it looks like the `updated` event fires before `shouldUseDarkColors` has propagated the new state, so Mailspring reads the *previous* value and only catches up on the *next* toggle. This is an upstream Electron/Qt interaction issue and we'll need to add a debounce or fallback poll to work around it on KDE.
>
> In the meantime, if Mailspring lands on the wrong theme after an OS switch, toggling the OS theme once more will re-sync it.

---

### 16. Add a selectable receive sound for incoming email
**Thread:** https://community.getmailspring.com/t/add-a-receive-sound-that-is-selectable-for-incoming-email/14455
**Action:** Reply

> Mailspring does play a sound when new mail arrives — you can toggle it under **Preferences > Notifications > Play sound when receiving new mail**. It's currently on/off only, with a fixed built-in sound rather than a user-selectable one. I'll note a custom sound picker as a feature request. For now, if you prefer your OS notification sounds, disabling Mailspring's built-in sound while keeping desktop notifications on is the way to go.

---

### 17. 163.com / 126.com email cannot be synchronized and displayed
**Thread:** https://community.getmailspring.com/t/163-com-126-com-email-cannot-be-synchronized-and-displayed/14454
**Action:** Reply

> There are two things happening in those logs. The "Could not create Mailspring container folder" error occurs because 163.com and 126.com restrict IMAP folder creation — Mailspring tries to create a `Mailspring/Snoozed` folder on the server to support the Snooze feature, and these providers don't allow it. This error is non-fatal; your email should still sync, but Snooze won't be available on these accounts. The CardDAV 501 response is also expected — these providers don't support contact sync.
>
> The most important thing to check: **163.com and 126.com require an "Authorization Code" (授权码) as your IMAP password**, not your regular login password. In the 163.com or 126.com web interface, go to **Settings > POP3/SMTP/IMAP**, enable IMAP access, and generate an authorization code. Use that code as your password in Mailspring. If you haven't done this, that's most likely why sync isn't working at all.

---

### 18. Problem with local email database (chrome-i18n extension missing)
**Thread:** https://community.getmailspring.com/t/problem-with-local-email-database/14453
**Action:** Reply

> The "Manifest file is missing or unreadable" error for the `chrome-i18n` extension points to an incomplete installation — some files inside `app.asar.unpacked` are missing. This can happen with certain package managers or after a partial upgrade. The cleanest fix is to fully remove and reinstall Mailspring:
>
> 1. Uninstall the current package (e.g. `sudo pacman -R mailspring-bin` on Arch, then reinstall fresh from AUR).
> 2. Remove any leftover files: `sudo rm -rf /usr/lib/mailspring`
> 3. Reinstall. Your email data and settings in `~/.config/Mailspring` won't be affected.
>
> If the error persists after a clean reinstall, it may be an AUR package build issue — in that case, downloading the `.deb` from getmailspring.com and converting it with `debtap` is a reliable fallback.

---

### 19. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> There are two things to check here. First, **test without NordVPN active** — many email providers block IMAP connections from VPN IP ranges, and that alone can cause authentication failures. If it works without the VPN, add Mailspring to NordVPN's split-tunnel exclusion list so it connects directly.
>
> For the port issue: when manually configuring the account in Mailspring, make sure you explicitly select **SSL / TLS** as the security type and set the IMAP port to **993**. If the security type is set to STARTTLS, Mailspring will connect on 143 instead. The correct manual settings are:
> - **IMAP:** imap.shaw.ca, Port **993**, SSL/TLS
> - **SMTP:** smtp.shaw.ca, Port **587**, STARTTLS
>
> Also note that Shaw/Rogers may require an app-specific password rather than your regular account password for third-party mail clients — check your Shaw account security settings if authentication still fails after fixing the port.

---

### 20. Mail stuck in the Deleted folder
**Thread:** https://community.getmailspring.com/t/mail-stuck-in-the-deleted-folder/14459
**Action:** Reply + mark Resolved

> Glad the cache rebuild worked! For anyone else landing here: if messages get stuck in the Deleted folder and won't clear out, go to **Preferences > Accounts**, select each account, and click **Rebuild Cache**. That forces Mailspring to re-sync folder state with the server and usually clears stuck messages within a minute or two.

---

### 21. Emails stuck / not syncing since Monday March 2nd
**Thread:** https://community.getmailspring.com/t/mailspring-emails-are-stuck-on-monday-march-2nd/14276
**Action:** Reply

> This usually means the sync engine for that account has paused or encountered an error. Here's what to try in order:
>
> 1. Check the account name in the left sidebar — if there's a red warning icon, click it to see the error detail.
> 2. Go to **Preferences > Accounts**, select the affected account, and click **Re-authenticate**. This restarts the sync process without losing data.
> 3. If re-authenticating doesn't help, remove and re-add the account — your mail lives on the server so nothing is lost.
>
> It's also worth updating to **1.21.1** if you haven't — that release fixed a sync engine crash that could cause this "frozen at a specific date" pattern when syncing multiple accounts simultaneously.

---

### 22. Cmd+Z (undo) not restoring deleted emails on macOS
**Thread:** https://community.getmailspring.com/t/undelete-error-on-macos/14241
**Action:** Reply

> Undo for trash/delete actions is supported — after you move a thread to trash, an undo banner should appear at the top of the screen, and Cmd+Z will also trigger it. If neither is working, a couple of things to check:
>
> 1. **Update to the latest version.** We're at 1.21.1 (May 2026) and several keyboard handling fixes were made in the 1.20 and 1.21 releases.
> 2. **Single-folder limitation.** If the messages you deleted came from multiple different folders in one action (e.g. a unified inbox view), undo for that specific action is disabled — this is a known limitation.
>
> If you're on the latest version and the undo banner still never appears after deleting from a single folder, please share your macOS version and the exact steps you're taking.

---

### 23. Fedora 43 compatibility — missing libtidy dependency
**Thread:** https://community.getmailspring.com/t/fedora-43-compatibility-issue/14103
**Action:** Reply

> Good news: the current RPM package (1.21.1) lists both `libtidy.so.5` and `libtidy.so.58` as valid alternatives in the dependency spec, so it should now satisfy whichever variant your Fedora install provides. It's worth trying the latest RPM to see if the dependency issue is resolved.
>
> If you still hit the dependency error, the **Flatpak** is the most friction-free option on Fedora — it bundles its own libraries and won't be affected by system libtidy versions: `flatpak install flathub com.getmailspring.Mailspring`.

---

### 24. Unable to connect to Gmail (Ubuntu 24.04 Snap)
**Thread:** https://community.getmailspring.com/t/unable-to-connect-to-gmail/13933
**Action:** Reply

> You're running Mailspring 1.16.0 from the Snap store, and we're now at **1.21.1** with a lot of fixes since then. That said, the Snap sandbox is the most likely culprit here: Snap's network confinement can block the direct IMAP connections Mailspring needs even after OAuth succeeds.
>
> The quickest fix is to switch to the **.deb package** from [getmailspring.com](https://getmailspring.com) — it doesn't carry Snap's network restrictions and works much more reliably on Ubuntu. Install with `sudo dpkg -i mailspring-*.deb`. Your existing account configuration will be picked up automatically.
>
> If you prefer to stay on Snap, try running `sudo snap connect mailspring:network-observe` and retrying — but in our experience the .deb is the more reliable path on Ubuntu 24.04.
