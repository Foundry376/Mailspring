# Mailspring Discourse Reply Drafts — 2026-07-03

### 1. New version notification does not respect "dismiss"
**Thread:** https://community.getmailspring.com/t/new-version-notification-does-not-respect-dismiss/14495
**Action:** Reply

> Thanks for the detailed repro — you're right, this is a bug. The update banner's "Dismiss" only clears it for the current app session; it isn't saved to disk, so a cold start shows it again even though you already dismissed it. There's no "don't show again for this version" option today. I've noted this and will get it fixed in an upcoming release.

### 2. Rule has been disabled - Folder could not be found
**Thread:** https://community.getmailspring.com/t/rule-has-been-disabled-folder-could-not-be-found/14492
**Action:** Reply

> Thanks for the clear writeup, both of these are real bugs. First: rules store the internal ID of the destination folder/label at save time, and if that ID goes stale (for example after a resync recreates the folder) the rule fails with "the folder could not be found" even though a folder with the same name still exists — it should re-resolve by name/path instead of a fixed ID. Second: "Process entire inbox" doesn't check whether any rules are actually still enabled before it runs, so after your rules get auto-disabled it happily "processes" your whole inbox while doing nothing. No fix in the current release yet, but I've filed both issues.

### 3. Roles are not automatically applied, must run manually to work
**Thread:** https://community.getmailspring.com/t/roles-are-not-automatically-applied-must-run-manually-to-work/14477
**Action:** Reply

> Good catch, and your forwarding theory is on the right track. Automatic rule processing only considers messages newer than a one-time cutoff timestamp, compared against each message's own `Date:` header — not when it actually landed in your inbox. Forwarded mail typically keeps the original sender's `Date:` header, so if that predates the cutoff, the message is silently skipped by the automatic pass even though it's brand new to your inbox. "Process entire inbox" doesn't apply that date filter at all, which is why it clears the backlog every time. This is a real bug on our end, not something you're doing wrong — I've noted it.

### 4. Inconsistency between deleting single mail and multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-mail-and-multiple-mails/14476
**Action:** Reply

> Confirmed — single-select and multi-select deletes go through different selection-tracking code, and only the single-select path currently advances to the next message afterward. It's a genuine inconsistency, not intentional. I've noted it as a bug; no fix in the current release yet.

### 5. Mailspring not collecting and adding email address starting with info@
**Thread:** https://community.getmailspring.com/t/mailspring-not-collecting-and-adding-email-address-starting-with-info/14481
**Action:** Reply

> I dug into the composer's contact search and there's no filter in the app that excludes "info@" addresses specifically — no stopword list, no minimum-length rule. The search does skip any contact your account hasn't accumulated enough references to yet, which points to the underlying local search index in the sync engine rather than the composer UI. I don't have a definitive root cause to share yet, but wanted to let you know it's not an intentional exclusion — I'll keep digging.

### 6. Bug: New signature image overwrote old assets on Mailspring server
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server-affecting-old-emails-and-shared-accounts/14480
**Action:** Reply

> Sorry about that — I found the bug. Signature images normally get a unique ID as part of their filename, but if you upload an image while no signature is currently selected (which is the state right after deleting your last signature), the upload falls back to a non-unique filename shared by anyone who hits that same edge case, which is exactly the collision you saw. I've noted it as a bug to fix. In the meantime, always have at least one signature created/selected before adding an image to avoid hitting that state.

### 7. IMAP does not work
**Thread:** https://community.getmailspring.com/t/imap-does-not-work/14479
**Action:** Reply + mark Resolved

> Glad the connection itself is working now. The "two inboxes" situation happens because Mailspring doesn't automatically detect that a Gmail account added via generic IMAP is the same mailbox as one added through the native Gmail connection — they end up as two separate accounts. The fix is to remove the duplicate: go to Preferences → Accounts, and delete the plain-IMAP version of the account, keeping the Gmail one (or vice versa, whichever you set up correctly). Marking this resolved since the underlying connection issue is fixed — let us know if the duplicate-account cleanup doesn't do the trick.

### 8. JMAP support
**Thread:** https://community.getmailspring.com/t/jmap-support/14487
**Action:** Reply

> We don't support JMAP today — Mailspring's sync engine is built around IMAP/SMTP. It's an interesting protocol and I get the appeal, but it'd be a substantial rework of the sync engine, so it's not on the near-term roadmap. I'll note it as a feature request in case that changes.

### 9. Archive subfolders
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> There's no built-in way to do this today — Archive sends everything to a single folder/label per account, and there's no preference for auto-filing into year/month subfolders. You'd need a mail rule per time period (which isn't practical for "this year" going forward) or a plugin; I'm not aware of one that does this already. I'll note it as a feature request.

### 10. Attachments to emails / sending
**Thread:** https://community.getmailspring.com/t/attachments-to-emails-sending/14485
**Action:** Reply + mark Resolved

> Not missing anything — click the paperclip icon in the composer toolbar (bottom of the compose window) to browse for a file, or just drag and drop a file straight into the compose window and it'll attach.

### 11. Installation error
**Thread:** https://community.getmailspring.com/t/installation-error/14484
**Action:** Reply

> Sorry for the rough start. "Problem with your local email database... mailsync: 0" on a totally fresh install is usually antivirus/Windows Defender quarantining or blocking `mailsync.exe` from running (it's a background helper process Mailspring depends on) — worth checking your AV logs and adding an exclusion for the Mailspring install folder. If that's not it, could you open the "View Log" link on the error and paste a few more lines here? That'll tell us exactly where it's failing.

### 12. Attachments not showing in correct order
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> This is a known limitation, not something specific to Mailspring's code — when multiple files are dropped or selected at once, the browser/OS layer underneath doesn't guarantee it hands them over in the same order they appeared in File Explorer, and Mailspring just attaches them in whatever order it receives. I don't have a clean fix to offer right now (sorting alphabetically could just as easily produce results you don't want), but I've noted the report.

### 13. Can't upgrade
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply

> Sorry about that. We recently moved the payment flow out of the in-app modal to launch on the web with a newer Stripe integration (this shipped in 1.22.0), so a 500 there is worth reporting directly — could you email support@getmailspring.com with the approximate time you saw the error and which browser/card type you used? That'll let the team check the Stripe logs on our end, which isn't something I can see from here.

### 14. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply

> Mailspring relies on IMAP IDLE (push) rather than periodic polling, so new mail should normally show up within seconds on providers that support it well. There's currently no manual "check now" button — if IDLE isn't working reliably for your provider, delays are the fallback behavior rather than a setting we can tune. If this is happening consistently, let us know which provider you're using; some providers handle IDLE connections less reliably than others.

### 15. Send via mail opens new email dialog but doesn't attach file
**Thread:** https://community.getmailspring.com/t/send-via-mail-opens-new-email-dialog-but-doesnt-attach-file/14469
**Action:** Reply + mark Resolved

> This is expected as of Mailspring 1.21.0 — we removed support for the `?attach=` parameter on `mailto:` links as part of a security hardening pass (arbitrary local file paths in a URL scheme handler is a risky combination). Nautilus's "send via email" integration for local files unfortunately relies on that parameter, so it's no longer able to attach the file automatically. The compose window still opens, you'll just need to attach the file manually. Sorry for the regression in convenience — it was a deliberate security tradeoff.

### 16. SMTP test failing with response code 554
**Thread:** https://community.getmailspring.com/t/smtp-test-failing-with-response-code-554/14467
**Action:** Reply

> That "554 5.7.1 Spam message rejected" is coming from your provider's SMTP server, not from Mailspring — during setup we send a real test message through your own SMTP credentials, so if your provider's spam filtering flags that outbound message, the rejection happens on their end before we ever see a successful send. Worth checking your provider's outbound/anti-spam settings or asking their support if there's a temporary block on your account or IP. If it turns out to be something in how Mailspring formats the test message, let us know and we'll take a closer look.

### 17. Cant add IMAP / SMTP Account
**Thread:** https://community.getmailspring.com/t/cant-add-imap-smtp-account/14465
**Action:** Reply + mark Resolved

> Glad 1.22.0 fixed it for you! Marking this resolved.

### 18. Installation/running issues on Debian stable (.deb, snap)
**Thread:** https://community.getmailspring.com/t/installation-running-issues-on-debian-stable-deb-snap/14463
**Action:** Reply

> The keyring error is a known category of issue — Mailspring uses Electron's secure storage for your account credentials, which on Linux requires a running secret service (GNOME Keyring or KWallet). If kwalletd/gnome-keyring aren't accessible to the sandboxed snap or picked up correctly by the .deb build, password storage fails outright. We have a troubleshooting doc for exactly this: https://community.getmailspring.com/t/password-management-error/199 — worth checking that your keyring daemon is actually unlocked and running before Mailspring starts, not just installed. If that doesn't resolve it, let us know exactly which error dialog you see.

### 19. Accents do not work (flatpack, rpm)
**Thread:** https://community.getmailspring.com/t/accents-do-not-work-flatpack-rpm/14462
**Action:** Reply

> This smells like an IBus/input-method issue rather than something in Mailspring's own code — Electron apps distributed as Flatpaks are a common source of this exact problem, since the Flatpak sandbox can block the app from talking to the system's IBus daemon unless the right portal permission is granted. Worth checking `flatpak run --devel --env=GTK_IM_MODULE=ibus com.getmailspring.Mailspring` from a terminal to see if that changes anything, and confirming IBus (or your input method of choice) is set as the system default outside the sandbox too. If the RPM build has the same problem, that points more toward a GTK/locale configuration issue on Fedora itself. Let us know what you find — happy to dig further with more specifics.

### 20. Service Crash
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> 1.22.0 (released last month) fixed several sync-engine null-pointer crashes that were showing up in our crash reports, so if you haven't updated yet that's the first thing to try. If `mailsync.bin` is still crashing after updating, it should keep auto-restarting without losing your mail, but I'd like to fix the underlying issue — if you can grab the crash details from `~/.config/Mailspring/mailsync.log` around the time it happens and share them, that'll help track it down.

### 21. Mail stuck in the Deleted folder
**Thread:** https://community.getmailspring.com/t/mail-stuck-in-the-deleted-folder/14459
**Action:** Reply + mark Resolved

> Glad rebuilding the cache fixed it — that's the right move when a folder's local state gets out of sync with the server (Preferences → Accounts → select the account → "Rebuild Cache"). Marking resolved.

### 22. 163.com 126.com Email cannot be synchronized and displayed
**Thread:** https://community.getmailspring.com/t/163-com-126-com-email-cannot-be-synchronized-and-displayed/14454
**Action:** Reply

> This is a known limitation with NetEase's mail servers (163.com/126.com) — they restrict IMAP clients from creating custom folders on their end, and Mailspring needs to create a couple of small internal folders (including one used for Snoozed messages) the first time it syncs an account. That folder-creation failure is what you're seeing in the log. It's non-fatal to normal mail sync — your existing folders should still sync — but the Snooze feature specifically won't work on these providers. There isn't a workaround on our side since it's a server-side restriction from NetEase.

### 23. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> I checked our provider settings and Mailspring's shaw.ca preset correctly specifies port 993/SSL, and nothing in the account setup code overrides a manually-entered port — user-entered settings always take priority over the preset. That means if it's actually connecting on 143, the override is happening lower down (in the sync engine itself, or possibly something intercepting the connection, like the VPN in your case). Could you try disabling NordVPN completely (not just pausing it) and removing/re-adding the account fresh with explicit port 993 to rule out a cached bad config? If it still forces 143 with the VPN fully off, let us know and I'll escalate — that would point to a real bug on our end.

### 24. Syncing settings between multi installs
**Thread:** https://community.getmailspring.com/t/syncing-settings-between-multi-installs/14494
**Action:** Reply

> There's no built-in sync for app preferences (themes, signatures, keybindings, etc.) between installs today — those all live in a local `config.json` on each machine and aren't tied to your Mailspring account. The only things that follow you automatically are server-side features tied to your account itself, like Send Later/Snooze. If you want the same setup on both laptops, the only option right now is manually copying your `config.json` from one machine's Mailspring config folder to the other's (back up the destination file first) — not officially supported, but it generally works for simple preference values.

### 25. Spoof Guard — phishing / spoofing / scam detection with a risk score, reasons, and optional auto-move to Spam
**Thread:** https://community.getmailspring.com/t/spoof-guard-phishing-spoofing-scam-detection-with-a-risk-score-reasons-and-optional-auto-move-to-spam/14493
**Action:** Reply

> This is fantastic — thank you for building it and writing up such a clear rundown of what it does. SPF/DKIM/DMARC visibility plus a plain-language risk score is exactly the kind of thing that's hard to justify building into the core app for everyone, but is a perfect fit as a plugin. Great shoutout to mailspring-auth-results too. Nice work!

### 26. Gmail: threads with differing subjects get split apart (mailing-list patch series)
**Thread:** https://community.getmailspring.com/t/gmail-threads-with-differing-subjects-get-split-apart-mailing-list-patch-series/14498
**Action:** Reply

> Good writeup of the mechanism — you're right that on Gmail accounts Mailspring currently follows Gmail's own `X-GM-THRID` thread grouping rather than threading by `In-Reply-To`/`References` headers, so subject changes within a genuinely linked conversation (like a patch series) split it apart. There's no setting today to switch threading strategy per account. I'll note it as a feature request — it'd be a meaningful but doable change for Gmail accounts specifically.

### 27. Select all - Limited to 200 messages?
**Thread:** https://community.getmailspring.com/t/select-all-limited-to-200-messages/6727
**Action:** Reply

> Confirmed, and it's a known limitation: "Select All" only selects the messages currently loaded into the list's rendering window, not the entire folder — that's why scrolling further reveals more unselected messages. Shift-click/Shift+End can extend a selection further than Ctrl/Cmd+A alone, but there's no single action that reliably selects an entire large folder in one shot today. A true "select entire folder regardless of size" operation would need real backend support (bulk operations by query rather than by an in-memory list of IDs), which we don't have yet. I don't have a timeline, but I've bumped this thread since it keeps coming up.

### 28. Chinese Inputer not compatible
**Thread:** https://community.getmailspring.com/t/chinese-inputer-not-compatible/745
**Action:** Reply

> This is a long-standing, known limitation in how the composer's rich-text editor handles IME composition events at high typing speed — it's not specific to Chinese input, Japanese users have hit the same underlying issue. We've patched several IME edge cases over time, but haven't fully solved the fast-typing case. The most reliable workaround right now: Preferences → Composing → set Default Message Format to Plain Text. Several users have confirmed this avoids the corruption entirely, at the cost of losing rich-text formatting in your replies. Sorry it's taken this long — it's still on our radar.

### 29. When I input Japanese, the sentence disappears during the input
**Thread:** https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535
**Action:** Reply

> Still a known issue in the rich-text composer's IME handling, as a couple of you have found the hard way recently. The most reliable workaround remains switching Preferences → Composing → Default Message Format to Plain Text, which several people in this thread (and the linked Chinese-input thread) have confirmed fixes it, at the cost of rich-text formatting. I know this has been open a long time — it's a deep editor-engine limitation, not something we've been ignoring, but I don't have a timeline for a full fix yet.

### 30. Connecting Mailspring to Microsoft Office 365 and Outlook.com
**Thread:** https://community.getmailspring.com/t/connecting-mailspring-to-microsoft-office-365-and-outlook-com/14394
**Action:** Reply

> 1.22.0 (released last month) included a specific fix for Outlook account setup — if you're still on an older version, please update and try connecting again. If it's still failing on 1.22.0, let us know the exact error message/screen you're stuck on and we'll dig further; "any spec configuration" is a bit too vague for me to diagnose blind.

### 31. Setting up connection to spectrum
**Thread:** https://community.getmailspring.com/t/setting-up-connection-to-spectrum/6481
**Action:** Reply

> To answer the cert question: the certificate your browser shows you for a provider's website (e.g. visiting spectrum.net) is generally not the same certificate their IMAP/SMTP mail servers present — those are frequently different hostnames/services with their own certs, even if issued by the same certificate authority. There isn't a way to "import" a website's public key into Mailspring for IMAP purposes; Mailspring validates the mail server's own TLS certificate directly when it connects. If you're seeing a certificate error connecting to Spectrum's mail servers specifically, that's most likely their IMAP/SMTP server using an unexpected or self-signed cert — worth double-checking the exact IMAP/SMTP hostnames Spectrum publishes for mail access (they're often different from the main website).

### 32. Certificate Error when connecting account
**Thread:** https://community.getmailspring.com/t/certificate-error-when-connecting-account/190
**Action:** Reply

> Answered this in more detail over on your Spectrum thread, but short version: a website's HTTPS certificate and a mail server's IMAP/SMTP certificate are usually different things (often different hostnames entirely), so there's no way to reuse one for the other — Mailspring checks the mail server's own certificate directly when connecting.

### 33. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> I traced through how Reply-All computes recipients and couldn't find anything that would drop CC'd people from a genuine reply-all send — everyone from the original message's To and Cc should end up cc'd on your reply, minus yourself. One thing worth checking: Reply-All in Mailspring reflects the recipients of the *specific message* you're replying to, not the whole thread — if you replied to an earlier message in the thread (or one where a mailing list/expander had already trimmed the Cc list before Mailspring ever saw it), that would explain a shorter-than-expected recipient list without any bug on our end. If you can reproduce it and check the To/Cc fields in the compose window *before* hitting send next time, that'll tell us definitively whether it's a display issue or an actual bug.

### 34. Reply All 123456789
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply

> The Reply-All option (and its dedicated button/menu item) only appears on a message that actually has more than one recipient in its own To/Cc fields — if the specific message you're viewing was sent to just you (even as part of a "group" conversation overall), Mailspring won't show Reply-All for that message since there'd be no one else to include. Worth checking "Show Original" on that message to confirm who was actually in the To/Cc — if there genuinely were other recipients and Reply-All still didn't show, let us know and we'll look closer.
