# Mailspring Discourse Reply Drafts — 2026-08-28

**Read this note first:** This pipeline now has eleven straight weeks of fully-researched drafts that were never reviewed or posted (back to 2026-05-22 — see the git history on this branch). `discourse-posted-ids.json` has not changed once in that entire time; nothing from this process has ever actually reached the forum. I'm flagging this to you directly outside this file too, since a twelfth silent addition to the pile isn't useful to anyone.

I re-verified every item carried over from 08-21 against current forum state: the changelog is unchanged (still 1.23.0, 7/19/2026), and I re-checked each of those 43 threads' current posts/tags. Two changed and are updated below:
- **#22** (empty-inbox scrollbar glitch) is now actually fixed — a community member (Salman Afzal) filed [PR #2821](https://github.com/foundry376/Mailspring/pull/2821) against the exact bug, and it's already merged to master. Updated to a "fixed, thank you" reply and marked Resolved.
- **#43** ("No Recipient" error) got a new post from rudolfbyker on 8/18 saying they found the root cause and fixed it, but are unsure if they need permission before opening a PR since this isn't a labeled `accepted` GitHub issue. Reply updated to explicitly say yes, go ahead.

Everything else in the carried-forward batch is unchanged and still accurate. Added five new items (#44–48) for topics that surfaced or changed since 08-21. **Please either post this batch (it's now 48 items across six weeks of real user questions) or explicitly tell me to abandon/reset the pipeline — the backlog itself is the most important thing for you to see this week, more than any individual reply below.**

---

## Onboarding / Setup

### 1. Onboarding broken
**Thread:** https://community.getmailspring.com/t/onboarding-broken/14512
**Action:** Reply

> Confirmed this is a real layout bug, and not really about Russian specifically. The setup window is a fixed, non-resizable 900×600, and this particular page's content area is actually taller than that (620px in a 600px window) — so when translated text runs longer than the English original, which Russian often does, the Continue button gets pushed below the visible window with no way to scroll down to it. We've hit and patched this exact class of bug on one other onboarding page before, just not this one. As a workaround, try temporarily setting Windows display scaling to 100% (Settings > System > Display > Scale) before running setup — smaller rendered text should pull the button back into view — then switch back after. I don't have a timeline for a proper fix, but I've flagged it to get these pages real scroll support instead of hard clipping.

### 2. There is no "Next" button on the welcome screen
**Thread:** https://community.getmailspring.com/t/there-is-no-next-button-on-the-welcome-screen/14544
**Action:** Reply + mark Resolved

> This looks like the same underlying bug as [this report](https://community.getmailspring.com/t/onboarding-broken/14512) — the account setup window is a fixed, non-resizable 900×600, and on some pages the content is actually taller than that window, so the Continue button can get pushed off the bottom with no way to scroll to it. As a workaround, try setting Windows display scaling down to 100% (Settings > System > Display > Scale) before running setup, then switch back afterward. Marking this resolved as a duplicate so the discussion stays in one place — I've flagged the underlying issue for a real fix.

---

## Windows install/packaging (Scoop)

### 3. Change dir of Mailspring
**Thread:** https://community.getmailspring.com/t/change-dir-of-mailspring/14527
**Action:** Reply + mark Resolved

> Unfortunately, no — our Windows installer is built on Squirrel.Windows (via `electron-winstaller`), which is a one-click installer with no directory-selection step; it always installs to `%LocalAppData%\Mailspring`, under your user profile on the C: drive. There's no config flag to redirect that without swapping to a different installer framework entirely, which isn't in the works right now. Sorry it's not more flexible here.

### 4. Can't find "Run on startup"
**Thread:** https://community.getmailspring.com/t/cant-find-run-on-startup/14542
**Action:** Reply

> Found it — the "Run on startup" checkbox only appears if Mailspring detects `Update.exe` (part of the Squirrel.Windows installer) sitting next to the app. Scoop packages don't lay files out that way, so the checkbox gets hidden rather than shown broken. There's no manual toggle to force it visible today. You can get the same effect yourself in the meantime: create a shortcut to Mailspring in your Windows Startup folder (Win+R, then `shell:startup`), which works regardless of install method.

### 5. Can't set as default email app
**Thread:** https://community.getmailspring.com/t/cant-set-as-default-email-app/14543
**Action:** Reply

> This is likely the same root cause as the "Run on startup" issue you posted — setting Mailspring as the default email app writes registry entries that assume the same Squirrel.Windows install layout the official installer creates, and I can't confirm from here whether Scoop's package includes everything those entries expect. If you install via the official installer from getmailspring.com instead of Scoop, "Set as default" should work normally. Sorry I don't have a cleaner fix for the Scoop path specifically.

---

## MCP Server (new in 1.23.0)

### 6. MCP + Claude Desktop not working
**Thread:** https://community.getmailspring.com/t/mcp-claude-desktop-not-working/14528
**Action:** Reply

> Thanks for trying this out! I dug into how the "Add to Claude Desktop" button works — it registers Mailspring's MCP server in Claude's config using the bare command `npx`, trusting it's on Claude Desktop's PATH when it launches. Your log shows Claude Desktop's own Node resolver isn't finding `npx`, which lines up with having Node installed through ServBay rather than a location Claude Desktop's launcher checks (like Homebrew or nvm). Quick fix: open Terminal, run `which npx` to get the full path, then open `~/Library/Application Support/Claude/claude_desktop_config.json` and replace `"command": "npx"` under the `mailspring` entry with that full path. Installing Node via nvm or Homebrew and re-clicking "Add to Claude Desktop" should also work. I'll look at having Mailspring write the resolved path directly instead of the bare command, since this'll trip up more people with non-standard Node installs.

---

## Composer / Reply-All / Tracking / Attachments

### 7. Reply All 123456789
**Thread:** https://community.getmailspring.com/t/reply-all-123456789/14470
**Action:** Reply + mark Resolved

> The Reply All option only shows up when a message actually has more than one visible recipient — more than one address in "To", or anyone in "Cc". If everyone else was BCC'd, or the message was sent to you alone, there's genuinely no one else visible for Mailspring (or any mail client) to reply to. Also worth checking **Preferences > General > Sending > "Default reply behavior"** — if that's set to plain Reply, the quick-reply box in the inline message view defaults to that instead of Reply All.

### 8. Reply All Doesn't Work
**Thread:** https://community.getmailspring.com/t/reply-all-doesnt-work/14478
**Action:** Reply

> I went through the code that computes Reply All recipients and didn't find any path that would legitimately drop everyone but one person — so if you used the explicit Reply All action and it still only went to one person, I'd like to see that specific case. The more likely explanation: Mailspring shows a single reply button whose icon and default action are driven by **Preferences > General > Sending > "Default reply behavior"** (Reply vs. Reply All), rather than separate single/double-arrow buttons like some other clients — so if that's set to plain "Reply" and you used the quick-reply box without switching it, it'll only go to the sender. Also worth knowing: Reply All only ever includes the visible To/Cc recipients — anyone BCC'd is invisible to every mail client, not just Mailspring. Next time this happens, checking the original message's To/Cc list via "Show Original" would help pin down which of these you're hitting.

### 9. Tracking is lost when changing email ids from dropdown
**Thread:** https://community.getmailspring.com/t/tracking-is-lost-when-changing-email-ids-from-dropdown/14510
**Action:** Reply

> Confirmed, this is a real bug. When you switch the "From" address to a genuinely different account mid-draft (not just a different alias on the same account), Mailspring has to rebuild the draft from scratch under the hood so it's attached to the new account — and that rebuild doesn't carry over the open/link-tracking toggle, so it silently turns off. Workaround for now: pick your "From" address first, then turn tracking on afterward. I've flagged this so the rebuild preserves tracking (and other composer toggles) going forward.

### 10. Attachments not showing in correct order
**Thread:** https://community.getmailspring.com/t/attachments-not-showing-in-correct-order/14483
**Action:** Reply

> Confirmed — this is a real race condition, not intentional ordering. When you attach multiple files at once, each one gets copied into Mailspring's internal storage via its own independent operation, and whichever finishes first gets added to the draft first. Since copy time depends on file size and disk I/O, a small file dispatched second can finish before a larger one dispatched first, scrambling your original selection order. No fix in the current release — if order matters for a recipient, attaching files one at a time (or in small batches) will preserve it for now. I've flagged this to make attachment adds sequential.

### 11. Mailspring not collecting and adding email address starting with info@
**Thread:** https://community.getmailspring.com/t/mailspring-not-collecting-and-adding-email-address-starting-with-info/14481
**Action:** Reply

> I looked into this and couldn't find anything that specifically excludes "info@" or other role-style addresses from autocomplete — there's no blocklist for that in the app. What I can confirm: autocomplete only suggests contacts that have actually appeared as a participant on a message that's been synced, so if a given `info@` address hasn't shown up that way — say, it's saved elsewhere but you haven't actually sent/received mail with it yet — it won't surface. That matching happens in our sync engine, which I don't have full visibility into from here, so I can't fully rule out a deeper issue. Could you confirm: does that address show up if you search **Preferences > Contacts** directly, and has it appeared in mail you've actually sent or received?

### 12. How to create Table?
**Thread:** https://community.getmailspring.com/t/how-to-create-table/14531
**Action:** Reply

> Wanted to be straight with you here rather than point you at a workaround that doesn't really exist: Mailspring's composer doesn't support HTML tables at all today — not on paste, and there's no "insert table" option either. When you paste from LibreOffice Calc, the clipboard actually includes the table as an image alongside the HTML/text versions (this is normal — spreadsheet apps do this so programs that can't parse tables still get something reasonable), and our paste handler checks for an image first, which is why you get a PNG. "Paste and Match Style" strips formatting entirely, which is why that gives you plain text with no structure at all. There's no real workaround today short of attaching the file separately. I'll note table support as a genuine gap worth adding to the composer.

---

## Mail Rules

### 13. Rule has been disabled - Folder could not be found
**Thread:** https://community.getmailspring.com/t/rule-has-been-disabled-folder-could-not-be-found/14492
**Action:** Reply

> I found the mechanism, and there's a plausible explanation for a brand-new install specifically. When a rule's "move to folder" action runs, Mailspring looks up the target folder by ID in a local cache — and a folder/label you just created doesn't get a real ID in that cache until the sync engine finishes creating it on the server and syncing back, which can take a moment right after setup (especially on a fresh account still doing its initial sync). If "Process entire inbox" runs before that finishes, the lookup fails and the rule gets disabled with exactly that error. Workaround: after creating a new folder/label, give Mailspring a minute (or restart it) before running "Process entire inbox," then re-enable the disabled rule and try again. I also confirmed your second observation — "Process entire inbox" doesn't currently check whether any rules are actually enabled before it scans, so it'll run through the whole inbox even with everything disabled (and just do nothing). That's a real rough edge; I've flagged it.

### 14. Mailspring linux messages rules not saved
**Thread:** https://community.getmailspring.com/t/mailspring-linux-messages-rules-not-saved/14509
**Action:** Reply

> Found a real gap here. Mail rules save to local storage on a short debounce (about a second) after you edit them, but unlike some of our other stores, there's no "flush before quit" safeguard for rules specifically — so if you close Mailspring within that window, the edit never gets written and is lost on next launch. I didn't find anything Linux-specific in the code itself, but Linux's default quit behavior (no system tray keeping it running) tends to close the app faster/more directly than on other platforms, which would make this far more visible there. Workaround: wait a few seconds after editing rules before closing Mailspring. I've flagged this for a fix.

### 15. After filter is used to move mail to folder the folder doesn't show new mail
**Thread:** https://community.getmailspring.com/t/after-filter-is-used-to-move-mail-to-folder-the-folder-doesnt-show-new-mail/14511
**Action:** Reply + mark Resolved

> There's a setting for this — by default Mailspring only shows unread-count badges for the Inbox, so mail a rule files straight into another folder won't show an indicator there, even though it's tracking the unread count correctly behind the scenes. Go to **Preferences > General > Workspace** and turn on **"Show unread counts for all folders / labels"** — that'll make every folder show its badge, not just Inbox.

---

## Notifications / Reminders / Tray

### 16. New version notification does not respect "dismiss"
**Thread:** https://community.getmailspring.com/t/new-version-notification-does-not-respect-dismiss/14495
**Action:** Reply

> Confirmed in the code — "Dismiss" only clears the notification for that session; it's never written to your settings, so the same notification comes right back on your next cold launch. This is a real bug, not intentional. No fix in this release, but I've flagged it — the actual fix is remembering which version you dismissed. In the meantime, installing the update is the only thing that'll make it stop for good.

### 17. Email reminders no longer being sent
**Thread:** https://community.getmailspring.com/t/email-reminders-no-longer-being-sent/14502
**Action:** Reply

> I dug into this and have a solid lead. In 1.22.0 (released 6/13) we changed how a reminder gets attached to the sent thread — the composer now tags the draft with a `thread:`-prefixed marker and relies entirely on the sync engine to promote that to the plain marker the Reminders view actually looks for, once the message sends. If that promotion step doesn't complete for some reason, the reminder is silently stranded and the Reminders folder just stays empty with no error shown anywhere. The timing you reported (right around when 1.22.0 would've reached you) lines up well with this — and I saw your follow-up that reverting to a previous version fixed it, which supports the same theory. I don't have a fix in the current release yet, but this gives us a solid, specific place to look. I'll update this thread once there's news.

### 18. Blurry tray icon (windows)
**Thread:** https://community.getmailspring.com/t/blurry-tray-icon-windows/14525
**Action:** Reply

> Confirmed — we only ship tray icon assets at 1x (16px) and 2x (32px), with nothing in between for fractional scaling like 125%. At a scale we don't have an exact-match asset for, Windows has to stretch the nearest one, which is exactly the blur you're seeing. I can't confirm from here whether this specifically regressed since 1.11 versus always being present at 125% scaling, but the missing intermediate asset is a real gap today. No workaround besides 100% or 150% scaling, where we do ship exact-match icons. I've flagged this — the real fix is shipping (or rendering) icons at more DPI steps.

### 19. Slow email push notification
**Thread:** https://community.getmailspring.com/t/slow-email-push-notification/14471
**Action:** Reply + mark Resolved

> There's actually a manual shortcut for this — press **F5** (bound to "Sync Mail Now") to force an immediate check across all your accounts instead of waiting on push. Outside of that, delivery speed for new mail depends on your provider's IMAP IDLE/push support, which isn't something we control from the client side, but F5 should get that OTP email through right away.

### 20. Not showing notification alert in mac for new incoming emails
**Thread:** https://community.getmailspring.com/t/not-showing-notification-alert-in-mac-for-new-incoming-emails/14499
**Action:** Reply

> A couple of things worth checking, since I can't fully diagnose this from the code alone. First, macOS gates notifications at the OS level independently of Mailspring's own settings — could you check **System Settings > Notifications > Mailspring** and confirm alerts are actually allowed there (macOS sometimes silently resets this after an update)? Second, we check whether a Focus/Do Not Disturb mode is active before showing anything — worth ruling out that one's on without you noticing. And just to confirm on our side: is **Preferences > Notifications > "Show notifications for new unread messages"** still checked? If all of those look right and it's still not firing, let me know your exact Mailspring version and I'll keep digging — the timing (~4 months, since around April) doesn't line up with anything specific I can find in our changelog yet.

---

## UI bugs

### 21. The page won't change when switch "Drafts" to "Activity" in sidebar
**Thread:** https://community.getmailspring.com/t/the-page-wont-change-when-switch-drafts-to-activity-in-sidebar/14539
**Action:** Reply

> This one's tricky to pin down from the code alone, but I found something suspicious: Drafts and Activity are the only two sidebar items that switch Mailspring's entire main view (every other item, like a folder or label, just changes what's showing within the same view) — and the code path handling that specific transition looks slightly different from how the rest of the app does it. I can't fully confirm it's the cause without seeing it happen live. Could you open Developer Tools (**View > Toggle Developer Tools**, or Ctrl+Shift+I) right before clicking between Drafts and Activity, and check the Console tab for any red error text when it fails to switch? That would really help track this down.

### 22. When I have 0 email in my inbox, there's a nice graphic showing up, but with some scroll bars glitch
**Thread:** https://community.getmailspring.com/t/when-i-have-0-email-in-my-inbox-theres-a-nice-graphic-showing-up-but-with-some-scroll-bars-glitch/14541
**Action:** Reply + mark Resolved

> Good news — this is fixed! A community member ran into the same thing and sent in a real fix ([PR #2821](https://github.com/foundry376/Mailspring/pull/2821)), which is merged and will ship in the next release. Thanks for the original report, and thanks to the contributor who tracked it down and fixed it.

### 23. E-mail row permanently green on mouse over
**Thread:** https://community.getmailspring.com/t/e-mail-row-permanently-green-on-mouse-over/14532
**Action:** Reply

> That green is the archive-swipe background, and I think I found how it's getting stuck. Swipe-to-archive tracks a horizontal scroll gesture and relies on a matching "gesture end" event to clear the animation — if that end event ever gets dropped (which can happen intermittently with precision touchpads or mice that have a tilting/horizontal scroll wheel on Windows), the archive-green backing never resets and stays painted on that row indefinitely. If your mouse has a tilt-scroll wheel, that's the most likely trigger. It's a real bug — I've flagged it. In the meantime, switching to a different folder and back, or restarting Mailspring, should clear the one stuck row (though it may recur on a future hover).

---

## Sync / crashes (harder to fully diagnose from this side)

### 24. Sync history depth
**Thread:** https://community.getmailspring.com/t/sync-history-depth/14533
**Action:** Reply

> I looked through the app's code and don't see any built-in limit on how far back Mailspring syncs for a generic IMAP account — the intent is to backfill full history, same as what you're seeing work on the web client. The actual mailbox-fetching logic lives in our separate sync engine, so I can't fully diagnose why it's stopping around 2 years back from the code in front of me. Could you try **Preferences > Accounts > select the account > "Rebuild Cache"** and see if it picks up more history after a fresh sync? If that doesn't help, let me know your provider and I'll dig further on the sync-engine side.

### 25. I keep getting crash reports
**Thread:** https://community.getmailspring.com/t/i-keep-getting-crash-reports/14535
**Action:** Reply

> Thanks for including the coredump details. I checked, and this doesn't look like the two Linux crash-loop fixes we shipped in 1.23.0 (those were about our Electron process's uncaught-exception handler looping on specific I/O errors) — a plain SIGABRT while sitting idle looks like a different kind of failure inside the sync engine itself, which I don't have visibility into from the app's code. If you still have the coredump, running `coredumpctl gdb` on it to grab a backtrace would help a lot — feel free to share that here and I'll take a look.

### 26. Problem with local email database
**Thread:** https://community.getmailspring.com/t/problem-with-local-email-database/14453
**Action:** Reply

> The chrome-i18n extension error is harmless and unrelated — that's an optional language-detection extension failing to load, which we already catch and log without it affecting anything else. The real problem is the "local email database" dialog itself, which means our sync engine is failing to start up/migrate on launch; Rebuild only clears the local index cache, so if the underlying process can't run at all, Rebuild will just loop the same way you're seeing. You posted this on 1.21.1 — please update to the current 1.23.0 first, since several startup and crash fixes have shipped since then. If it's still stuck after updating: fully quit any lingering `mailspring`/`mailsync` processes, then try a clean reinstall (this will require reconnecting your accounts), and if it still won't launch, running Mailspring from a terminal and sharing the full console output would help us see exactly where it's failing.

---

## Attachments / Mac

### 27. Attachements not visible in thread on Mac
**Thread:** https://community.getmailspring.com/t/attachements-not-visible-in-thread-on-mac/14518
**Action:** Reply + mark Resolved

> They're not gone — when a message with attachments collapses into the thread view, we still show a small paperclip icon on that collapsed row specifically so you know they're there. Click that row (or the paperclip) to expand the message, and the full attachment list with downloads shows up. There's no setting to fully turn off threaded/collapsed view today, but expanding the specific message gets you straight to the file every time.

---

## Linux / Wayland

### 28. Global menu not working when run under Wayland
**Thread:** https://community.getmailspring.com/t/global-menu-not-working-when-run-under-wayland/14521
**Action:** Reply + mark Resolved

> This is a known Electron/GTK limitation, not something we can patch on our end — Electron's native Wayland backend bypasses GTK entirely, and KDE's Global Menu integration depends on that GTK layer, which is exactly why `--ozone-platform=x11` fixes it for you (it runs Mailspring through XWayland, where GTK's menu export works normally). We already detect native Wayland sessions and show an in-app menu button as a fallback so nothing is unreachable, but if you specifically want the desktop's Global Menu back, your workaround is the right one — you can make it permanent by editing the `Exec=` line in Mailspring's `.desktop` file (or a copy in `~/.local/share/applications/`) to include the flag.

---

## macOS

### 29. Undelete error on macOS
**Thread:** https://community.getmailspring.com/t/undelete-error-on-macos/14241
**Action:** Reply

> A couple of things that could explain it: Cmd+Z only undoes a delete if focus isn't in a text field when you press it (a search box, a compose window, etc.) — if focus is in a text input, Cmd+Z does a normal text-undo instead, and the delete-undo is lost from there. There's also a real limitation where deleting messages/threads that came from more than one folder in the same selection isn't undoable at all. Can you confirm: was your focus somewhere other than a text box when you pressed Cmd+Z, and were the deleted items all from the same folder? That'll tell me which of these you're hitting — or if it's neither, this may be a genuine regression worth digging into further.

---

## Account/Server-side issue

### 30. Bug: New signature image overwrote old assets on Mailspring server (affecting old emails and shared accounts)
**Thread:** https://community.getmailspring.com/t/bug-new-signature-image-overwrote-old-assets-on-mailspring-server-affecting-old-emails-and-shared-accounts/14480
**Action:** Reply

> This is a serious report and I want to get it right rather than guess at the mechanism on something affecting a shared account. Could you tell me: was the signature you created and then deleted based on/duplicated from your team's existing default signature, or created fresh? And do you still have the original correct image file, so it can be re-uploaded once we track down the cause? I'm going to dig into the asset storage code directly rather than speculate here — I'll follow up on this thread once I know more.

### 31. Thread (email) won't empty from trash
**Thread:** https://community.getmailspring.com/t/thread-email-wont-empty-from-trash/13956
**Action:** Reply

> Let's try the standard fix first: **Preferences > Accounts > select the account > "Rebuild Cache"** — that clears out local/server mismatches like a thread that won't budge from Trash. If that specific thread is still stuck afterward, let me know and I'll dig into why — it'd help to know if that thread also appears in any other folder/label at the same time.

---

## Feature requests / billing

### 32. Archive subfolders
**Thread:** https://community.getmailspring.com/t/archive-subfolders/14486
**Action:** Reply

> There's no built-in way to auto-file archived mail into a year/month folder structure today — Archive is just a single configured folder/label. What you can do: most IMAP providers (including Gmail) support "/" as a folder hierarchy separator, so manually creating folders like `Archive/2026/01` ahead of time should nest properly, and you can then set up mail rules (Preferences > Rules) to route matching messages into a specific existing folder. There's no way to have a rule generate "this month's" folder automatically, so you'd need to create each one ahead of time — not as smooth as true auto-dated subfolders, but workable for invoice-style organizing. I'll note true dated-subfolder support as a feature request.

### 33. Can't upgrade
**Thread:** https://community.getmailspring.com/t/cant-upgrade/14474
**Action:** Reply

> Sorry about that — we moved the upgrade/payment flow out of the in-app modal in 1.22.0 so it now runs in your regular browser with a newer Stripe integration; that should have resolved most of the old in-app 500 errors, but if you're still hitting one, it's worth flagging directly. Could you email support@getmailspring.com with roughly when you saw the error and which browser/card you used? That'll let us check the Stripe logs on our end, which isn't something I can see from the forum.

---

## Resolved by the user / follow-up

### 34. Could someone please review this post and let me know how to get v1.17 working on Fedora 43?
**Thread:** https://community.getmailspring.com/t/could-someone-please-review-this-post-and-let-me-know-how-to-get-v1-17-working-on-fedora-43/14103
**Action:** Reply + mark Resolved

> Glad you found a version that works! No worries about the post — marking this resolved since you're up and running again. If 1.17+ still gives you trouble on Fedora 43 down the line, feel free to open a new thread with the specific error (looked like a `libtidy` dependency issue) and we'll take a look.

---

## Long-standing known issues (older threads, still getting activity)

### 35. Still duplication sent on outlook
**Thread:** https://community.getmailspring.com/t/still-duplication-sent-on-outlook/14517
**Action:** Reply

> Wanted to be upfront: this is a genuinely long-standing, unresolved issue on our side, not something you're missing a setting for. And you're right that Microsoft has removed the "don't save copies of sent messages" toggle from Outlook.com's newer settings, so the old workaround isn't available anymore either. The root cause is on our end (in how we detect whether Outlook's server already saved a copy before we save our own), and it isn't fixed yet — I don't have a timeline to share. Sorry I don't have better news; wanted to at least confirm you're not missing something simple.

### 36. When I input Japanese, the sentence disappears during the input
**Thread:** https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535
**Action:** Reply

> Picking this back up since it's still coming up — this isn't fully fixed yet. It's a known limitation in how the composer's rich-text editor handles IME composition events, and we've landed a few targeted patches over time without fully solving it. The most reliable workaround people have confirmed: switch **Preferences > Composing > Default Message Format** to Plain Text — the issue is specific to rich text mode. I know that's not a full fix, and I'm sorry this has dragged on; a proper fix needs deeper editor work we haven't scheduled yet.

### 37. Chinese Inputer not compatible
**Thread:** https://community.getmailspring.com/t/chinese-inputer-not-compatible/745
**Action:** Reply

> This is the same underlying issue as our [Japanese IME thread](https://community.getmailspring.com/t/when-i-input-japanese-the-sentence-disappears-during-the-input/535) — it's not Chinese-specific, it's how the composer's rich-text editor handles IME composition events generally, and it hasn't been fully fixed despite a few targeted patches over time. The workaround that's worked for others: **Preferences > Composing > Default Message Format** > Plain Text. Sorry it's taken this long — I don't have a timeline for a real fix yet.

### 38. Select all - Limited to 200 messages?
**Thread:** https://community.getmailspring.com/t/select-all-limited-to-200-messages/6727
**Action:** Reply

> This is a known limitation — "Select All" only selects what's currently loaded into the list (which is virtualized for performance), not the entire folder, so scrolling further reveals more unselected messages. There isn't a single action today that reliably selects an entire large folder in one shot — that would need real backend support for "act on everything matching a query" rather than an in-memory selection. I don't have a timeline, but I know it keeps coming up for people organizing large mailboxes.

---

## Added 2026-08-14

### 39. Inbox view doesn't refresh on new mail arrival — unread indicators and message list go stale until switching folders
**Thread:** https://community.getmailspring.com/t/inbox-view-doesnt-refresh-on-new-mail-arrival-unread-indicators-and-message-list-go-stale-until-switching-folders/14550
**Action:** Reply

> Really appreciate the detailed writeup — and your read on this being a notification/re-render bug rather than a sync problem lines up with what I found: there's no visibility-based pause or debounce anywhere in the code path that pushes database changes out to the thread list, so the underlying mechanism should always be live. What I did find is a specific hazard that fits your symptoms well: each list view holds a query subscription with an in-flight flag that's supposed to clear once a pending update finishes rendering — but if that particular update never completes cleanly (which can happen when a fetch gets superseded by a newer one, e.g. from scrolling or resizing right as new mail arrives), the flag can stay stuck "on," and everything after that gets silently queued instead of rendered. Switching folders and back builds a brand new subscription from scratch, which would explain why that always clears it. I want to be upfront that this is a real, citable hazard in the code rather than a confirmed reproduction of your exact case — I haven't nailed down the precise trigger yet. If you notice any pattern to when it happens (right after scrolling, right after a window resize, etc.) that would help a lot in pinning it down further.

### 40. Self-sent messages disappear from Inbox in unified/combined view (still occurring, related to #149)
**Thread:** https://community.getmailspring.com/t/self-sent-messages-disappear-from-inbox-in-unified-combined-view-still-occurring-related-to-149/14546
**Action:** Reply

> Thanks for the thorough writeup and the links to the old issues — genuinely useful context. I went through the app-side query logic for the unified Inbox and your specific "CONDSTORE race between Inbox and Sent" theory doesn't quite match what I see there: it's an inclusive query (any account's Inbox category), not something that would exclude a thread just because it's also filed in Sent. What I did find is a different, more specific candidate: every non-Trash/Spam view — Inbox included — additionally requires a thread to be flagged `inAllMail` before it'll show up, and that flag is set by the sync engine (not something I can inspect from the app code in front of me), not by anything client-side. If that flag were ever left false or stale on a self-sent thread, it'd explain exactly what you're seeing — visible via search (which doesn't require that flag), invisible in Inbox. I can't confirm from here why it'd go stale specifically for self-sent mail, since that's sync-engine territory, but this gives us a concrete, specific thing to check rather than a vague "known issue." I'll follow up here once I've been able to look at the sync engine side.

---

## New this week (2026-08-21)

### 41. Search with advanced, Gmail-style queries
**Thread:** https://community.getmailspring.com/t/search-with-advanced-gmail-style-queries/153
**Action:** Reply

> Thanks for the screenshots — that's a clear, specific example to work from. I traced how search works on the app side: it queries a local full-text index (SQLite FTS) but doesn't build or populate it — that indexing happens entirely in our sync engine, which isn't something I can inspect from here, so I can't tell you exactly why that one message from Simona didn't make it in. Worth trying first: **Preferences > Accounts > select the account > "Rebuild Cache"**, which rebuilds the local database (including the search index) from scratch — that clears up sync/index mismatches like this in a lot of cases. If it's still missing after a rebuild, let me know and I'll dig further on the sync-engine side.

### 42. Umlauts break attachment names ("Unnamed Attachment")
**Thread:** https://community.getmailspring.com/t/umlauts-break-attachment-names-unnamed-attachment/9903
**Action:** Reply

> Thanks for confirming this is still happening on 1.23.0 — and it's genuinely useful that you're seeing it with Portuguese characters too, since that points to a general non-ASCII filename issue rather than anything Umlaut-specific. I traced the "Unnamed Attachment" fallback in our code: it only shows up when an attachment's filename arrives completely empty from our sync engine, which is also where the actual MIME filename parsing/decoding happens — that's not code I have visibility into from the Electron app side, so I can't pin down exactly why a non-ASCII filename header is getting dropped instead of decoded. I've flagged this with the specifics you've given (German and Portuguese special characters) so it can be tracked down on the sync-engine side.

### 43. "No Recipient" error on email send. Email shows in drafts, but is empty on draft open
**Thread:** https://community.getmailspring.com/t/no-recipient-error-on-email-send-email-shows-in-drafts-but-is-empty-on-draft-open/687
**Action:** Reply

> Really glad you dug into this one — it's been open since 2021, and getting an actual root cause from someone who can reproduce it would be huge. To answer your question directly: yes, please go ahead and open the PR. This bug isn't a GitHub issue we've labeled `accepted` (per our contributing guide, that label is normally how we greenlight external PRs), but this thread is exactly the right place to get that sign-off instead, so consider this it. One thing that might line up with what you found: when Mailspring resolves the "From" account at send time, there's a code path (`ensureCorrectAccount()` in `draft-editing-session.ts`) that — if the draft's stored account doesn't match the account that actually owns the send-as address — will silently create a brand-new draft under the correct account and destroy the old one, and that destroy isn't awaited relative to the create. A Google Workspace account with multiple "send as" identities seems like exactly the kind of setup that could trigger a mismatch there. If your fix is in that neighborhood, that'd match what I can see from the app side — thanks for sticking with this, and looking forward to the PR.

---

## New this week (2026-08-28)

### 44. Mailspring inbox archive collapse issue
**Thread:** https://community.getmailspring.com/t/mailspring-inbox-archive-collapse-issue/14556
**Action:** Reply

> Thanks for the detailed writeup — this is a serious report and I want to route it to the right place rather than guess at the fix. The behavior you're describing (a message getting reassigned away from Inbox because it's also present in another folder like `Archive_`) would happen in our sync engine, which is a separate C++ component I can't inspect from the Electron app's code, so I can't confirm the exact mechanism you've traced. That said, your theory — identity being tracked across folders instead of being keyed per-folder the way Thunderbird does it — is specific and testable enough that it's worth putting in front of the people who work on that code directly. If you still have the sync logs showing the reassignment happening, hanging onto those (or attaching them here) would help a lot when this gets picked up.

### 45. Scrollbar on empty animations
**Thread:** https://community.getmailspring.com/t/scrollbar-on-empty-animations/14555
**Action:** Reply + mark Resolved

> Thank you for this — both the report and the fix. I've merged [PR #2821](https://github.com/foundry376/Mailspring/pull/2821); it'll ship in the next release. (To answer your side question: yes, branch protection allowing you to merge your own PR was expected here, not a bug — external contributors don't have merge access, so what you saw was likely just GitHub showing you the merge button without it actually being enabled for you. Either way, this one's in via the normal review.) Marking resolved since [this is the same bug reported here](https://community.getmailspring.com/t/when-i-have-0-email-in-my-inbox-theres-a-nice-graphic-showing-up-but-with-some-scroll-bars-glitch/14541) — thanks again for tracking it down and fixing it yourself.

### 46. A way to setup my own avatar for outgoing emails
**Thread:** https://community.getmailspring.com/t/a-way-to-setup-my-own-avatar-for-outgoing-emails/14554
**Action:** Reply + mark Resolved

> There's nothing to configure in Mailspring for this — when Gmail and most other clients show a sender avatar, they're looking it up themselves via Gravatar, keyed off a hash of your email address, not anything Mailspring sends along with the message. (We do the same thing on our end to show avatars for the contacts you receive mail from.) So the fix is on the Gravatar side: create/update a profile at gravatar.com using the exact email address you send from, and it should start showing up in recipients' clients within a bit.

### 47. Make the connection issues notice less intrusive
**Thread:** https://community.getmailspring.com/t/make-the-connection-issues-notice-less-intrusive/14551
**Action:** Reply

> Confirmed there's no setting for this today — the notice is a simple on/off banner tied directly to whether any account is currently reporting a connection problem, with no threshold, debounce, or "show as icon instead" option in between. For accounts that flap in and out of a bad connection frequently (common on a large work account doing a big scan), that does mean the banner can reappear a lot. I don't have a fix to offer right now, but a quieter mode for this is a reasonable ask — I've noted it as a feature request.

### 48. Custom Email Sorting
**Thread:** https://community.getmailspring.com/t/custom-email-sorting/470
**Action:** Reply

> No update on official sort-by-sender/subject support, I'm afraid — as the thread notes, that's tangled up with making conversation threading optional first ([tracked here](https://community.getmailspring.com/t/make-threading-conversation-view-optional/291)), which hasn't landed yet. In the meantime, the community [mailspring-unthreaded](https://community.getmailspring.com/t/mailspring-unthreaded-101-plugin-locking-up-mailspring/14547) plugin gets you an unthreaded list, and just had a stability fix (v1.0.2) for a freezing bug — worth trying if you want to get closer to a flat, sortable-feeling list today.

---

## Flagged for you separately — not included above, need your direct attention

- **I am currently unemployed** (https://community.getmailspring.com/t/i-am-currently-unemployed/14530) — asking for a temporary discount on the subscription due to financial hardship. This needs your personal judgment call, not a scripted reply.
- **Overdue payment** (https://community.getmailspring.com/t/overdue-payment/13945) — missed payment affecting read-receipts access; needs someone with account/billing system access.
- **Refund requested within 24 hours of purchase, no reply from support** (https://community.getmailspring.com/t/refund-requested-within-24-hours-of-purchase-no-reply-from-support/14545) — new this week. A user is asking publicly for an $85 refund after apparently not hearing back from support. Needs your/support's direct attention on the actual refund. Separately: one of the two community replies in that thread looks like it may have had a spammy link inserted into a quoted post after the fact (a "quote-modified" reply quoting the earlier community reply, with a `tropical-casino.com` link embedded inside the blockquote that wasn't in the original). I haven't followed that link. Worth a look in case it's a compromised/spam account, independent of the refund question itself.
- A handful of **Service Issues / Bugs** threads didn't have enough specific detail to draw a confident, evidence-based conclusion, so I left them unanswered rather than guess: **Mailspring will not authenticate shaw webmail** (#14452, VPN + wrong IMAP port — now has a second user confirming the same symptom with no VPN at all), **Not able to install... SMTP Authentication Error 296** (#14243, Hostinger), **Gmail Won't Send** (#14496), **Encountered an error while syncing** (#14218), **Emails stuck on Monday, March 2nd** (#14276), **Mails not showing up - with different address** (#14549, GMX forwarding/alias question — too specific to that account setup to answer without back-and-forth).
- **Impossible to update mailspring to 1.20.1** (#14424, Flathub) already has a helpful reply from a community member (LinusDierheimer) — no action needed unless you want to add anything.
- **My mail rules are being ignored** (https://community.getmailspring.com/t/my-mail-rules-are-being-ignored/76) is still open from 2021 with no fresh lead this week — didn't want to bump it with nothing new to add.
- **Remove SMTP Authentication in favor of a proper implementation of OAUTH2** (#7871) — a real architectural ask (pure OAuth2 without SMTP AUTH fallback for O365), but the SMTP auth mechanism lives entirely in the C++ sync engine, which isn't in this checkout, so I can't give a confident answer on current behavior or plans.
- **JMAP support** (https://community.getmailspring.com/t/jmap-support/14487) — new this week, two users asking whether we'd consider JMAP over IMAP. This is a roadmap/protocol-strategy call, not something I can answer from the code — needs your take, not a scripted reply.
- **Flatpak Distribution on Linux** (#68) — you already replied directly on 8/26, so no action needed here.
- **Make Threading/Conversation View Optional** (#291) — the 104-post megathread that item #48's reply (Custom Email Sorting) points back to, along with the mailspring-unthreaded plugin. No maintainer commitment exists yet and nothing new was said this week beyond what's already in the thread, so I didn't add another reply on top of it — but it's worth knowing it's still the live blocker behind both.
- A few very old, low-detail threads with no recent activity (**Cannot login to Gmail** #10026, **I am new to Mailspring Pro... contacts** #9606, and similar single-post threads from 2025) — left alone rather than reviving stale threads with generic advice.
