# Mailspring Discourse Reply Drafts — Batch 1

### 1. I can't create a new account (Yahoo Authentication Error)
**Thread:** https://community.getmailspring.com/t/i-cant-create-a-new-account/14397
**Action:** Reply + mark Resolved

> Yahoo requires an **app-specific password** — your regular Yahoo password won't work with IMAP clients. Here's how to fix it:
>
> 1. Go to [Yahoo's app password page](https://help.yahoo.com/kb/SLN15241.html) and sign in.
> 2. Generate a new app password (select "Other App" and name it "Mailspring").
> 3. Copy the 16-character password it gives you.
> 4. In Mailspring's setup screen, paste that app password (not your regular password) into the password field.
>
> This is shown as a note on the Yahoo setup screen in Mailspring, but it's easy to miss. Once you use the app password it should connect right away.


### 2. Adding "Aptos" font to the Composer font list
**Thread:** https://community.getmailspring.com/t/adding-aptos-font-to-the-composer-font-list/14385
**Action:** Reply

> The font picker list is hardcoded in `app/src/components/composer-editor/base-mark-plugins.tsx` in the `DEFAULT_FONT_FACE_OPTIONS` array — there's no plugin API to add entries to it without modifying that file and rebuilding. That said, there's a workaround: you can type any CSS font-family value directly into the font picker's text field if your theme exposes it as an editable input, or you can select some text and paste `<font style="font-family: Aptos">` in the raw HTML view.
>
> The bigger issue is that Aptos is a Microsoft-bundled font, so recipients on macOS or Linux won't have it installed and their clients will fall back to a system font. For composed HTML email, web-safe fonts (or fonts with wide OS coverage like Arial, Georgia, or Verdana) are much more reliable. I'll note the font list extensibility as a feature request — it's a reasonable ask.


### 3. Action buttons (customizing notification and list buttons)
**Thread:** https://community.getmailspring.com/t/action-buttons/14383
**Action:** Reply

> The quick-action buttons (archive/trash icons that appear on hover in the thread list) aren't currently configurable — they're hardcoded to archive and trash. There's no setting to swap in a "mark as read" button instead. I'll log this as a feature request because it's a reasonable ask.
>
> On the notification bug: if clicking the "Archive" button on a notification is also opening the email, that does sound like unintended behavior. Could you let me know your OS and Mailspring version? On Windows, notification action buttons use protocol activation which can sometimes focus the main window as a side effect — knowing your setup will help me track this down.


### 4. Snooze button missing in search
**Thread:** https://community.getmailspring.com/t/snooze-button-missing-in-search/9708
**Action:** Reply

> This is intentional but admittedly a bit limiting. The snooze button is only shown when you're viewing the Inbox perspective — the code checks `FocusedPerspectiveStore.current().isInbox()` before rendering it, and search results are their own perspective. The reasoning was that snoozed threads get moved to a Snoozed folder and then returned to Inbox, which only makes sense in an inbox context. That said, there's no good reason you shouldn't be able to snooze from search — I'll revisit this restriction. In the meantime, you can open the thread from search results, then navigate back to the inbox and snooze it from there.


### 5. Mailspring blocked by Norton (IDP Generic false positive)
**Thread:** https://community.getmailspring.com/t/mailspring-blocked-by-norton/14287
**Action:** Reply

> This is a false positive — Norton's "IDP Generic" detection is a heuristic that can fire on any auto-updating Electron app. Mailspring is not malware. To get back up and running:
>
> 1. Open Norton and go to **Security > History**, find the quarantined Mailspring file, and choose **Restore & Exclude**.
> 2. If you can't restore it, download a fresh installer from [getmailspring.com](https://getmailspring.com) and add Mailspring's folder (`C:\Users\<you>\AppData\Local\Mailspring`) to Norton's exclusion list before installing.
>
> We've had a few reports of this with IDP Generic around updates — it seems to trigger on the Squirrel update mechanism. If adding an exclusion and reinstalling doesn't resolve it, please let me know your Norton version and I can dig into it further.


### 6. Mailspring being blocked by Smart App Control
**Thread:** https://community.getmailspring.com/t/mailspring-being-blocked-by-smart-app-control/14166
**Action:** Reply

> Windows Smart App Control requires apps to have a strong reputation signal built up from a large number of downloads of a specific binary hash. Because each Mailspring release is a new binary, new versions occasionally hit this before enough users have downloaded them. This is unfortunately a Microsoft-side reputation system we can't directly control.
>
> The quickest fix if you're blocked is to **temporarily disable Smart App Control** (Settings > Privacy & Security > Windows Security > App & Browser Control > Smart App Control > Off), install Mailspring, then re-enable it. Alternatively, downloading the latest version from [getmailspring.com](https://getmailspring.com) a few days after release usually works because the reputation has had time to accumulate. Sorry for the friction — this has improved with recent releases as we've accumulated more download history.


### 7. How do I remove left-side window control buttons in Mailspring on Linux?
**Thread:** https://community.getmailspring.com/t/how-do-i-remove-left-side-window-control-buttons-in-mailspring-on-linux/14273
**Action:** Reply

> Those left-side buttons are Mailspring's custom window controls — they show up when the "Custom Window Frame and Right-hand Menu" (hamburger) mode is selected in Preferences. If your desktop environment (GNOME 48, COSMIC, etc.) also adds its own window controls, you end up with two sets.
>
> To remove Mailspring's built-in controls, go to **Preferences > Appearance** and change "Window Controls and Menus" to **"Default Window Controls and Menubar"**, then click **Relaunch**. That will let your desktop environment's native window decoration handle everything. The "hamburger" mode is designed for setups where you want Mailspring to draw its own frame (similar to how it looks on macOS), but on GNOME or COSMIC with native titlebars it creates the duplication you're seeing.


### 8. Spellcheck not working
**Thread:** https://community.getmailspring.com/t/spellcheck-not-working/5492
**Action:** Reply

> Spell check in Mailspring uses the Electron session's built-in spell checker (via `session.setSpellCheckerLanguages`). A couple of things to check:
>
> 1. **Make sure a language is selected**: Go to **Preferences > Composer** and verify the spell check language is set (not blank). If it's set to a regional variant your Electron build doesn't have (e.g. `en-GB` but only `en` is available), it silently does nothing.
> 2. **Click in the Subject field first**: There's a known quirk where spell check sometimes needs to be "woken up" by focusing the subject field before it activates in the body. This is a side effect of how we throttle spell checking during fast typing.
> 3. **Rich text mode**: Spell check works in both rich text and plain text modes — if you're seeing it work only in plain text, that would be a bug worth reporting with your OS and version.
>
> What OS and Mailspring version are you on? That'll help narrow it down.


### 9. Trash won't empty
**Thread:** https://community.getmailspring.com/t/trash-wont-empty/3182
**Action:** Reply

> This is a cache sync issue — Mailspring's local database shows messages that the server has already deleted, so the "Empty Trash" button has nothing to actually act on. The fix is to reset the local cache:
>
> Go to **Preferences > General**, scroll to the bottom, and click **Reset Cache**. Mailspring will re-sync from the server and the phantom messages will disappear. This is safe to do — no email is deleted from the server, it just rebuilds the local database from scratch.


### 10. Remove a plugin
**Thread:** https://community.getmailspring.com/t/remove-a-plugin/6529
**Action:** Reply + mark Resolved

> To uninstall a third-party plugin, just delete its folder from Mailspring's packages directory and restart the app:
>
> - **macOS/Linux**: `~/.config/Mailspring/packages/<plugin-name>/`
> - **Windows**: `%AppData%\Mailspring\packages\<plugin-name>\`
>
> There's no "uninstall" button in the UI currently — it's a manual folder deletion. After restarting Mailspring the plugin will be gone.


### 11. Bilder werden beim Speichern oder Drucken mit Falschfarben angezeigt (Images show incorrect colors when printing)
**Thread:** https://community.getmailspring.com/t/bilder-werden-beim-speichern-oder-drucken-mit-falschfarben-angezeigt/14331
**Action:** Reply

> This is a known issue with how Chromium (the browser engine Mailspring is built on) handles colors when printing or saving to PDF. The print stylesheet sets `background: transparent` on message content, and some GPU color profiles can cause hue shifts in images when compositing onto a transparent background during the print/PDF render path.
>
> A few things to try:
> 1. In the print preview window, try **Save as PDF** instead of **Print** (or vice versa) — sometimes one path renders colors correctly while the other doesn't.
> 2. Launch Mailspring with `--disable-gpu` to rule out GPU color management as the cause: on Windows, create a shortcut and add `--disable-gpu` to the Target.
>
> Could you share what OS and GPU you're on, and whether this affects all images or specific types (e.g. JPEGs vs. PNGs)? That would help me narrow down whether this is a color profile or compositing issue.

