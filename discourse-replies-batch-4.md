# Mailspring Discourse Reply Drafts — Batch 4

### 1. Costum Container Folder in mailspring?
**Thread:** https://community.getmailspring.com/t/costum-container-folder-in-mailspring/9343
**Action:** Reply

> The "Custom Container Folder" field is an IMAP namespace prefix — it tells Mailspring where your mailbox hierarchy begins on the server. For most providers (including mail.de) you can leave it blank and Mailspring will detect the correct structure automatically. If your mail.de account has a nested folder structure and sync seems incomplete after connecting, try entering `INBOX` there. Otherwise, leave it empty and let auto-detection handle it.

---


### 2. People at Microsoft/Outlook are not receiving my emails from Mailspring
**Thread:** https://community.getmailspring.com/t/people-at-microsoft-outlook-are-not-receiving-my-emails-from-mailspring/9211
**Action:** Reply + mark Resolved

> As you discovered, this is caused by Mailspring's **open tracking** feature. When open tracking is enabled, Mailspring rewrites the invisible tracking pixel URL to go through `link.getmailspring.com` — Microsoft's spam filters have become very aggressive about flagging messages that contain these redirect domains, and can end up blacklisting your address entirely. The fix is to turn off open tracking: in the composer, click the eye icon in the toolbar to toggle it off, or disable it by default in Preferences → Subscription. Glad you found the cause!

---


### 3. Mailspring Auto Update
**Thread:** https://community.getmailspring.com/t/mailspring-auto-update/9318
**Action:** Reply

> Unfortunately there's no built-in setting to disable auto-updates in Mailspring. The best workaround for staying on an older version is to block Mailspring's update server at the OS level — on macOS you can do this by adding a rule to `/etc/hosts` that points `updates.getmailspring.com` to `127.0.0.1`. You'll also need to make sure the Mailspring app file is not replaced; one option is to set the app bundle to read-only (`chmod -R a-w /Applications/Mailspring.app`) so the updater can't overwrite it. Keep in mind that running very old versions does carry some security risk as vulnerabilities won't be patched.

---


### 4. Can't drag & drop attachment
**Thread:** https://community.getmailspring.com/t/can-t-drag-drop-attachment/9288
**Action:** Reply

> This is a known bug that was introduced in a recent release — the error "The 'path' argument must be of type string, Received undefined" is a bug in how Mailspring reads the file path from the drop event on some platforms. The workaround for now is to use the paperclip attachment button in the composer toolbar instead of drag-and-drop. I've noted this as a regression to investigate for an upcoming release.

---


### 5. Still can't store password securely with gnome-libsecret parameter
**Thread:** https://community.getmailspring.com/t/still-cant-store-password-securely-with-gnome-libsecret-parameter/9267
**Action:** Reply

> The error "Encryption is not available" means that Electron's `safeStorage` API can't access a secret service backend, even though GNOME Keyring is installed. On Arch Linux this most commonly happens because the keyring daemon isn't running when Mailspring starts. Try these steps:
> 1. Make sure `gnome-keyring-daemon` is launched as part of your session (many DEs do this automatically, but tiling WMs often don't).
> 2. Run `gnome-keyring-daemon --start --components=secrets` in a terminal, then launch Mailspring from the same terminal session.
> 3. If you're using a non-GNOME desktop, try `kwallet` instead, or set the environment variable `ELECTRON_PASSWORD_STORE=kwallet` before launching.
> The `--password-store="gnome-libsecret"` flag should work once the daemon is actually running and the D-Bus socket is available.

---


### 6. Any quick way to toggle between RTL<-->LTR?
**Thread:** https://community.getmailspring.com/t/any-quick-way-to-toggle-between-rtl-ltr/9271
**Action:** Reply

> There's no explicit toolbar button to toggle text direction in the composer. However, Mailspring does automatically detect RTL text — when you type in a right-to-left language (Hebrew, Arabic, etc.), the paragraph direction is set to RTL automatically, and the correct `dir="rtl"` attribute is added when the email is sent. If you're writing a mixed-direction email and the auto-detection isn't working as expected, that would be a good feature request to file on GitHub.

---


### 7. My drafts disappear
**Thread:** https://community.getmailspring.com/t/my-drafts-disappear/9254
**Action:** Reply

> This sounds like it could be related to the sync engine discarding a draft when it detects a conflict with a server-side state — particularly on some IMAP servers that automatically purge the Drafts folder or don't preserve changes. A few things to try:
> 1. Check that your Drafts folder in Mailspring maps to the correct folder on the server (Preferences → Accounts → your account → Folders).
> 2. Make sure you're on the latest version of Mailspring (1.15+), as there were some draft-related fixes in recent releases.
> 3. If the problem persists, please share your email provider and the Mailspring version — that will help narrow it down.

---


### 8. Mailspring inserting redirects into links in messages - how to prevent this?
**Thread:** https://community.getmailspring.com/t/mailspring-inserting-redirects-into-links-in-messages-how-to-prevent-this/9198
**Action:** Reply + mark Resolved

> This is the **link tracking** feature — when enabled, Mailspring wraps links in a `link.getmailspring.com` redirect so it can tell you when recipients click them. To disable it, click the chain-link icon in the composer toolbar (it should deselect/go grey). You can also check that it's not turned on by default by looking at the toolbar state each time you open a new compose window. If you want it off for all messages, just make sure it's toggled off before sending — the setting is per-draft, not global, but it won't re-enable itself between drafts if you leave it off.

---


### 9. I can't add a fifth and sixth account. I have a Pro account.
**Thread:** https://community.getmailspring.com/t/i-cant-add-a-fifth-and-sixth-account-i-have-a-pro-account/9190
**Action:** Reply

> A Pro subscription removes the account limit entirely, so if you're still being blocked at 5 or 6 accounts, a few things to check:
> 1. Make sure you're signed in to your Mailspring ID in the app — go to Preferences → Subscription and confirm it shows your Pro account (not a free tier).
> 2. If you recently upgraded, try signing out of your Mailspring ID and signing back in to refresh the subscription status.
> 3. If it still doesn't work after confirming the subscription is active, please email support@getmailspring.com with your Mailspring ID email and we'll look into it.

---


### 10. Mailspring snap 1.15 can access just home folder
**Thread:** https://community.getmailspring.com/t/mailspring-snap-1-15-can-access-just-home-folder/9230
**Action:** Reply

> This is a snap sandbox restriction. Snap packages are confined to the home directory by default, and connecting to additional interfaces requires extra permissions. To allow access to removable media and other locations, run:
> ```
> sudo snap connect mailspring:removable-media
> ```
> If you need access to a specific directory outside your home folder that isn't removable media, you may need to either move the files to your home directory first, or switch to the `.deb` package from the Mailspring website/releases page, which doesn't have the same sandboxing constraints.

---


### 11. How to change default font on Mac version?
**Thread:** https://community.getmailspring.com/t/how-to-change-default-font-on-mac-version/9011
**Action:** Reply

> Mailspring doesn't currently have a setting to change the default font used in the composer — the font displayed when composing is determined by the app's CSS, and there's no preference for it yet. The font used in the actual sent email is whatever your recipient's mail client renders. If you need a specific font in the body of your emails, you can set it manually per-message using the Format toolbar in the composer (the "A" with formatting options). A global default composer font is a commonly requested feature — it's worth adding a vote/comment on the GitHub issue tracker if you'd like to see it prioritized.

---


### 12. Issues with Syncing Gmail Labels in Mailspring
**Thread:** https://community.getmailspring.com/t/issues-with-syncing-gmail-labels-in-mailspring/9129
**Action:** Reply

> Gmail labels that are hidden in Gmail's web settings ("Show in IMAP" is off) won't appear in Mailspring. To fix this:
> 1. Go to Gmail Settings → Labels in your browser.
> 2. For each label you want to see in Mailspring, make sure **"Show in IMAP"** is enabled.
> 3. Back in Mailspring, go to Preferences → General → Local Data → **Reset Cache** to force a fresh sync.
> Some nested labels (sublabels) can also be finicky — Gmail exposes them to IMAP with `/` as a separator, and occasionally they don't surface cleanly. If you're still missing specific labels after following those steps, let me know which ones and I can dig further.

---


### 13. Spellcheck not working Dec 2024
**Thread:** https://community.getmailspring.com/t/spellcheck-not-working-dec-2024/9110
**Action:** Reply

> A few things that can cause spellcheck to appear non-functional on Windows:
> 1. Make sure the correct language is set — go to Preferences → Composer and check the "Spellcheck language" dropdown. If it's set to a language that doesn't match what you're typing, no words will be flagged.
> 2. Spellcheck only highlights words with red underlines in the composer window — it won't flag anything in the message preview pane.
> 3. On Windows, Mailspring uses a built-in dictionary. If you recently updated and spellcheck stopped working, try going to Preferences → General → Local Data → Reset Cache and restarting the app.
> If none of those help, what language are you writing in and what version of Mailspring are you on?

---


### 14. Mailspring doesn't sync deleted/moved e-mails with my iCloud
**Thread:** https://community.getmailspring.com/t/mailspring-doesnt-sync-deleted-moved-e-mails-with-my-icloud/9144
**Action:** Reply

> This is a known limitation with iCloud's IMAP IDLE implementation. Mailspring relies on IMAP IDLE (server push) to be notified of changes made on other devices, but iCloud's IDLE support is inconsistent — it often doesn't push deletions or moves made externally. The sync engine does also poll periodically, so changes should eventually appear in Mailspring, but not always in real-time. A workaround is to manually trigger a sync by clicking the refresh icon or switching folders, which forces an immediate IMAP check. Unfortunately there's no way to work around iCloud's server-side limitation until Apple improves their IMAP IDLE support.

---


### 15. Excluding accounts from Unified Inbox
**Thread:** https://community.getmailspring.com/t/excluding-accounts-from-unified-inbox/9064
**Action:** Reply

> There's no built-in option to exclude a specific account from the Unified Inbox view — when you're in "All Accounts" mode, all accounts are included. The workaround is to use the per-account Inbox views instead: click on an individual account in the left sidebar to see only that account's inbox. You can also right-click accounts in the sidebar to reorder them. Filtering certain accounts out of the unified view is a reasonable feature request — if you'd like to see it added, filing an issue at https://github.com/Foundry376/Mailspring would be the best place to track it.

---


### 16. Any way to delete message individually - not the whole conversation
**Thread:** https://community.getmailspring.com/t/any-way-to-delete-message-individually-not-the-whole-conversation/9023
**Action:** Reply

> Mailspring doesn't currently support deleting individual messages from a thread — the delete action applies to the entire thread. This is a deliberate design choice aligned with how Gmail and many modern email clients handle conversations, but I understand it's not always what you want. The closest workaround is to move the specific message to Trash using a mail rule, or to use the web interface for your email provider when you need to remove a single message. Individual message deletion is something we could look at adding in the future.

---


### 17. Unsent messages/Outbox?
**Thread:** https://community.getmailspring.com/t/unsent-messages-outbox/8943
**Action:** Reply

> If a message fails to send (e.g. due to a network error), Mailspring keeps the draft in the **Drafts** folder — it won't be lost. You can find it there and try resending. Mailspring doesn't have a traditional "Outbox" folder for queued/failed messages, but anything that didn't go through will remain as a draft with the content intact. If you're seeing messages disappear after a send failure without ending up in Drafts, that would be a bug worth reporting with your OS and Mailspring version.

---


### 18. Getting read receipts in gmail client
**Thread:** https://community.getmailspring.com/t/getting-read-reciepts-in-gmail-client/8973
**Action:** Reply + mark Resolved

> Mailspring's read receipts (open tracking) are a feature of the Mailspring desktop app — they work by embedding a tiny invisible image in your outgoing emails that pings Mailspring's server when loaded. This is not something you can access through Gmail's browser interface. To use read receipts, you need to send the email from the Mailspring app with the eye/tracking icon enabled in the composer. Gmail's own web client has a separate "request read receipt" feature for Google Workspace accounts, but that's a different mechanism entirely.

---


### 19. How to create a distribution list
**Thread:** https://community.getmailspring.com/t/how-to-create-a-distribution-list/7722
**Action:** Reply

> Mailspring has a **Contact Groups** feature that works as a distribution list. To create one:
> 1. Click the **Contacts** icon in the bottom-left of the sidebar.
> 2. In the left panel, click the **+** button next to "Groups" to create a new group and give it a name.
> 3. Add contacts to the group by dragging them in, or by selecting a contact and using the group membership section.
> When composing an email, start typing the group name in the To/CC field and Mailspring will autocomplete it — selecting the group expands it into all the individual addresses.

---


### 20. Different authentication and sending email for SMTP
**Thread:** https://community.getmailspring.com/t/different-authentication-and-sending-email-for-smtp/9006
**Action:** Reply

> The error "550 5.7.60 Client does not have permissions to send as this sender" means the SMTP server is rejecting the From address because it doesn't match the authenticated username. This is a server-side permission issue — the account you're authenticating as needs to be granted "Send As" rights for the address you want to use. You'll need to configure this on your university's mail server (typically done by an admin via Exchange/Office365 management). Mailspring itself doesn't add any extra From address — it sends exactly the address you configure in Preferences → Accounts → your account → "From name / email". If your IT admin has granted Send As rights and it's still failing, double-check that the "Email Address" field in Mailspring matches exactly the address you've been granted rights to send as.

---


### 21. Painful edition of long mail. Editor jumps at end of mail
**Thread:** https://community.getmailspring.com/t/painful-edition-of-long-mail-editor-jumps-at-end-of-mail/8998
**Action:** Reply

> This is a known issue with the Slate-based composer editor when working with long emails that contain quoted text. The cursor jump to the end appears to be triggered by the editor re-rendering in response to auto-save or other background events, which resets scroll and focus position. It affects both macOS and Linux users. There's no perfect workaround right now, but a few things that can help: collapsing the quoted text (click the `...` toggle) before editing reduces the editor complexity, and writing your reply in a shorter window sometimes avoids the trigger. This is something I want to fix properly — the root cause is in how the editor handles focus after async updates.

---


### 22. Error sending emails - errorsendmessage
**Thread:** https://community.getmailspring.com/t/error-sending-emails-errorsendmessage/7098
**Action:** Reply

> Intermittent send failures like this are almost always SMTP connection reliability issues rather than a Mailspring bug — the connection to the SMTP server drops or times out mid-send, and the retry usually succeeds because a fresh connection is established. A few things worth checking:
> 1. If you're on a VPN or behind a corporate firewall, the connection may be getting interrupted.
> 2. Check your SMTP security settings (Preferences → Accounts → your account) — if your server supports STARTTLS on port 587, that can sometimes be more stable than SSL/TLS on 465.
> 3. Logs are in `~/.config/Mailspring/logs/` (Linux) or `~/Library/Application Support/Mailspring/logs/` (macOS) — searching for "ErrorSendMessage" there will show the underlying error, which helps diagnose the root cause.

---


### 23. I am only getting new-mail-notifications for my mail on the top
**Thread:** https://community.getmailspring.com/t/i-am-only-getting-new-mail-notifications-for-my-mail-on-the-top/9059
**Action:** Reply

> Notifications in Mailspring fire for any new unread message that arrives in an inbox folder, regardless of which account it's in — there's no account-level filtering in the notification code. If you're only getting notifications for one account, the most likely cause is that the other three accounts aren't syncing properly. Check each account's sync status by clicking on it in the sidebar — if you see a "Sync Error" badge or the inbox isn't updating, that account's sync engine may have stalled. Try going to Preferences → General → Local Data → Reset Cache, or remove and re-add the affected accounts. Also confirm that all four accounts have notifications enabled in your OS notification settings.

---
