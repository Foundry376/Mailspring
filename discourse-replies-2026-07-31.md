# Mailspring Discourse Reply Drafts — 2026-07-31

### 1. How to create Table?
**Thread:** https://community.getmailspring.com/t/how-to-create-table/14531
**Action:** Reply

> Thanks for flagging this — Mailspring's composer actually does have support for preserving pasted HTML tables (we run pasted HTML through an inline-style transformer specifically so tables from Excel/Calc keep their formatting). The problem is that our paste handler checks for an image on the clipboard first, and LibreOffice Calc (like Excel) puts a bitmap snapshot of the copied cells on the clipboard alongside the HTML for compatibility with apps that can't read table markup — so Mailspring ends up inserting that image instead of the table. "Paste and Match Style" strips all formatting on purpose, which is why you get plain text there. As a workaround, try LibreOffice's Paste Special (Ctrl+Shift+V) and choose the HTML option specifically rather than the default paste — that should avoid the image and let the actual table come through. I'll look at whether we should deprioritize image data when HTML table markup is also present.

### 2. MCP + Claude Desktop not working
**Thread:** https://community.getmailspring.com/t/mcp-claude-desktop-not-working/14528
**Action:** Reply

> I checked how our "Add to Claude Desktop" button writes your config, and it registers Mailspring's MCP server via `npx mcp-remote@latest ...` (using the bare command `npx`, trusting it to be on PATH). Your log shows Claude Desktop's own Node resolver couldn't find an `npx` executable — this looks like it's because your Node install lives under ServBay's non-standard paths, which Claude Desktop's launcher doesn't check. To fix it: open a terminal, run `which npx` to get the full path, then open `~/Library/Application Support/Claude/claude_desktop_config.json` and replace `"command": "npx"` for the `mailspring` entry with that full path. Alternatively, installing Node via nvm or Homebrew (which Claude Desktop's resolver does check) and re-clicking "Add to Claude Desktop" should also work.

### 3. Change dir of Mailspring
**Thread:** https://community.getmailspring.com/t/change-dir-of-mailspring/14527
**Action:** Reply

> Unfortunately, no — our Windows installer is built on Squirrel.Windows (via `electron-winstaller`), which always installs to your local AppData folder (`%LocalAppData%\Mailspring`) and doesn't support choosing a custom install directory like `P:\`. That's a constraint of the Squirrel installer framework itself, not a setting we can expose. Sorry it's not more flexible here.

### 4. After filter is used to move mail to folder the folder doesn't show new mail
**Thread:** https://community.getmailspring.com/t/after-filter-is-used-to-move-mail-to-folder-the-folder-doesnt-show-new-mail/14511
**Action:** Reply + mark Resolved

> This is expected behavior, not a bug — by default Mailspring only shows unread counts/badges for the Inbox, not for every folder or label. You can turn on counts everywhere: go to **Preferences > General > Workspace** and enable **"Show unread counts for all folders / labels"**. Once that's on, any folder a mail rule moves messages into will show its unread badge like the Inbox does.

### 5. Tracking is lost when changing email ids from dropdown
**Thread:** https://community.getmailspring.com/t/tracking-is-lost-when-changing-email-ids-from-dropdown/14510
**Action:** Reply

> Good catch, and I can confirm this is a real bug. When you switch the "From" address to a different account mid-draft, Mailspring actually creates a brand-new draft under the hood for that account (it has to, since the old draft belongs to the previous account) — and that recreation step doesn't currently carry over the open/link-tracking metadata, so tracking silently gets dropped. It's not fixed yet. As a workaround, pick your "From" address first, then enable tracking afterward, rather than the other way around. I've flagged this for a fix.

### 6. Select all - Limited to 200 messages?
**Thread:** https://community.getmailspring.com/t/select-all-limited-to-200-messages/6727
**Action:** Reply

> This is a known, still-present limitation — I can confirm it in the current code. The thread list is virtualized, and "Select All" only selects the rows that are currently loaded into that virtualized window (based on your scroll position), not every message in the folder. As you scroll further, more rows get loaded but aren't automatically added to the selection, which is exactly what you're seeing. Shift-click/Shift-arrow range selection does work across the whole result set since it extends the selection as it goes, so that's the best workaround for large bulk operations right now. I don't have a timeline for a true "select everything in this folder" action, but I hear the frustration on large mailboxes and it's on my radar.

### 7. Archive subfolders
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> There's no built-in feature (or plugin I could find) that auto-files archived mail into date-based subfolders like `Archive/2026/01`. What you can do today: manually create nested folders (most IMAP providers, including Gmail, support "/" as a hierarchy separator, so creating a folder named e.g. `Archive/2026/01` from the folder picker should nest it correctly), and then set up a mail rule (Preferences > Rules) to move matching messages into a specific existing folder. The limitation is that rules only target folders you've already created — there's no way to have a rule dynamically generate "this month's" folder automatically, so you'd need to create each month's folder ahead of time and update your rule (or add a new one) as time goes on. Not as smooth as what you're used to in Thunderbird, admittedly.

### 8. Installation error
**Thread:** https://community.getmailspring.com/t/installation-error/14484
**Action:** Reply

> Hi Doug — thanks for the detailed report. That dialog appears when our sync engine helper (`mailsync`) fails to complete its initial database migration on first launch; "mailsync: 0" specifically means the process exited without producing any readable output, so it's failing before it can even report a proper error. Since "Rebuild" only clears the local index and relaunches, it won't help if `mailsync.exe` itself isn't able to run — this is usually caused by antivirus/Windows Defender (or another security tool) blocking or quarantining `mailsync.exe`, or a missing Visual C++ runtime component. Could you check your antivirus quarantine/logs for anything related to Mailspring, and if nothing turns up, try launching Mailspring from a Command Prompt so we can see the full console output? That'll help us pin down exactly what's failing.

### 9. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> Reply All only appears (and only addresses the people it can actually see) when a message has more than one visible recipient — meaning more than one address in "To", or anyone in "Cc". Mailspring can never see or reply to BCC'd recipients, since that information isn't included in the message at all (no mail client can see it). So if the "group" email you replied to actually had you as the sole visible "To" recipient with everyone else BCC'd, that's why the reply only went to one person — it's not a bug, just what was actually in the message headers. If you want to double check, look at the message's "To"/"Cc" list (or use Show Original) before replying.

### 10. Can't upgrade
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply + mark Resolved

> Good news — this should be fixed in **1.22.0** (released 6/13/2026)! We moved the upgrade/payment flow out of the in-app modal so it now launches in your web browser, using our updated Stripe integration — the old in-app modal's checkout was the source of the 500 errors some users were hitting. Please update to the latest version (1.23.0) and try upgrading again from **Preferences > Subscription**, and let us know if you still run into trouble.

### 11. Setting up connection to spectrum
**Thread:** https://community.getmailspring.com/t/setting-up-connection-to-spectrum/6481
**Action:** Reply + mark Resolved

> This looks like the same certificate question posted over on [the Certificate Error thread](https://community.getmailspring.com/t/certificate-error-when-connecting-account/190) — please see my reply there for how Mailspring validates mail-server certificates and how "Allow Insecure SSL" works. For the original connection failure: double-check the exact IMAP/SMTP hostnames and ports Spectrum gave you in the account setup screen, and if it's a certificate trust issue specifically, try the "Allow insecure SSL" checkbox in the IMAP/SMTP setup panel as a workaround.

### 12. Certificate Error when connecting account
**Thread:** https://community.getmailspring.com/t/certificate-error-when-connecting-account/190
**Action:** Reply + mark Resolved

> A website's SSL certificate isn't automatically "the same" as your mail server's certificate — they're tied to whatever hostname the certificate was issued for, so a cert for the website domain only helps if the mail server (e.g. its IMAP/SMTP hostname) actually presents that same certificate. Mailspring doesn't let you manually import or paste in a certificate/public key; it just validates whatever cert the mail server presents against your system's standard CA trust store. If you're hitting a certificate error connecting to a specific provider's mail servers, try the "Allow insecure SSL" checkbox in the IMAP/SMTP setup screen as a workaround.

### 13. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply + mark Resolved

> There is actually a manual shortcut for this: press **F5** to force Mailspring to check for new mail immediately (bound to "Sync Mail Now" — you can see/rebind it under Preferences > Shortcuts). Outside of that, new-mail delivery speed depends on your provider's IMAP push/IDLE support, which isn't something we control from the client side, but F5 should get you that OTP email right away without waiting.

### 14. Reply All 123456789
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply + mark Resolved

> This is expected: Mailspring only shows the "Reply All" option when the message you're viewing actually has more than one visible recipient — more than one address in "To", or anyone in "Cc". If a message was sent to you with everyone else BCC'd (or just to you alone), there's genuinely no one else visible to reply to, so only "Reply" shows up. You can control which of Reply/Reply All appears as the primary button (vs. in the dropdown) via **Preferences > General > Sending > "Default reply behavior"**, but that setting can't make Reply All appear on messages that don't have other visible recipients.

### 15. Problem with local email database
**Thread:** https://community.getmailspring.com/t/problem-with-local-email-database/14453
**Action:** Reply

> The "language detection extension" console message is harmless and unrelated — it's just a failed optional Chrome extension load that we catch and log. The real issue is the "local email database" dialog, which means our `mailsync` sync-engine process is failing during startup/migration; clicking Rebuild only clears the local index cache, so if the process itself can't run, Rebuild will just loop like you're seeing. You were on 1.21.1 — please update to the current 1.23.0 first, since a number of startup and crash fixes have shipped since then. If it still won't launch, fully quit any lingering `mailspring`/`mailsync` processes and do a clean reinstall (removing your `~/.config/Mailspring` folder, which will require reconnecting your accounts), and if that doesn't resolve it, please run Mailspring from a terminal and share the full console output so we can dig further.

### 16. E-mail row permanently green on mouse over
**Thread:** https://community.getmailspring.com/t/e-mail-row-permanently-green-on-mouse-over/14532
**Action:** Reply

> Thanks for the report! That green is very likely the swipe-to-archive backing (the thread list paints an archive-green bar behind the row during a swipe gesture) getting triggered and stuck. Swipe gestures on Windows are driven purely by scroll-wheel deltaX events, so a mouse with a tilting/horizontal scroll wheel can accidentally fire it while you're just scrolling over a row. As a quick workaround, try Preferences > General > Reading > "Disable swipe gestures on the thread list" — if that clears it up, we know where to focus a real fix. Let us know if it helps.

### 17. Global menu not working when run under Wayland
**Thread:** https://community.getmailspring.com/t/global-menu-not-working-when-run-under-wayland/14521
**Action:** Reply

> This is a known limitation, not a bug we can just patch — Electron's Wayland (ozone) backend bypasses GTK entirely, and KDE's Global Menu widget relies on a mechanism (DBusMenu/AppMenu registration) that only works through X11/GTK, which is why `--ozone-platform=x11` "fixes" it for you. Because of this, Mailspring already detects native Wayland sessions and automatically shows an in-app hamburger/right-hand menu button in the toolbar as a fallback, so all menu items stay reachable even without the desktop's Global Menu. Running under XWayland (as you found) is the only way to get the actual system Global Menu integration back for now.

### 18. Blurry tray icon (windows)
**Thread:** https://community.getmailspring.com/t/blurry-tray-icon-windows/14525
**Action:** Reply

> I looked into this — we only ship 1x (16px) and 2x (32px) tray icon assets on Windows, with no intermediate size for fractional scaling like 125%. Since Windows has to scale between those two to hit the DPI it wants at 125%, you get exactly the softness you're seeing. This isn't fixed yet — I don't have a workaround to offer besides using 100% or 150% scaling, where we do ship exact-match assets, but I've noted it as a real issue worth adding a proper intermediate-resolution icon for.

### 19. Attachements not visible in thread on Mac
**Thread:** https://community.getmailspring.com/t/attachements-not-visible-in-thread-on-mac/14518
**Action:** Reply

> They're not gone — when a message with attachments gets collapsed into the thread view, we show a small paperclip indicator on that collapsed row specifically so you know attachments are there. Just click that message row to expand it, and the attachment(s) will appear with a "download all" option. There isn't currently a setting to turn off threading/grouping in the message view, but expanding the specific message should get you straight to the file.

### 20. Still duplication sent on outlook
**Thread:** https://community.getmailspring.com/t/still-duplication-sent-on-outlook/14517
**Action:** Reply

> You're right that this is the same long-standing issue, and unfortunately Microsoft removing the "save copies of sent messages" toggle from Outlook.com's settings has taken away the workaround we used to point people to. I don't have a code-side fix to offer yet, and switching your Sent folder mapping in Mailspring — as you tried — doesn't get at the root cause, since it's about detecting whether Outlook's server already saved a copy before Mailspring saves its own. I'm sorry I don't have better news right now; I'll flag this as worth revisiting given the workaround is gone.

### 21. Onboarding broken
**Thread:** https://community.getmailspring.com/t/onboarding-broken/14512
**Action:** Reply

> This is a real layout bug — the account setup window is a fixed size, non-resizable window, and its content areas use `overflow: hidden` rather than scrolling. So when the interface text is longer in a given language (Russian text runs noticeably taller than English), it can push the Continue button below the visible area with no way to scroll down to it. As a workaround, try temporarily setting your Windows display scaling to 100% during account setup (Settings > System > Display) — that shrinks the rendered text enough to fit — then switch scaling back afterward. I don't have a timeline for a proper fix, but I've noted that these forms need real scroll support rather than hard clipping.

### 22. Email reminders no longer being sent
**Thread:** https://community.getmailspring.com/t/email-reminders-no-longer-being-sent/14502
**Action:** Reply

> Thanks for flagging this. We actually reworked how reminders get attached to the sent thread in **1.22.0** (released 6/13/2026) — reminders used to be transferred onto the thread by the Electron app itself after sending, and now depend entirely on the sync engine promoting that metadata when it processes your sent draft. If the sync engine doesn't complete that promotion for some reason, the reminder silently never shows up, which matches what you're describing. Could you confirm you're on the latest **1.23.0** build, and let us know whether this happens on any non-Yahoo accounts too? That will help us tell whether it's a general regression or something specific to how Yahoo handles the sent-message sync.

### 23. Not showing notification alert in mac for new incoming emails
**Thread:** https://community.getmailspring.com/t/not-showing-notification-alert-in-mac-for-new-incoming-emails/14499
**Action:** Reply

> Sorry for the trouble — since both notifications and the send sound stopped at the same time, this smells like a macOS-level permission issue rather than something broken in Mailspring's notification code itself. A couple things worth checking: 1) System Settings → Notifications → Mailspring — make sure it's still allowed and not set to "None," since macOS sometimes silently resets this after an OS update or app reinstall. 2) Check Focus/Do Not Disturb isn't scoped to suppress Mailspring. 3) In Mailspring's own Preferences → Notifications, confirm notifications and sounds are still toggled on. If all of that checks out and it's still silent, let us know and we'll dig further.

### 24. New version notification does not respect "dismiss"
**Thread:** https://community.getmailspring.com/t/new-version-notification-does-not-respect-dismiss/14495
**Action:** Reply

> You're right, and I can confirm this in the code — the "Dismiss" button on the update notification only clears it for that session; it isn't persisted anywhere, so the notification always reappears on the next launch. This is a known gap, not currently fixed, and I don't have a timeline for it yet. The only real workaround right now is to just install the update (which naturally clears the notification until the next release). Sorry for the annoyance in the meantime.

### 25. Rule has been disabled - Folder could not be found
**Thread:** https://community.getmailspring.com/t/rule-has-been-disabled-folder-could-not-be-found/14492
**Action:** Reply

> Both of these match behavior I can confirm in the code. If a rule's destination folder/label can't be resolved via the local category cache, the whole rule gets permanently disabled — rather than just skipping that one message. On a brand-new IMAP account with 30,000+ emails importing, a folder/label you just created can take a moment to fully propagate into that local cache, so a rule referencing it can get disabled before it's ever had a chance to work. Workaround: after creating a new label/folder, give Mailspring a minute (or restart it) before hitting "Process entire inbox," then re-enable the rule in Preferences → Rules and try again. On your second bug: yes, "Process entire inbox" doesn't check whether any rules are actually enabled before it starts, so it will still scan the whole inbox even with everything disabled — it just won't apply anything. That's a real rough edge we haven't fixed yet, sorry for the confusion it caused during setup.

### 26. My mail rules are being ignored
**Thread:** https://community.getmailspring.com/t/my-mail-rules-are-being-ignored/76
**Action:** Reply

> This thread has been open a long time and covers several different underlying bugs we've fixed piecemeal over the years (case-sensitivity, "does not contain" logic, timing around message bodies, and a broader pass on condition-evaluation bugs in **1.18.0**, released 2/22/2026). That said, the more recent report from June is a good example of why it's hard to pin down in general — rules applying to one message in a batch but not the rest of a matching set isn't something I can explain from a single root cause in the code today. If you're still seeing rules apply inconsistently on a recent version, it would really help to see the exact rule conditions plus the headers (From/Subject) of a message it should have matched but didn't — with that we can actually trace it through the rule processor instead of guessing.

### 27. Chinese Inputer not compatible
**Thread:** https://community.getmailspring.com/t/chinese-inputer-not-compatible/745
**Action:** Reply

> This is the same underlying issue tracked in our [Japanese IME thread](https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535) — it's a long-standing limitation in how the composer's editor (Slate, an older version we haven't been able to fully upgrade) handles IME composition events, and we've only been able to patch parts of it. It's still not fully fixed. The best workaround right now is switching to Plain Text as your default message format (Preferences → Composing → Default Message Format) — rich text mode is where this shows up. I'm sorry it's taken this long; a real fix likely requires a deeper composer rewrite that hasn't happened yet.

### 28. When I input Japanese, the sentence disappears during the input
**Thread:** https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535
**Action:** Reply

> Picking this back up since it's still coming up in 2026 — this is still not fully fixed. We've landed several targeted patches over the years to work around Chrome/Slate composition-event quirks, but the core problem is that our composer runs on an old version of the Slate editor that doesn't handle IME composition cleanly, and a real fix needs a bigger rewrite we haven't done. The workaround a few people in this thread have confirmed works: switch to Plain Text as your default message format (Preferences → Composing → Default Message Format) — the bug is specific to rich text mode. I know that's not a full answer, and I'm sorry this has dragged on so long.

### 29. Attachments not showing in correct order
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> Thanks for the detailed writeup — I dug into this. When you drop multiple files (or pick several in the attach dialog), each one is attached via an independent async operation (stat the file, copy it into Mailspring's internal storage, then add it to the draft). Because those run concurrently rather than strictly in sequence, whichever file finishes copying first gets added to the draft first — so the final order depends on disk I/O timing, not the order you selected them in. It's not fixed yet. In the meantime, the most reliable workaround is to attach files one at a time (or in small batches) if order matters for your recipients. I'll look at making attachment adds sequential so order is preserved.

### 30. Mailspring not collecting and adding email address starting with info@
**Thread:** https://community.getmailspring.com/t/mailspring-not-collecting-and-adding-email-address-starting-with-info/14481
**Action:** Reply

> Contact autocomplete in Mailspring only surfaces contacts that have been scored as ones you've actually corresponded with, rather than every address that's ever passed through your inbox — that's intentional so autocomplete favors people you've actually emailed. That scoring is computed by the sync engine, not the desktop app, so I can't say for certain from this side why a specific `info@…` address ends up excluded, but generic/role addresses that you've never sent to directly are the most likely to fall into that bucket. This isn't a quick client-side fix since it's rooted in how contacts get scored during sync — sorry it's been a long-standing frustration.

### 31. Bug: New signature image overwrote old assets on Mailspring server (affecting old emails and shared accounts)
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server-affecting-old-emails-and-shared-accounts/14480
**Action:** Reply

> Found the root cause — thank you for including the asset URL, that made it obvious. The signature Mailspring auto-creates for every account uses a hardcoded id (`initial`), and when you upload a photo to a signature, we save it to the server keyed off that signature's id. Since that default signature's id is always the same literal string rather than a unique one, anyone who adds/changes a photo on the *default* "Default" signature (without first duplicating or renaming it into a new one) will overwrite the same asset URL on your account — including old copies from other devices signed into the same account. That's exactly what happened here. Workaround: click "+" to create a new signature (which does get a unique id) before adding a photo, rather than editing the built-in default one. This is a real bug on our end and I'll get it fixed so the default signature gets a unique id too — I can't promise a timeline, but it's now on my radar. I don't have a way to manually purge that asset from the CDN via this forum, sorry.

### 32. Roles are not automatically applied, must run manually to work
**Thread:** https://community.getmailspring.com/t/roles-are-not-automatically-applied-must-run-manually-to-work/14477
**Action:** Reply

> Automatic mail rules only fire once per message, at the moment the sync engine marks it as fully synced (headers + body) for the first time, and only for messages dated after you enabled rules. "Process Entire Mailbox" doesn't have that restriction — it just runs your rules against everything, which is why it always "fixes" it retroactively. I can't say for certain from the client side why forwarded mail specifically slips past the automatic trigger, but one thing worth checking: open one of the missed emails, choose "Show Original," and check the `Date:` header — if your forwarding service preserves an original send date that's older than when you first turned rules on, that message would get silently skipped by the auto-apply logic. If the dates look normal and it's still not triggering automatically, let me know and I'll dig further.

### 33. Inconsistency between deleting single mail and multiple mails
**Thread:** https://community.getmailspring.com/t/inconsistency-between-deleting-single-mail-and-multiple-mails/14476
**Action:** Reply

> This is a real gap, not something you're doing wrong. When one thread is selected and removed, the "auto-advance to the next thread" logic works because that single thread is tracked as the "focused" item, and there's code that specifically watches for the focused item disappearing and moves focus to the next one. Multi-selected threads aren't tracked through that same single-focus mechanism, so when you delete a batch, there's no focused item for that logic to advance from — hence nothing gets auto-selected afterward. It's not fixed yet, so for now you'll need to click or arrow-key back into the list after a multi-delete, as you found.

### 34. Building is broken with Node.js 26.1.0+ and 24.16.0+
**Thread:** https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475
**Action:** Reply + mark Resolved

> Good news — this was fixed in **1.23.0** (released 7/19/2026): we upgraded `@electron/packager` to prevent build hangs on newer Node.js versions (#2767). Please pull latest `main` and try your build again; let us know if you still hit issues on your Node version.

### 35. Send via mail opens new email dialog but doesn't attach file
**Thread:** https://community.getmailspring.com/t/send-via-mail-opens-new-email-dialog-but-doesn-t-attach-file/14469
**Action:** Reply

> This one's intentional, not a regression — in Mailspring 1.21.0 we removed support for the unofficial `?attach=` parameter in `mailto:` links as part of a security hardening pass (that parameter was how tools like `nautilus-sendto` triggered attachments, but it also let arbitrary links or pages make Mailspring open and attach local files, so we dropped it). It's not coming back in its old form, unfortunately. For now, the reliable path on Linux is to open Mailspring and manually attach the file (paperclip icon or drag-and-drop) rather than using the file manager's "send via mail" action.

### 36. I am currently unemployed
**Thread:** https://community.getmailspring.com/t/i-am-currently-unemployed/14530
**Action:** Reply

> Really sorry to hear things are tight right now. I don't handle billing exceptions through the forum, but please email support@getmailspring.com directly with your account email and situation — we do try to work with people on a case-by-case basis when money's genuinely tight, so reach out there rather than posting your specifics here.

### 37. India requires additional payment verification and I can't pay for Mailspring
**Thread:** https://community.getmailspring.com/t/india-requires-additional-payment-verification-and-i-cant-pay-for-mailspring/7551
**Action:** Reply

> Sorry this is still happening for some of you. Since my last update here, we made another change in **1.22.0** (released 6/13/2026): payment now happens in your regular web browser instead of the embedded in-app window, specifically to work better with the newer Stripe integration and its verification flows. The old embedded payment window could have trouble completing bank/OTP verification redirects (common with Indian card issuers), and moving it to a real browser tab should resolve that. Could you try upgrading again from Preferences > Account and see if the browser-based checkout gets you through the verification step? If it still fails, reply here with a screenshot of the error and I'll follow up with our payment provider directly.
