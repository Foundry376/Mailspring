# Mailspring Discourse Reply Drafts — 2026-07-10

### 1. Tracking is lost when changing email ids from dropdown
**Thread:** https://community.getmailspring.com/t/tracking-is-lost-when-changing-email-ids-from-dropdown/14510
**Action:** Reply

> Thanks for the report — I found the bug. Open/link tracking is actually on by default for every new draft, so you shouldn't normally need to set it manually. But switching the "From" account mid-draft rebuilds the draft under the hood so it's attached to the right account, and that rebuild doesn't carry over the tracking (or other composer toggle) settings from the old draft — so it silently turns off. It's not something you're doing wrong, and there's no way to force it back on for that draft today short of re-enabling it from the tracking icon after switching accounts. I've noted it as a bug so the rebuild preserves your settings.

### 2. Mailspring linux messages rules not saved
**Thread:** https://community.getmailspring.com/t/mailspring-linux-messages-rules-not-saved/14509
**Action:** Reply

> Thanks for the report. Mail rules are saved to local storage on a short delay (about a second) after you add or edit one, rather than instantly — so if the app is closed (or crashes) within a second of a change, that change can be lost even though it looked fine while you were using it. If you're closing Mailspring immediately after editing rules, or the app isn't exiting cleanly, that would explain exactly what you're seeing. I've noted this as something we should make more robust; in the meantime, try waiting a couple seconds after editing rules before quitting.

### 3. When viewing an opened email, pressing the Mouse X Button 1 does nothing
**Thread:** https://community.getmailspring.com/t/when-viewing-an-opened-email-pressing-the-mouse-x-button-1-does-nothing/14507
**Action:** Reply

> Good suggestion — we don't have any handling for mouse back/forward buttons today, in the message viewer or elsewhere, so nothing happens when you press it. There's no keybinding or setting that maps to it currently either. I'll note this as a feature request.

### 4. Make the message body sync window configurable (currently hardcoded to 3 months)
**Thread:** https://community.getmailspring.com/t/make-the-message-body-sync-window-configurable-currently-hardcoded-to-3-months/14506
**Action:** Reply

> You read the code correctly — the sync engine hardcodes a 3-month window for downloading message bodies, and yes, that `TODO pref!` comment has been sitting there for a while. There's no UI setting for this today. It's a reasonable ask (especially for search/`has:attachment` completeness on older mail), so I've noted it as a feature request, though it'd need some thought around the storage/performance tradeoffs of letting people sync bodies indefinitely.

### 5. Could the Templates Panel BE Any Smaller?
**Thread:** https://community.getmailspring.com/t/could-the-templates-panel-be-any-smaller/14504
**Action:** Reply

> Fair feedback, and all three points are accurate — the Templates editor in Preferences isn't resizable, there's no folder/category grouping for templates, and the quick-insert dropdown in the composer has a fixed width that doesn't handle longer names gracefully. None of that is configurable today. I've noted all three as feature requests; the resizable panel is probably the easiest win of the three.

### 6. Mailspring builds hangs indefinitely using NodeJs v24.16.0 and NodeJS v26.*
**Thread:** https://community.getmailspring.com/t/mailspring-builds-hangs-indefinitely-using-nodejs-v24-16-0-and-nodejs-v26/14503
**Action:** Reply + mark Resolved

> This is the same issue reported over on [Building is broken with Node.js 26.1.0+ and 24.16.0+](https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475) — marking this one resolved as a duplicate so discussion stays in one place. Thanks for confirming it affects the master branch too.

### 7. Building is broken with Node.js 26.1.0+ and 24.16.0+
**Thread:** https://community.getmailspring.com/t/building-is-broken-with-node-js-26-1-0-and-24-16-0/14475
**Action:** Reply

> Thanks for tracking this down — you nailed the root cause. `@electron/packager` 18.3.6 (what we currently depend on) pulls in `extract-zip` 2.0.1, which hangs on these newer Node versions; upgrading to `@electron/packager` 20.0.1 (which replaced that dependency) is the right fix. We haven't made that upgrade yet, so building from source on Node 24.16+/26 will hit this until we do. In the meantime, building with an older Node (e.g. 22.x or pre-24.16 on the 24.x line) avoids it. I've noted this to get the packager bumped.

### 8. Email reminders no longer being sent
**Thread:** https://community.getmailspring.com/t/email-reminders-no-longer-being-sent/14502
**Action:** Reply

> Thanks for the detailed report. My best guess right now: 1.22.0 changed how reminder metadata is written on send — reminders set from the composer are now tagged so the sync engine "promotes" them onto the thread automatically once the message goes out, instead of the app doing that bookkeeping. If that promotion doesn't happen correctly for a given account/provider (Yahoo, in your case), the reminder metadata would never make it onto the sent thread, so the Reminders folder stays empty even though you set the reminder correctly on your end. I'm not fully certain that's the cause yet, so if you can grab `~/.config/Mailspring/mailsync.log` (or the equivalent on Windows) from around the time you set a reminder and send, that would help confirm it. No fix in the current release yet, but I've flagged this as a likely regression.

### 9. Archived Account option (for old accounts you want to keep offline, but don't have server access any more)
**Thread:** https://community.getmailspring.com/t/archived-account-option-for-old-accounts-you-want-to-keep-offline-but-dont-have-server-access-any-more/14500
**Action:** Reply

> There's no "archived"/offline mode for an account today — Mailspring always tries to authenticate and sync, so a dead account will keep showing the connection error banner. Importing standalone `.mbox` archives isn't supported either. Both are reasonable asks for exactly the scenario you describe (an old job's account you want to keep searchable locally), so I've noted them as feature requests, though the "stop trying to connect but keep the local cache browsable" option is the more tractable of the two.

### 10. Not showing notification alert in mac for new incoming emails
**Thread:** https://community.getmailspring.com/t/not-showing-notification-alert-in-mac-for-new-incoming-emails/14499
**Action:** Reply

> Sorry about that — a few things worth checking since this started around a macOS upgrade rather than a Mailspring update. Mailspring respects macOS Focus/Do Not Disturb settings for notifications and sound, so if Tahoe reset or changed your Focus configuration for Mailspring specifically, that would silently suppress both. It's also worth checking System Settings → Notifications → Mailspring to confirm permission is still granted — OS upgrades occasionally reset per-app notification permissions. Also double check Preferences → Notifications has alerts and sounds enabled in Mailspring itself. If all of that looks right and it's still not working, let us know and we'll dig further — I don't have a definitive root cause yet beyond ruling out the obvious causes.

### 11. Breeze-Light theme (Tela Icons)
**Thread:** https://community.getmailspring.com/t/breeze-light-theme-tela-icons/148
**Action:** Reply

> There isn't a dedicated "Install a Theme" button in the current version of Mailspring — themes are just community packages, so you install one by copying/cloning the theme folder into your Mailspring config's `packages` directory (`~/.config/Mailspring/packages` on Linux) and restarting the app. Once it's there, it should show up as an option to select in Preferences → Appearance, right alongside the built-in themes — nothing extra to "unlock." If you don't see it listed there after restarting, double-check the theme folder actually landed inside `packages` (not one level up).

### 12. My mail rules are being ignored
**Thread:** https://community.getmailspring.com/t/my-mail-rules-are-being-ignored/76
**Action:** Reply

> I know this thread has been going for a long time, and I appreciate everyone's patience. Based on how rule-matching actually works: each rule only ever runs once per message, triggered by an internal flag the sync engine sets when it considers that message "fully synced" (headers + body both downloaded). If that flag is ever missed or delayed for a particular message — which can happen depending on how/when it arrives relative to other sync activity — the rule silently never gets a chance to run on it, which would explain why it's inconsistent (some messages match, others from the same sender don't) rather than completely broken. This is still an open, known issue without a fix in the current release. I don't have a workaround beyond re-running rules manually against your inbox (Preferences → Mail Rules → "Process entire inbox" for the affected account) to catch anything that was missed.
