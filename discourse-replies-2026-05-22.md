# Mailspring Discourse Reply Drafts — 2026-05-22

### 1. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> Thanks for the detailed report. Two separate things are going on here, so let me address them one at a time.
>
> **Port 143 instead of 993:** Port 143 is the STARTTLS port, while 993 is SSL/TLS — they're different security modes. When you set up the account in Preferences > Accounts, make sure the security setting in the IMAP row reads **SSL / TLS** (not STARTTLS). If it says STARTTLS, that's why Mailspring is connecting on 143 even if you typed 993 in the port field. Double-check that setting and save the account.
>
> **NordVPN interference:** Mailspring opens a direct TCP connection to your mail server, and some VPN configurations (particularly NordVPN's "Threat Protection" or proxy modes) intercept and re-route those connections in ways that break authentication. The fix is to add Mailspring to NordVPN's **split tunneling** exclusion list so it bypasses the VPN entirely — your mail traffic is already encrypted at the SSL layer, so this is safe.
>
> Try the SSL/TLS fix first and let us know if that resolves the port issue.

### 2. Unable to connect to Gmail (Ubuntu 24.04 Snap)
**Thread:** https://community.getmailspring.com/t/unable-to-connect-to-gmail/13933
**Action:** Reply

> You're running Mailspring 1.16.0 from the Snap store, and we're now at **1.21.1** — quite a few fixes have landed since then. That said, the Snap sandbox is the most likely culprit here: Snap's network confinement can block the direct IMAP connections Mailspring needs even after OAuth succeeds.
>
> The quickest fix is to switch to the **.deb package or AppImage** from [getmailspring.com](https://getmailspring.com) — those don't carry the Snap network restrictions and tend to work much more reliably on Ubuntu. Download the latest .deb and install it with `sudo dpkg -i mailspring-*.deb`. Your existing account configuration will be picked up automatically.
>
> If you'd prefer to stay on Snap, run `sudo snap connect mailspring:network-observe` and retry — but in our experience the .deb is the more reliable path on Ubuntu 24.04.

### 3. Emails stuck / not syncing since Monday
**Thread:** https://community.getmailspring.com/t/mailspring-emails-are-stuck-on-monday-march-2nd/14276
**Action:** Reply

> This usually means the sync engine for that account has paused or encountered an error. Here's what to try in order:
>
> 1. Look at the account name in the left sidebar — if there's a red warning icon next to it, click it to see the error detail.
> 2. Go to **Preferences > Accounts**, select the affected account, and click **Re-authenticate**. This restarts the sync process without losing any data.
> 3. If re-authenticating doesn't help, remove the account and add it back — all your mail lives on the server, so nothing is lost.
>
> It's also worth making sure you're on the latest version (1.21.1, released May 19). One of the fixes in that release was specifically for a sync engine crash that could happen when syncing multiple accounts simultaneously, which matches the "frozen desktop, phone is fine" pattern you're describing.

### 4. Cmd+Z (undo) not restoring deleted emails on macOS
**Thread:** https://community.getmailspring.com/t/undelete-error-on-macos/14241
**Action:** Reply

> Undo for trash/delete actions is supported — after you move a thread to trash, an undo banner should appear at the top of the screen, and Cmd+Z will also trigger it. If neither the banner nor the keyboard shortcut is working for you, a couple of things to check:
>
> 1. **Update to the latest version.** We're now at 1.21.1 (May 2026) and several keyboard handling issues were fixed in the 1.20 and 1.21 releases that could affect this.
> 2. **Single-folder limitation.** If the messages you deleted came from multiple different folders in one action (e.g. across a unified inbox view), the undo for that specific action is disabled — this is a known limitation.
>
> If you're on the latest version and the undo banner still never appears after deleting a message from a single folder, please share your macOS version and the exact steps you're taking and we'll dig deeper.

### 5. Fedora 43 compatibility — missing libtidy dependency
**Thread:** https://community.getmailspring.com/t/fedora-43-compatibility-issue/14103
**Action:** Reply

> Good news: the current RPM package (1.21.1) lists both `libtidy.so.5` and `libtidy.so.58` as valid alternatives in the dependency spec, so it should satisfy whichever variant your Fedora 43 install provides. It's worth trying the latest RPM to see if the dependency is now resolved.
>
> That said, if you hit the dependency error again, the **Flatpak** is the most friction-free option on Fedora — it bundles its own libraries and won't be affected by system libtidy versions. Install via: `flatpak install flathub com.getmailspring.Mailspring`. For bug reports and tracking issues like this, GitHub issues at [github.com/Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) are the best place.
