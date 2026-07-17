# Mailspring Discourse Reply Drafts — 2026-07-17

### 1. Send via mail opens new email dialog but doesn't attach file
**Thread:** https://community.getmailspring.com/t/send-via-mail-opens-new-email-dialog-but-doesn-t-attach-file/14469
**Action:** Reply + mark Resolved

> Thanks for the detailed report — this one's actually expected behavior, not a bug. In 1.21.0 we removed support for the `?attach=`/`?attachment=` parameter in `mailto:` links as part of a security pass (an app that lets any web page or file manager attach an arbitrary local file just by constructing a URL is a real file-disclosure risk). What you're seeing — the raw `&attachment=/path/to/file` text landing in the message body — is just the leftover query string being swallowed into the body since we no longer parse that parameter. Unfortunately this means Nautilus's "Send To > Email" won't auto-attach the file anymore; you'll need to drag it into the compose window or use the attach button directly.

### 2. Can't add IMAP / SMTP Account
**Thread:** https://community.getmailspring.com/t/cant-add-imap-smtp-account/14465
**Action:** Reply + mark Resolved

> Glad to hear 1.22.0-1 sorted this out — thanks for following up and letting us know!

### 3. New version notification does not respect "dismiss"
**Thread:** https://community.getmailspring.com/t/new-version-notification-does-not-respect-dismiss/14495
**Action:** Reply

> You're right, and I confirmed this in the code — clicking "dismiss" only hides the banner for that session; we don't persist which version you already dismissed, so the same notification comes right back on your next launch. It's a real bug, not intentional. I don't have a fix in this release, but I've noted it — the fix is to remember the dismissed version rather than just the in-memory dismiss state.

### 4. Not showing notification alert in mac for new incoming emails
**Thread:** https://community.getmailspring.com/t/not-showing-notification-alert-in-mac-for-new-incoming-emails/14499
**Action:** Reply

> A few things worth checking: first, make sure **Preferences > Notifications > "Show notifications for new unread messages"** is enabled. Second, check macOS System Settings > Notifications to confirm Mailspring itself has permission and isn't set to "None." Third, check that Focus/Do Not Disturb isn't on — Mailspring intentionally suppresses notifications while DND is active. One more nuance: notifications only fire for mail that arrives *after* Mailspring is already running and only for Inbox messages, so anything synced during a cold launch, or landing in a different folder, won't trigger an alert. If all of that checks out and it's still not showing, let me know and I'll dig further.

### 5. Archived Account option (for old accounts you want to keep offline)
**Thread:** https://community.getmailspring.com/t/archived-account-option-for-old-accounts-you-want-to-keep-offline-but-dont-have-server-access-any-more/14500
**Action:** Reply

> There's no "archived"/offline toggle for accounts today — I checked, and the only account-level states we track are sync-health flags (ok / auth failed / sync error), not anything a user can set to pause auth attempts while keeping the account's mail browsable. Right now it's all-or-nothing: keep the account (and get the red error) or remove it (which deletes the local cache too). This is a reasonable feature request though — I'll note it as one to consider, since I can see this being useful for anyone dealing with an old job's mailbox.

### 6. Gmail: threads with differing subjects get split apart (mailing-list patch series)
**Thread:** https://community.getmailspring.com/t/gmail-threads-with-differing-subjects-get-split-apart-mailing-list-patch-series/14498
**Action:** Reply

> This is determined entirely by the sync engine, which groups messages into threads using Gmail's own `X-GM-THRID` rather than `In-Reply-To`/`References` headers — there's no client-side override for this in the Electron app today, so a preference to thread by headers instead would require a sync engine change, not just a UI toggle. I don't have that on a near-term roadmap, but I'll note the request — it's a reasonable one for mailing-list-style workflows.

### 7. Installation/running issues on Debian stable (.deb, snap)
**Thread:** https://community.getmailspring.com/t/installation-running-issues-on-debian-stable-deb-snap/14463
**Action:** Reply

> This is almost certainly the Linux keyring requirement — Mailspring stores your account passwords using Electron's secure storage, which on Linux requires a running secret-service provider like GNOME Keyring or KWallet. If neither is reachable (even if installed, it needs to actually be running and unlocked in your session), account setup will fail. We have a doc on this here: https://community.getmailspring.com/t/password-management-error/199 — worth checking that kwallet/gnome-keyring is actually running (not just installed) in your Parrot OS session. As for the snap `/usr/bin/mailspring` not found issue, that's likely a PATH/symlink quirk of how snap exposes binaries — try launching via `snap run mailspring` directly to confirm the app itself works before troubleshooting the command shortcut.

### 8. Bug: New signature image overwrote old assets on Mailspring server
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server-affecting-old-emails-and-shared-accounts/14480
**Action:** Reply

> I dug into this and you've found a real, legitimate bug. Signature images are uploaded to our asset server using a filename derived from the signature's own internal ID (`sig-<id>.png`), not from the image's content — so if two signatures ever end up sharing that ID, uploading a photo to one silently overwrites the other's stored file everywhere it's referenced. I don't have enough detail from what's posted here to know exactly how the ID collision happened on your shared account, but the storage design itself is unsafe and needs to be content-hashed instead. I've flagged this for a fix. In the meantime, avoid creating and deleting signatures with images on that shared account until this is addressed — if you still have the original image file, re-uploading it to the correct signature should restore it for everyone.

### 9. Attachments not showing in correct order
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> Confirmed this is a real bug — when you attach multiple files at once, each one is copied into the app's internal storage via its own independent async operation, and whichever finishes first lands first in the attachment list. Since copy time depends on file size, a small file dispatched second can finish before a larger file dispatched first, scrambling the order you originally selected them in. It's a race condition, not intentional behavior. No fix in the current release — if order matters for a given email, attaching files one at a time (rather than a multi-select) will preserve order for now.

### 10. Mailspring not collecting and adding email address starting with "info@"
**Thread:** https://community.getmailspring.com/t/mailspring-not-collecting-and-adding-email-address-starting-with-info/14481
**Action:** Reply

> I tracked this down — it's not specific to "info@" addresses. Contact search only surfaces contacts with a positive "reference count" (a tally the sync engine keeps of how much you've actually corresponded with that address); any contact stuck at zero, for any reason, won't show up in autocomplete no matter what you type. So this would affect any address that hasn't accumulated that count yet, not just ones starting with "info." I don't have full visibility into exactly why this particular address never accumulated references on your end, but that's the mechanism. I've noted this as worth revisiting since it can make legitimate, frequently-used addresses invisible to search.

### 11. Rule has been disabled - Folder could not be found
**Thread:** https://community.getmailspring.com/t/rule-has-been-disabled-folder-could-not-be-found/14492
**Action:** Reply

> I looked into this — when "Process entire inbox" hits a rule whose target folder/label can't be resolved, that specific rule gets disabled and the whole batch job stops right there (which is likely why it looked like everything got marked red — the rest of the queue never got a chance to run and show they're fine). Clicking "Process entire inbox" again then skips the now-disabled rule and successfully processes the rest with the remaining valid rules, which matches what you saw. I wasn't able to pin down exactly why a folder chosen from the dropdown fails the lookup — if you can tell me whether the target is a Gmail label or a real IMAP folder, and whether it was renamed or recreated recently, that would help me track down the root cause.

### 12. Mailspring linux messages rules not saved
**Thread:** https://community.getmailspring.com/t/mailspring-linux-messages-rules-not-saved/14509
**Action:** Reply

> Found a real bug here — mail rule edits are saved to local storage on a short debounce (about a second), but there's no "flush before quit" safeguard like some of our other stores have. If you edit a rule and quit the app within that window, the edit never gets written to disk and is lost on next launch. I didn't find anything Linux-specific about it in the code, but it's a legitimate gap regardless of platform. I've flagged this for a fix. In the meantime, waiting a few seconds after editing rules before closing Mailspring should ensure they're saved.

### 13. Roles are not automatically applied, must run manually to work
**Thread:** https://community.getmailspring.com/t/roles-are-not-automatically-applied-must-run-manually-to-work/14477
**Action:** Reply

> This one makes sense given how automatic rule-processing works: Mailspring only auto-applies rules to messages dated after the point the app first started watching your account, while "Process entire inbox" has no such date filter and processes everything. Forwarded mail often keeps its original `Date:` header from before it was forwarded to you, so it can look "older" than that cutoff and get silently skipped by automatic processing — exactly matching what you're describing (works when run manually, not automatically). This is a real gap in the automatic-processing filter and I've noted it for a fix. For now, periodically running "Process entire inbox" is the reliable workaround for rules involving forwarded mail.

### 14. My mail rules are being ignored
**Thread:** https://community.getmailspring.com/t/my-mail-rules-are-being-ignored/76
**Action:** Reply

> Following up on this old thread with an actual answer, five years later — sorry for the wait. I dug into the rules engine and found a likely explanation: automatic rule processing only evaluates messages dated after the point Mailspring first started watching your account, while manually running "Process entire inbox" has no such filter. Any message with a `Date:` header that predates that cutoff (which can happen with clock-skewed senders, some newsletter/mailer software, or forwarded mail preserving an original date) gets silently skipped by the automatic path even though the rule conditions clearly match. That fits the "some emails just don't get filtered, with no obvious pattern" reports in this thread. I've noted this as a bug to fix in the automatic-processing filter.

### 15. Email reminders no longer being sent
**Thread:** https://community.getmailspring.com/t/email-reminders-no-longer-being-sent/14502
**Action:** Reply

> I think I found the likely cause. In 1.22.0 we changed how reminders get attached to a thread after you send — instead of the app doing the work client-side, we now rely on a signal (a `thread:` metadata prefix) that the sync engine is supposed to recognize and act on when your message sends. If the sync engine on your machine hasn't picked up its half of that change yet (it updates somewhat independently of the main app), that signal is silently a no-op — your email sends fine, but the reminder metadata never lands on the thread, and the Reminders folder stays empty with no error shown anywhere. I can't confirm this with full certainty without your logs, but the timing and symptoms line up well. I'll keep digging on this — in the meantime, try Preferences > rebuild your account's cache, which forces a fresh sync engine handshake and may resolve it.

### 16. Inconsistency between deleting single mail and multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-mail-and-multiple-mails/14476
**Action:** Reply

> Confirmed, this is a real gap. When you delete a single focused email, the list explicitly advances focus to the next item. But when you delete a multi-selected batch, that "selection" is a separate piece of state from "focus," and it's intentionally cleared as soon as you check more than one item — so there's nothing left to compute "what should be focused next" once the delete happens. I've noted this as a bug to fix so bulk deletes get the same auto-advance behavior as single deletes.

### 17. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> I went through the reply-all code and couldn't find a path that would genuinely truncate a Reply All send down to one recipient — so if you clicked the explicit "Reply All" button/arrow, that shouldn't happen, and I'd want to see the specific email if it does. That said, there's a likely explanation for what you saw: Mailspring's inline quick-reply box defaults to a plain "Reply" (not Reply All) unless you've changed **Preferences > General > Sending > "Default reply behavior"** to Reply All. If a plain reply draft was already open from that default and you hit send without noticing, it would go only to the original sender — which looks identical to "reply all only went to the first person." Worth checking that preference, and using the explicit Reply All button/arrow rather than the inline box when you need to make sure everyone's included.

### 18. Reply All 123456789
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply

> The Reply All button/arrow only appears when there's actually more than one recipient to reply to (i.e., more than one "To" address, or any CC) — so if you're not seeing it, double check the original message actually had other recipients. Also worth checking **Preferences > General > Sending > "Default reply behavior"** — if it's set to plain "Reply," the inline quick-reply box in the message list will default to that instead of Reply All, which might be what you're running into rather than the button being missing entirely.

### 19. Still duplication sent on outlook
**Thread:** https://community.getmailspring.com/t/still-duplication-sent-on-outlook/14517
**Action:** Reply

> Thanks for digging up the earlier thread — I want to be upfront that this is a genuinely long-standing, unresolved issue on our end, not something you're missing a setting for. And you're right that Microsoft has since removed the "disable saving sent items" option from outlook.live.com, so that old workaround isn't available anymore either. The root cause is on our side (an off-by-one in how we detect whether the Outlook server already saved a copy), and it hasn't been fixed yet. I don't have a timeline to share, but I wanted to confirm you're not missing something simple — this is a known gap.

### 20. Why can't I use a Picture for a Background?
**Thread:** https://community.getmailspring.com/t/why-cant-i-use-a-picture-for-a-background-the-basic-themes-are-ugly/14514
**Action:** Reply

> Totally fair feedback. To be upfront: there's no built-in way to set a custom photo as a background today — themes in Mailspring are CSS/LESS-based packages (like the ones in our theme picker), not image-based skins, so there isn't a simple "pick a JPG" option. It is technically possible to build a custom theme package that sets a background image via CSS, but that requires writing a small theme package rather than clicking a button in the UI — not something we have a friendly path for yet. I'll note the ease-of-use gap here as feedback.

### 21. Could the Templates Panel BE Any Smaller?
**Thread:** https://community.getmailspring.com/t/could-the-templates-panel-be-any-smaller/14504
**Action:** Reply

> Appreciate the detailed writeup. To be honest about where things stand: there's no resizable panel, no folder/category grouping for templates, and no way to enlarge the quick-insert dropdown today — it's a fairly basic flat-list implementation. None of that is a deliberate design choice so much as the feature just not having gotten more investment yet. I'm noting all three points as feedback for a templates UI pass.

### 22. Archive subfolders
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> There's no built-in way to auto-file archived mail into a year/month folder structure — Mailspring's archive action just moves mail to a single configured Archive folder/label. I don't want to give you a false lead on a workaround I haven't verified works reliably, so I'll just say honestly: this isn't supported today, and I'll note it as a feature request. If invoice organization is the main use case, mail rules matching by sender/subject into manually-created folders might get you partway there in the meantime, though it's more manual setup than true auto-dated subfolders.

### 23. When viewing an opened email, pressing the Mouse X Button 1 does nothing
**Thread:** https://community.getmailspring.com/t/when-viewing-an-opened-email-pressing-the-mouse-x-button-1-does-nothing/14507
**Action:** Reply

> This isn't supported today — Mailspring doesn't currently map mouse back/forward buttons to navigation. Reasonable request though, especially since it's a common convention elsewhere. I'll note it; a keybinding-customizable mapping (rather than something hardcoded) is probably the right way to add it eventually.

### 24. Make the message body sync window configurable (currently hardcoded to 3 months)
**Thread:** https://community.getmailspring.com/t/make-the-message-body-sync-window-configurable-currently-hardcoded-to-3-months/14506
**Action:** Reply

> You read that code correctly — that three-month window is hardcoded in the sync engine, and yes, that `TODO pref!` comment is exactly what it looks like: this was always meant to become a user-facing preference and just hasn't been wired up yet. I'll add it to the list of settings worth exposing — thanks for tracking down the exact spot in the source, that's genuinely helpful.

### 25. Syncing settings between multi installs
**Thread:** https://community.getmailspring.com/t/syncing-settings-between-multi-installs/14494
**Action:** Reply

> There's no dedicated "sync my settings across installs" feature. Some things — like signatures and mail templates — are tied to your account and should appear on any install where you're signed into the same account, but general preferences (theme, keyboard shortcuts, notification settings, mail rules, etc.) are stored locally per machine and aren't synced automatically. The most reliable way to replicate a full setup today is manually copying your Mailspring config directory from one machine to the other, but I'd only recommend that while Mailspring is fully closed on both ends to avoid a conflicting write. I'll note "settings sync" as a feature request.

### 26. See menu bar on mouseover in full-screen mode
**Thread:** https://community.getmailspring.com/t/see-menu-bar-on-mouseover-in-full-screen-mode/14516
**Action:** Reply

> We don't currently support revealing the menu bar on hover while in full-screen mode — it's not something we've built. Reasonable request, I'll note it.

### 27. Closing window when Full-screen
**Thread:** https://community.getmailspring.com/t/closing-window-when-full-screen/14515
**Action:** Reply

> This looks like standard Electron/OS full-screen handling rather than something we deliberately coded — the app intercepts the "exit full-screen" behavior before a window-close shortcut takes effect, so you need two steps (exit full-screen, then close) instead of one. I'm not certain there's a clean way to change that without affecting other full-screen behavior, but I'll look into whether Alt+F4 can be made to close directly even while full-screen.

---

**Note:** the 27 replies above are new this week. The 23 below carry forward unposted, still-relevant drafts from the 2026-07-03 and 2026-07-10 runs — those files sat for two straight weeks without review, so I'm consolidating everything into one file rather than leaving three overlapping drafts pending. See my message for more on that.

### 28. Certificate Error when connecting account
**Thread:** https://community.getmailspring.com/t/certificate-error-when-connecting-account/190
**Action:** Reply

> Answered this in more detail over on your Spectrum thread, but short version: a website's HTTPS certificate and a mail server's IMAP/SMTP certificate are usually different things (often different hostnames entirely), so there's no way to reuse one for the other — Mailspring checks the mail server's own certificate directly when connecting.

### 29. When I input Japanese, the sentence disappears during the input
**Thread:** https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535
**Action:** Reply

> Still a known issue in the rich-text composer's IME handling, as a couple of you have found the hard way recently. The most reliable workaround remains switching Preferences → Composing → Default Message Format to Plain Text, which several people in this thread (and the linked Chinese-input thread) have confirmed fixes it, at the cost of rich-text formatting. I know this has been open a long time — it's a deep editor-engine limitation, not something we've been ignoring, but I don't have a timeline for a full fix yet.

### 30. Chinese Inputer not compatible
**Thread:** https://community.getmailspring.com/t/chinese-inputer-not-compatible/745
**Action:** Reply

> This is a long-standing, known limitation in how the composer's rich-text editor handles IME composition events at high typing speed — it's not specific to Chinese input, Japanese users have hit the same underlying issue. We've patched several IME edge cases over time, but haven't fully solved the fast-typing case. The most reliable workaround right now: Preferences → Composing → set Default Message Format to Plain Text. Several users have confirmed this avoids the corruption entirely, at the cost of losing rich-text formatting in your replies. Sorry it's taken this long — it's still on our radar.

### 31. Setting up connection to spectrum
**Thread:** https://community.getmailspring.com/t/setting-up-connection-to-spectrum/6481
**Action:** Reply

> To answer the cert question: the certificate your browser shows you for a provider's website (e.g. visiting spectrum.net) is generally not the same certificate their IMAP/SMTP mail servers present — those are frequently different hostnames/services with their own certs, even if issued by the same certificate authority. There isn't a way to "import" a website's public key into Mailspring for IMAP purposes; Mailspring validates the mail server's own TLS certificate directly when it connects. If you're seeing a certificate error connecting to Spectrum's mail servers specifically, that's most likely their IMAP/SMTP server using an unexpected or self-signed cert — worth double-checking the exact IMAP/SMTP hostnames Spectrum publishes for mail access (they're often different from the main website).

### 32. Select all - Limited to 200 messages?
**Thread:** https://community.getmailspring.com/t/select-all-limited-to-200-messages/6727
**Action:** Reply

> Confirmed, and it's a known limitation: "Select All" only selects the messages currently loaded into the list's rendering window, not the entire folder — that's why scrolling further reveals more unselected messages. Shift-click/Shift+End can extend a selection further than Ctrl/Cmd+A alone, but there's no single action that reliably selects an entire large folder in one shot today. A true "select entire folder regardless of size" operation would need real backend support (bulk operations by query rather than by an in-memory list of IDs), which we don't have yet. I don't have a timeline, but I've bumped this thread since it keeps coming up.

### 33. Connecting Mailspring to Microsoft Office 365 and Outlook.com
**Thread:** https://community.getmailspring.com/t/connecting-mailspring-to-microsoft-office-365-and-outlook-com/14394
**Action:** Reply

> 1.22.0 included a specific fix for Outlook account setup — if you're still on an older version, please update and try connecting again. If it's still failing on 1.22.0, let us know the exact error message/screen you're stuck on and we'll dig further; "any spec configuration" is a bit too vague for me to diagnose blind.

### 34. Mailspring will not authenticate shaw webmail
**Thread:** https://community.getmailspring.com/t/mailspring-will-not-authenticate-shaw-webmail/14452
**Action:** Reply

> I checked our provider settings and Mailspring's shaw.ca preset correctly specifies port 993/SSL, and nothing in the account setup code overrides a manually-entered port — user-entered settings always take priority over the preset. That means if it's actually connecting on 143, the override is happening lower down (in the sync engine itself, or possibly something intercepting the connection, like the VPN in your case). Could you try disabling NordVPN completely (not just pausing it) and removing/re-adding the account fresh with explicit port 993 to rule out a cached bad config? If it still forces 143 with the VPN fully off, let us know and I'll escalate — that would point to a real bug on our end.

### 35. 163.com 126.com Email cannot be synchronized and displayed
**Thread:** https://community.getmailspring.com/t/163-com-126-com-email-cannot-be-synchronized-and-displayed/14454
**Action:** Reply

> This is a known limitation with NetEase's mail servers (163.com/126.com) — they restrict IMAP clients from creating custom folders on their end, and Mailspring needs to create a couple of small internal folders (including one used for Snoozed messages) the first time it syncs an account. That folder-creation failure is what you're seeing in the log. It's non-fatal to normal mail sync — your existing folders should still sync — but the Snooze feature specifically won't work on these providers. There isn't a workaround on our side since it's a server-side restriction from NetEase.

### 36. Mail stuck in the Deleted folder
**Thread:** https://community.getmailspring.com/t/mail-stuck-in-the-deleted-folder/14459
**Action:** Reply + mark Resolved

> Glad rebuilding the cache fixed it — that's the right move when a folder's local state gets out of sync with the server (Preferences → Accounts → select the account → "Rebuild Cache"). Marking resolved.

### 37. Service Crash
**Thread:** https://community.getmailspring.com/t/service-crash/14460
**Action:** Reply

> 1.22.0 fixed several sync-engine null-pointer crashes that were showing up in our crash reports, so if you haven't updated yet that's the first thing to try. If `mailsync.bin` is still crashing after updating, it should keep auto-restarting without losing your mail, but I'd like to fix the underlying issue — if you can grab the crash details from `~/.config/Mailspring/mailsync.log` around the time it happens and share them, that'll help track it down.

### 38. Accents do not work (flatpack, rpm)
**Thread:** https://community.getmailspring.com/t/accents-do-not-work-flatpack-rpm/14462
**Action:** Reply

> This smells like an IBus/input-method issue rather than something in Mailspring's own code — Electron apps distributed as Flatpaks are a common source of this exact problem, since the Flatpak sandbox can block the app from talking to the system's IBus daemon unless the right portal permission is granted. Worth checking `flatpak run --devel --env=GTK_IM_MODULE=ibus com.getmailspring.Mailspring` from a terminal to see if that changes anything, and confirming IBus (or your input method of choice) is set as the system default outside the sandbox too. If the RPM build has the same problem, that points more toward a GTK/locale configuration issue on Fedora itself. Let us know what you find — happy to dig further with more specifics.

### 39. SMTP test failing with response code 554
**Thread:** https://community.getmailspring.com/t/smtp-test-failing-with-response-code-554/14467
**Action:** Reply

> That "554 5.7.1 Spam message rejected" is coming from your provider's SMTP server, not from Mailspring — during setup we send a real test message through your own SMTP credentials, so if your provider's spam filtering flags that outbound message, the rejection happens on their end before we ever see a successful send. Worth checking your provider's outbound/anti-spam settings or asking their support if there's a temporary block on your account or IP. If it turns out to be something in how Mailspring formats the test message, let us know and we'll take a closer look.

### 40. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply

> Mailspring relies on IMAP IDLE (push) rather than periodic polling, so new mail should normally show up within seconds on providers that support it well. There's currently no manual "check now" button — if IDLE isn't working reliably for your provider, delays are the fallback behavior rather than a setting we can tune. If this is happening consistently, let us know which provider you're using; some providers handle IDLE connections less reliably than others.

### 41. Can't upgrade
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply

> Sorry about that. We moved the payment flow out of the in-app modal to launch on the web with a newer Stripe integration (this shipped in 1.22.0), so a 500 there is worth reporting directly — could you email support@getmailspring.com with the approximate time you saw the error and which browser/card type you used? That'll let the team check the Stripe logs on our end, which isn't something I can see from here.

### 42. IMAP does not work
**Thread:** https://community.getmailspring.com/t/imap-does-not-work/14479
**Action:** Reply + mark Resolved

> Glad the connection itself is working now. The "two inboxes" situation happens because Mailspring doesn't automatically detect that a Gmail account added via generic IMAP is the same mailbox as one added through the native Gmail connection — they end up as two separate accounts. The fix is to remove the duplicate: go to Preferences → Accounts, and delete the plain-IMAP version of the account, keeping the Gmail one (or vice versa, whichever you set up correctly). Marking this resolved since the underlying connection issue is fixed — let us know if the duplicate-account cleanup doesn't do the trick.

### 43. Installation error
**Thread:** https://community.getmailspring.com/t/installation-error/14484
**Action:** Reply

> Sorry for the rough start. "Problem with your local email database... mailsync: 0" on a totally fresh install is usually antivirus/Windows Defender quarantining or blocking `mailsync.exe` from running (it's a background helper process Mailspring depends on) — worth checking your AV logs and adding an exclusion for the Mailspring install folder. If that's not it, could you open the "View Log" link on the error and paste a few more lines here? That'll tell us exactly where it's failing.

### 44. Attachments to emails / sending
**Thread:** https://community.getmailspring.com/t/attachments-to-emails-sending/14485
**Action:** Reply + mark Resolved

> Not missing anything — click the paperclip icon in the composer toolbar (bottom of the compose window) to browse for a file, or just drag and drop a file straight into the compose window and it'll attach.

### 45. JMAP support
**Thread:** https://community.getmailspring.com/t/jmap-support/14487
**Action:** Reply

> We don't support JMAP today — Mailspring's sync engine is built around IMAP/SMTP. It's an interesting protocol and I get the appeal, but it'd be a substantial rework of the sync engine, so it's not on the near-term roadmap. I'll note it as a feature request in case that changes.

### 46. Spoof Guard — phishing / spoofing / scam detection with a risk score, reasons, and optional auto-move to Spam
**Thread:** https://community.getmailspring.com/t/spoof-guard-phishing-spoofing-scam-detection-with-a-risk-score-reasons-and-optional-auto-move-to-spam/14493
**Action:** Reply

> This is fantastic — thank you for building it and writing up such a clear rundown of what it does. SPF/DKIM/DMARC visibility plus a plain-language risk score is exactly the kind of thing that's hard to justify building into the core app for everyone, but is a perfect fit as a plugin. Great shoutout to mailspring-auth-results too. Nice work!

### 47. Breeze-Light theme (Tela Icons)
**Thread:** https://community.getmailspring.com/t/breeze-light-theme-tela-icons/148
**Action:** Reply

> There isn't a dedicated "Install a Theme" button in the current version of Mailspring — themes are just community packages, so you install one by copying/cloning the theme folder into your Mailspring config's `packages` directory (`~/.config/Mailspring/packages` on Linux) and restarting the app. Once it's there, it should show up as an option to select in Preferences → Appearance, right alongside the built-in themes — nothing extra to "unlock." If you don't see it listed there after restarting, double-check the theme folder actually landed inside `packages` (not one level up).

### 48. Building is broken with Node.js 26.1.0+ and 24.16.0+
**Thread:** https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475
**Action:** Reply

> Thanks for tracking this down — you nailed the root cause. `@electron/packager` 18.3.6 (what we currently depend on) pulls in `extract-zip` 2.0.1, which hangs on these newer Node versions; upgrading to `@electron/packager` 20.0.1 (which replaced that dependency) is the right fix. We haven't made that upgrade yet, so building from source on Node 24.16+/26 will hit this until we do. In the meantime, building with an older Node (e.g. 22.x or pre-24.16 on the 24.x line) avoids it. I've noted this to get the packager bumped.

### 49. Mailspring builds hangs indefinitely using NodeJs v24.16.0 and NodeJS v26.*
**Thread:** https://community.getmailspring.com/t/mailspring-builds-hangs-indefinitely-using-nodejs-v24-16-0-and-nodejs-v26/14503
**Action:** Reply + mark Resolved

> This is the same issue reported over on [Building is broken with Node.js 26.1.0+ and 24.16.0+](https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475) — marking this one resolved as a duplicate so discussion stays in one place. Thanks for confirming it affects the master branch too.

### 50. Tracking is lost when changing email ids from dropdown
**Thread:** https://community.getmailspring.com/t/tracking-is-lost-when-changing-email-ids-from-dropdown/14510
**Action:** Reply

> Thanks for the report — I found the bug. Open/link tracking is actually on by default for every new draft, so you shouldn't normally need to set it manually. But switching the "From" account mid-draft rebuilds the draft under the hood so it's attached to the right account, and that rebuild doesn't carry over the tracking (or other composer toggle) settings from the old draft — so it silently turns off. It's not something you're doing wrong, and there's no way to force it back on for that draft today short of re-enabling it from the tracking icon after switching accounts. I've noted it as a bug so the rebuild preserves your settings.
