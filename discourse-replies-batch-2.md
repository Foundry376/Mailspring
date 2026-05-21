# Mailspring Discourse Reply Drafts — Batch 2

### 1. Duplicated contacts
**Thread:** https://community.getmailspring.com/t/duplicated-contacts/14282
**Action:** Reply + mark Resolved

> To remove duplicate contacts, go to **Preferences > Accounts > Manage Contacts**. In the contacts view, you can select one or more contacts at a time and press the **Delete** key (or use the Delete button in the toolbar) to remove them. There's currently no automatic deduplication — you'd need to manually select and delete the extras. If you have a lot of duplicates, it may be faster to export the contact list as a vCard, clean it up in a text editor or contacts app, then re-import the cleaned file.

---


### 2. Gmail accounts not showing after verification
**Thread:** https://community.getmailspring.com/t/gmail-accounts-not-showing/14265
**Action:** Reply

> The most common cause of this is that port 12141 on your local machine is being blocked. Mailspring uses a small local webserver on that port to receive the OAuth callback from Google — if a firewall, VPN, or security tool is blocking it, the login flow completes in the browser but the account never gets added to the app. Try temporarily disabling any VPN or firewall and attempting the login again. If that doesn't work, you can add the account manually using IMAP/SMTP with a [Gmail App Password](https://support.google.com/accounts/answer/185833) instead.

---


### 3. Dark email backgrounds make text unreadable (Linux)
**Thread:** https://community.getmailspring.com/t/inbox-emails-with-dark-black-backgrounds-do-not-display-correctly-making-text-unreadable-linux/14245
**Action:** Reply

> This is a known rendering issue. When an email uses a dark background with light text (as BBC iPlayer emails do), Mailspring can sometimes strip the background color while keeping the light text color, making content invisible in light mode. The workaround you found is correct — switching to Mailspring's dark theme makes these emails readable. We're tracking this as a display bug; it's related to how the email viewer handles CSS backgrounds on certain HTML structures. Thanks for the detailed report including the specific sender.

---


### 4. New replies in Sent Mail label folder
**Thread:** https://community.getmailspring.com/t/new-replies-in-sent-mail-label-folder/14154
**Action:** Reply

> This is expected IMAP/Gmail behavior rather than a Mailspring-specific issue. When someone replies to a thread, Gmail's threading groups that reply with the original sent message — so the thread appears in both Inbox (because of the reply) and Sent Mail (because the original is there). Most email clients, including Thunderbird, show the same behavior. The reply itself should still appear in your Inbox; the thread just shows up in Sent because it contains your original message. There isn't a way to suppress this without server-side filtering.

---


### 5. Email sorting by date, subject, or sender
**Thread:** https://community.getmailspring.com/t/sorting-email-by-date-subject-or-sender/9570
**Action:** Reply

> Column-based sorting (by sender, subject, etc.) isn't currently available in Mailspring — threads are always sorted by the most recent activity date. This is a frequently requested feature, and I'd love to add it. For now, the best workaround for finding messages from a specific sender is to use search: type `from:name@example.com` in the search bar to filter to emails from that person. I've noted this as something to prioritize in a future release.

---


### 6. Ctrl-Z undo not working (Windows)
**Thread:** https://community.getmailspring.com/t/ctrl-z-not-working-anymore/14213
**Action:** Reply

> Ctrl-Z in Mailspring has two different behaviors depending on context: when your cursor is inside a **text field or the composer**, it undoes text edits. When focus is on the **thread list**, it triggers the mail undo system (which undoes actions like archiving or starring a thread). It does **not** restore deleted emails — deleting a thread moves it to Trash, but Ctrl-Z won't bring it back from there. To recover an accidentally deleted message, check your Trash folder and move it back to the inbox. If you're seeing Ctrl-Z fail to undo text you just typed in the composer, that would be a bug — let us know which specific scenario you're experiencing.

---


### 7. Mailspring only displays emails less than one year old
**Thread:** https://community.getmailspring.com/t/mailspring-only-displays-emails-less-than-one-year-old/14193
**Action:** Reply

> This is not a Pro vs. free limitation — it's how Mailspring's sync engine works for all users. The sync engine initially fetches your most recent mail and progressively syncs older messages in the background. For large mailboxes, completing the full sync of all historical mail can take a significant amount of time (sometimes days for very large accounts). As long as Mailspring is running, it will continue syncing older messages in the background. You can check sync progress by hovering over a folder in the sidebar — a progress indicator will appear if it's still syncing. If the progress seems stuck, try removing and re-adding the account.

---


### 8. How to change label colors
**Thread:** https://community.getmailspring.com/t/change-label-colors/14073
**Action:** Reply

> Label colors in Mailspring are automatically generated from the label name — the color is derived from a hash of the name, so each label gets a consistent, unique color. There's currently no way to manually set a custom color for a label. The color will change if you rename the label (since the hash changes), but you can't pick a specific color. This is something we could look at adding in a future release — noted!

---


### 9. Unsubscribe from IMAP folder (hide from sidebar)
**Thread:** https://community.getmailspring.com/t/unsubscribe-imap-folder/14068
**Action:** Reply

> Mailspring doesn't currently have an IMAP folder subscription/unsubscription UI — all folders on the server are shown in the sidebar. The most practical workaround is to right-click on an account name in the sidebar and look for folder options, though hiding individual folders isn't yet supported. This is a common request (similar to Thunderbird's "Subscribe" dialog) and it's on the list of things to add. For now, I'd suggest filing or upvoting a feature request if you'd like to track progress on this.

---


### 10. Comcast moving to Yahoo — setup help
**Thread:** https://community.getmailspring.com/t/comcast-moving-to-yahoo/14044
**Action:** Reply + mark Resolved

> Glad you found a solution! For anyone else migrating from Comcast to Yahoo: the key steps are (1) generate a Yahoo app-specific password from your [Yahoo Account Security settings](https://login.yahoo.com/account/security) — Yahoo requires this for IMAP access since they don't allow direct password authentication for third-party apps, and (2) in Mailspring, use the manual IMAP/SMTP setup option rather than the Yahoo button, with `imap.mail.yahoo.com` (port 993, SSL) and `smtp.mail.yahoo.com` (port 465, SSL). Use your full Comcast/Xfinity email address as the username and the app-specific password you generated.

---


### 11. Can I install Mailspring on multiple computers?
**Thread:** https://community.getmailspring.com/t/install-another-laptop/14024
**Action:** Reply + mark Resolved

> Yes, absolutely — you can install Mailspring on as many computers as you like. Just download and install it on your second laptop from [getmailspring.com](https://getmailspring.com), then add your email accounts the same way you did on the first machine. Each installation connects directly to your mail servers (IMAP/SMTP), so your emails will be in sync across both machines via the server. Your Mailspring ID (for Pro features like snooze and send later) can also be used on multiple devices.

---


### 12. Installing Mailspring on Windows 11 with large fonts — OK button inaccessible
**Thread:** https://community.getmailspring.com/t/installation-on-windows-11-with-large-fonts-results-in-install-window-too-large-to-access-ok-button/14004
**Action:** Reply

> This is a DPI/font scaling issue with the installer. A quick workaround: try pressing **Enter** or **Space** to confirm the dialog — the OK button is usually the default/focused button even if it's off-screen. Alternatively, you can try temporarily reducing your display scaling in Windows Settings (System > Display > Scale) to 100% for the duration of the install, then set it back afterward. If the installer window is moveable, you can also try clicking and dragging it upward to bring the OK button into view. I've noted this as a bug to fix in the installer.

---


### 13. IMAP connection fails — SSL certificate error (university server)
**Thread:** https://community.getmailspring.com/t/imap-connection-fails-university-server/13997
**Action:** Reply

> The error `unable to get local issuer certificate` typically means your university's mail server uses a certificate signed by an internal/private CA that Mailspring's sync engine doesn't trust. Mailspring uses its own certificate store (from the underlying Rust/OpenSSL libraries) rather than the system certificate store, so even if the system trusts your university's CA, Mailspring may not. Unfortunately there's no built-in UI to add custom CAs to Mailspring's trust store. The most practical solution for now is to use the system-level certificate import to add your university's root CA to the OS certificate store — on some systems Mailspring will pick this up; on others it won't. This is a known limitation we'd like to address. Thunderbird tends to handle non-standard CAs better because it uses the system cert store on most platforms.

---


### 14. Horizontal reading pane not working
**Thread:** https://community.getmailspring.com/t/horizontal-reading-pane-not-working/13996
**Action:** Reply

> To clarify how Mailspring's layout modes work: the three options in **Preferences > Appearance** are "List" (no reading pane, open threads in a full view), "Split" (vertical split — list on left, message on right), and "Split Vertical" (horizontal split — list on top, message below). If you selected the horizontal split option and it doesn't appear to be working, make sure to click "Apply Layout" after selecting it, and then restart Mailspring. If it still doesn't work, let us know your OS and Mailspring version and we can investigate further.

---


### 15. Send button doesn't send (Fastmail)
**Thread:** https://community.getmailspring.com/t/send-button-doesnt-send/13994
**Action:** Reply

> If clicking Send does nothing, this is almost always an SMTP configuration issue — the send is failing silently. Here are a few things to try:
> 1. Check **Preferences > Accounts**, select your Fastmail account, and look for any error message or red indicator on the SMTP settings.
> 2. Make sure your Fastmail account is configured with an **app password** — Fastmail requires app-specific passwords for IMAP/SMTP access. You can generate one at [app.fastmail.com/settings/security/tokens](https://app.fastmail.com/settings/security/tokens).
> 3. Check that SMTP is set to `smtp.fastmail.com`, port 465, SSL/TLS, with your full email address as the username.
> 4. After updating, try sending a test message to yourself.
> If the issue persists, check the logs at **Help > Mailspring Logs** for any SMTP error details.

---


### 16. Focused inbox feature request
**Thread:** https://community.getmailspring.com/t/focussed-inbox/13980
**Action:** Reply

> Mailspring doesn't have a built-in focused/priority inbox feature right now. The closest thing you can do is use **mail rules** (Preferences > Mail Rules) to automatically label or move newsletters and subscription emails so your inbox stays cleaner. For example, you could create rules to label emails from mailing lists or auto-sent domains and then filter those out of your main view. A true AI-powered focused inbox (like Outlook's) would require server-side classification, which is something we'd need to add as a Pro feature — it's on the roadmap but not yet implemented.

---


### 17. Images appearing inline on outgoing emails (attached as files)
**Thread:** https://community.getmailspring.com/t/images-appearing-inline-on-outgoing-emails-even-though-attached-as-files/13979
**Action:** Reply

> This is intentional behavior when you **drag and drop** images into the composer — Mailspring treats dropped images as inline content (embedded in the email body). When you use the paperclip/attachment button to attach a file, images should stay as regular attachments. If you're seeing images go inline even when using the attach button, that would be unexpected — let us know exactly how you're attaching them. As a workaround, you can drag the inline image out of the body area if you want it to remain as an attachment, or hold **Alt/Option** when composing for plain-text mode which doesn't support inline images.

---


### 18. Sound effects — where are the audio files?
**Thread:** https://community.getmailspring.com/t/sound-effects/13964
**Action:** Reply

> The Mailspring sound files live inside the application bundle. On Linux/Windows, look in the `resources/app/static/sounds/` directory inside where Mailspring is installed. There are two default sounds: `new_mail.ogg` and `mail_sent.ogg`. You can replace these files with your own (keeping the same filename and OGG format) to customize the sounds. Note that app updates may overwrite your custom files, so you'd need to re-apply after updating. There's also a `custom-sounds` package in the app with higher-quality alternative sounds (`CUSTOM_UI_Send_v1.ogg`, `CUSTOM_UI_NewMail_v1.ogg`) that's used when the custom sounds theme is active.

---


### 19. Threads combining unrelated emails together
**Thread:** https://community.getmailspring.com/t/threads-combining-unrelated-emails-together/13948
**Action:** Reply

> Mailspring uses the email `In-Reply-To` and `References` headers (standard RFC 2822 threading) as the primary grouping mechanism, but falls back to subject matching when those headers aren't present. If you're seeing truly unrelated emails grouped together, it's most likely because those emails have matching subjects *and* are missing proper threading headers — this can happen with automated/marketing emails that reuse the same subject line without setting the reply headers correctly. Unfortunately there's no setting to disable threading entirely in Mailspring right now, though it's a frequently requested feature. If you notice a specific sender causing this, filtering those emails to a separate folder can help keep your inbox threading cleaner.

---


### 20. Adding more social media accounts to signatures (TikTok, Threads, Pinterest)
**Thread:** https://community.getmailspring.com/t/adding-more-social-media-accounts-to-signatures/13928
**Action:** Reply

> The current signature builder supports Facebook, LinkedIn, Twitter/X, Instagram, YouTube, Medium, GitHub, and a website URL. TikTok, Threads, and Pinterest aren't in the list yet. The signature system is template-based, so adding new platforms requires updating the signature templates in the app. This is something I can add in a future release — noted! In the meantime, you can work around it by using the "Custom HTML" signature option and manually adding linked social media icons to your signature HTML.

---


### 21. Gmail ERR_SSL_PROTOCOL_ERROR when adding account
**Thread:** https://community.getmailspring.com/t/cant-add-gmail-err-ssl-protocol-error/13648
**Action:** Reply

> The `ERR_SSL_PROTOCOL_ERROR` on `127.0.0.1` happens during the Gmail OAuth flow. Mailspring starts a local server on port 12141 to receive the authentication callback from Google — the error means the browser tried to connect to that local server using HTTPS when it expected plain HTTP. This is commonly caused by browser extensions (like HTTPS Everywhere or similar) that force HTTPS on all connections including localhost, or by a VPN/proxy that's intercepting local traffic. Try disabling browser extensions temporarily and attempting the login again. Alternatively, add the account manually using IMAP/SMTP with a [Gmail App Password](https://support.google.com/accounts/answer/185833).

---


### 22. Unable to paste link into body of email
**Thread:** https://community.getmailspring.com/t/unable-to-paste-link-into-body-of-email/13932
**Action:** Reply

> A few things to check if paste isn't working in the composer: (1) Make sure you've clicked inside the message body first to focus it — pasting into the To/CC fields has different behavior. (2) Try Ctrl+Shift+V (or Cmd+Shift+V on Mac) to paste as plain text if normal paste isn't working. (3) If you're on Linux/Wayland, there can be clipboard issues with certain setups — try copying the link again and pasting immediately. (4) Check that rich text mode is enabled in Preferences > Composing if you're trying to paste formatted content. If none of these help, let us know your OS and Mailspring version.

---


### 23. HTML formatted text not rendering correctly when pasting from Zoho Books
**Thread:** https://community.getmailspring.com/t/html-formatted-text-not-rendering-correctly-in-composer-and-sent-emails/13934
**Action:** Reply

> When you paste HTML content (like from Zoho Books invoices), Mailspring sanitizes and processes the clipboard HTML before inserting it — this strips some CSS properties that it considers unsafe or unsupported, including certain background colors and complex styling. The composer uses a rich text editor (Slate.js) that supports a subset of HTML formatting, not the full CSS spec. If the formatting is critical, the best approach is to paste the content into the composer, then manually reapply any background colors or styling using the formatting toolbar. Alternatively, consider attaching the invoice as a PDF instead of pasting the HTML — this preserves the exact formatting and is often more professional for invoices anyway.

---


### 24. Is Mailspring still being developed for macOS?
**Thread:** https://community.getmailspring.com/t/is-mailspring-still-being-developed-for-macos/14013
**Action:** Reply + mark Resolved

> Yes, absolutely! Mailspring is actively developed and macOS is a first-class platform. We shipped several releases in 2025 and 2026, including significant work on Wayland support, performance improvements, and bug fixes. The latest version is always available at [getmailspring.com](https://getmailspring.com) and via the built-in auto-updater. If you have a specific issue or something that feels broken on macOS, please post it and we'll take a look.

---


### 25. Mailspring amazingly slow on Mac
**Thread:** https://community.getmailspring.com/t/mailspring-amazingly-slow-on-mac/10122
**Action:** Reply

> Sorry to hear about the performance issues. With a 15GB+ Gmail mailbox, the initial sync can cause significant database activity that slows things down — the SQLite database is being written to continuously as older mail syncs in. A few things that can help: (1) Give the initial sync time to complete — performance usually improves significantly once the full mailbox is indexed. (2) Check if the sync engine (mailsync) is using high CPU in Activity Monitor; if so, it's still actively syncing. (3) Make sure you're on the latest version of Mailspring, as we've made several performance improvements in recent releases. (4) If you have multiple Gmail accounts, each runs its own sync process, which multiplies the load. I'd love to know if performance improves after the initial sync completes — please let us know.
