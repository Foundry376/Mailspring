# Mailspring Discourse Reply Drafts — 2026-06-05

### 1. Custom automatic themes
**Thread:** https://community.getmailspring.com/t/custom-automatic-themes/14457
**Action:** Reply + mark Resolved

> Good news — this is actually already supported! When you open the theme picker (**Preferences > Appearance > Change Theme...**) and select the **Automatic** theme, two dropdown menus appear beneath the theme list: one for "When light" and one for "When dark." Both dropdowns let you pick any installed theme, including community themes. So you can pair any two themes together and have Mailspring switch between them automatically based on your OS setting.

---

### 2. Send via mail opens new email dialog but doesn't attach file
**Thread:** https://community.getmailspring.com/t/send-via-mail-opens-new-email-dialog-but-doesnt-attach-file/14469
**Action:** Reply

> Thanks for the report. This is a known regression introduced in **v1.21.0** as part of a security audit. Support for the `?attach=` / `?attachment=` parameter in `mailto:` links was intentionally removed (#2703) because it could be exploited to attach arbitrary local files from a malicious link in an email. Unfortunately this also breaks the legitimate "Send via mail" workflow in Nautilus and other file managers on Linux.
>
> We understand this is frustrating for everyday use. I've noted this thread and we'll look at whether we can re-enable the feature with proper path sandboxing in a future release. In the meantime there's no workaround short of attaching the file manually after the compose window opens.

---

### 3. Automatic light/dark theme doesn't sync correctly with OS
**Thread:** https://community.getmailspring.com/t/automatic-light-dark-theme-doesnt-sync-correctly-with-os/14456
**Action:** Reply

> Thanks for the detailed description. This is a known issue on KDE Plasma — the way Electron receives OS theme change notifications on KDE can result in the event firing once with a stale value and then again with the correct one, causing the one-step-behind toggle behavior you're seeing. It's not happening on other desktop environments we've tested.
>
> I don't have a fix yet but this is on my radar. In the meantime, if you switch themes and Mailspring lands on the wrong one, toggling the OS theme back and forth once more should re-sync it.

---

### 4. Service Crash (mailsync.bin fatal error on Linux)
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> Thanks for the reports — I can see this affecting Arch and Fedora users on 1.21.1. **v1.21.1** includes a fix for a sync engine crash that occurred during many-account sync (increased the SQLite busy timeout), which may be related if you have more than one account configured.
>
> If you're still seeing this on 1.21.1 and the crash-then-restart cycle is frequent, it would help to see the mailsync log. On Linux you can find it at `~/.config/Mailspring/logs/mailsync-[account].log` — if you're willing to share the tail of that file (sanitized of any credentials) either here or as a GitHub issue, I can take a closer look at the root cause.

---

### 5. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> Shaw.ca is in our provider database, but you may be hitting a mismatch with the auto-detected settings. Try adding the account manually with these exact settings:
>
> **IMAP:** `imap.shaw.ca`, port **993**, security **SSL / TLS**
> **SMTP:** `mail.shaw.ca` (not smtp.shaw.ca), port **587**, security **STARTTLS**
> **Username:** the part of your email address *before* `@shaw.ca` (without the domain)
>
> The port-143 issue may be a leftover from a previous auto-detection attempt — entering port 993 and SSL/TLS manually should override it. Let me know if you're still hitting authentication failures after trying this.

---

### 6. SMTP test failing with response code 554
**Thread:** https://community.getmailspring.com/t/smtp-test-failing-with-response-code-554/14467
**Action:** Reply

> The 554 rejection is coming from your own mail server's Rspamd filter, not from Mailspring itself. The rule `REPLYTO_EQ_TO_ADDR` fires when an email's Reply-To header matches its To address, which Rspamd treats as a spam signal. Mailspring sends a short test message during account setup to verify the SMTP connection, and that test email appears to be triggering this rule.
>
> The quickest fix is on your server side: you can adjust the Rspamd score for `REPLYTO_EQ_TO_ADDR` (set it lower or to a negative weight for your own domain), or add a whitelist entry for the test message. Once you've added the account successfully, outgoing mail from your normal address shouldn't be affected by this rule.

---

### 7. Add a receive sound that is selectable for incoming email
**Thread:** https://community.getmailspring.com/t/add-a-receive-sound-that-is-selectable-for-incoming-email/14455
**Action:** Reply

> Mailspring does play a sound when new mail arrives — you can toggle it in **Preferences > General**, under Notifications, with the "Play sound when receiving new mail" option. It's currently a simple on/off setting with a fixed sound, not user-selectable.
>
> A custom sound picker is a reasonable request and I'll note it. In the meantime the toggle at least lets you know a sound is there.

---

### 8. Installation/running issues on Debian stable (.deb, snap)
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
