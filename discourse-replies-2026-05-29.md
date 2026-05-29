# Mailspring Discourse Reply Drafts — 2026-05-29

### 1. Mail stuck in the Deleted folder
**Thread:** https://community.getmailspring.com/t/mail-stuck-in-the-deleted-folder/14459
**Action:** Reply + mark Resolved

> Thanks for following up here — glad the cache rebuild worked! For anyone landing on this thread: if messages get stuck in the Deleted folder and don't clear out, go to **Preferences > Accounts**, select each account, and click **Rebuild Cache**. That forces Mailspring to re-sync folder state with the server and usually clears these stuck messages.

---

### 2. Service Crash (Arch Linux, mailsync.bin fatal error)
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> Sorry to hear you're hitting this! v1.21.1 includes several sync engine stability fixes (including an increased SQLite busy timeout that resolved crash-under-load conditions), so it's good you're on the latest version. To help track this down, could you open **Preferences > Accounts**, click the account that's crashing, and use the **Copy Sync Logs** button to grab the logs around when the crash occurs? If you paste those here (or the last 50–100 lines), we should be able to see what the sync engine was doing when it went down. Crashes that happen under all conditions tend to be account-specific configuration issues, while intermittent ones are often race conditions we can address in a future release.

---

### 3. Compose Key not fully working (Ubuntu snap, German characters)
**Thread:** https://community.getmailspring.com/t/compose-key-not-fully-working/14458
**Action:** Reply

> This is a known pain point — Electron processes key events through its own input stack, which can shorten the window available for multi-key compose sequences like Right-Ctrl → " → o. The Snap package adds an extra layer of input event handling due to its confinement model, which can make this worse. If you haven't tried it, I'd recommend installing the **.deb package** from [getmailspring.com](https://getmailspring.com) directly instead of Snap — many users on Ubuntu report significantly better keyboard behavior outside of the Snap sandbox. If you're using Wayland, try switching to an X11 session and see if the timing improves, as that can also affect compose key delivery. I've noted this as an ongoing issue for us to improve.

---

### 4. Custom automatic themes — choose per-mode themes
**Thread:** https://community.getmailspring.com/t/custom-automatic-themes/14457
**Action:** Reply

> This is a great idea and a natural extension of the automatic theme feature we shipped in v1.20. Right now, automatic mode always resolves to the built-in ui-light / ui-dark themes regardless of what custom themes are installed. Allowing users to select which theme is used for each mode would make the feature much more useful for people who use custom themes day-to-day. If you're up for submitting that PR, I'd be happy to review it — the relevant logic is in `app/src/theme-manager.ts` and `app/internal_packages/preferences/lib/`. The `getActiveTheme()` method is the place to wire in per-mode theme config keys.

---

### 5. Automatic light/dark theme doesn't sync correctly with OS — KDE Plasma
**Thread:** https://community.getmailspring.com/t/automatic-light-dark-theme-doesnt-sync-correctly-with-os/14456
**Action:** Reply

> Thanks for documenting this so clearly — the toggle-lag pattern you've described (Mailspring always one step behind) is a real bug. Mailspring uses Electron's `nativeTheme.updated` event to detect system theme changes and reads `nativeTheme.shouldUseDarkColors` at that point. On KDE Plasma, it looks like the `updated` event fires before `shouldUseDarkColors` has propagated the new state, so Mailspring reads the *previous* value and only catches up on the *next* toggle. This is an upstream Electron / Qt interaction issue, and we'll need to look at adding a short debounce or a fallback poll to work around it on KDE. I've noted this as a known bug. In the meantime, switching the theme manually via **Preferences > Appearance** is the workaround — sorry for the inconvenience.

---

### 6. Add a selectable receive sound for incoming email
**Thread:** https://community.getmailspring.com/t/add-a-receive-sound-that-is-selectable-for-incoming-email/14455
**Action:** Reply

> Thanks for the suggestion! Currently Mailspring plays a single built-in sound when new mail arrives — you can toggle it on or off under **Preferences > Notifications > Play sound when receiving new mail**, but there's no option to choose a different sound. A sound picker is a reasonable improvement and I'll note it as a feature request. For now, if you want to silence the existing sound and use your OS-level notifications with their own sounds instead, disabling Mailspring's sound while keeping desktop notifications enabled is the way to go.

---

### 7. 163.com / 126.com email cannot be synchronized and displayed
**Thread:** https://community.getmailspring.com/t/163-com-126-com-email-cannot-be-synchronized-and-displayed/14454
**Action:** Reply

> There are two things happening in those logs. First, the "Could not create Mailspring container folder" error occurs because 163.com and 126.com restrict IMAP folder creation — Mailspring tries to create a `Mailspring/Snoozed` folder on the server to support the Snooze feature, and these providers don't allow it. This error is non-fatal; your email should still sync, but Snooze won't be available on these accounts. The CardDAV 501 response is expected — these providers don't support contact sync.
>
> The more important thing to check: **163.com and 126.com require an "Authorization Code"** (授权码) as your IMAP password, not your regular login password. In the 163.com or 126.com web interface, go to **Settings > POP3/SMTP/IMAP**, enable IMAP access, and generate an authorization code. Use that code as your password in Mailspring. If you haven't done this, that's likely why sync isn't working at all.

---

### 8. Problem with local email database (chrome-i18n extension missing)
**Thread:** https://community.getmailspring.com/t/problem-with-local-email-database/14453
**Action:** Reply

> The "Manifest file is missing or unreadable" error for the `chrome-i18n` extension points to an incomplete installation — some files inside the `app.asar.unpacked` directory are missing. This can happen with certain package managers or after a partial upgrade. The cleanest fix is to **fully remove and reinstall Mailspring**:
>
> 1. Uninstall the current package (e.g. `sudo pacman -R mailspring-bin` if using AUR, then `yay -S mailspring-bin` to reinstall fresh).
> 2. Delete any leftover files: `sudo rm -rf /usr/lib/mailspring`
> 3. Reinstall. Your email data and settings are stored in `~/.config/Mailspring` and won't be affected.
>
> If the error persists after a clean reinstall, it may be an AUR package build issue — in that case, downloading the `.deb` from getmailspring.com and installing it with `dpkg` (or converting it with `debtap`) is a reliable fallback.

---

### 9. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> A couple of things to check here. First, **test without NordVPN active** — many email providers block IMAP connections from VPN IP ranges, and that alone can cause authentication failures that look like credential errors. If it works without the VPN, the VPN is the issue (you may need to whitelist imap.shaw.ca / smtp.shaw.ca or use a split-tunnel configuration).
>
> For the port 143 issue: when manually configuring the account, make sure you explicitly select **SSL / TLS** as the security type and set the port to **993**. If the security type is set to "None" or "STARTTLS", Mailspring will use port 143. The correct settings are:
> - **IMAP:** imap.shaw.ca, Port 993, SSL/TLS
> - **SMTP:** smtp.shaw.ca, Port 587, STARTTLS
>
> Also note that Shaw/Rogers may require you to use an app-specific password rather than your regular account password for third-party mail clients — check your Shaw account security settings if authentication still fails with the correct ports.
