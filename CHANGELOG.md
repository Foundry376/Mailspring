# Mailspring Changelog

### 1.3.0 (7/14/2018)

* Mailspring 1.3 brings an overhauled search bar with powerful autocomplete that makes it easier to create advanced search queries.

  * In addition to searching for freeform text and using the Gmail query language (`subject:`, `in:`, `is:`, `from:`, `to:`), Mailspring now allows you to search by date using natural language terms like `since: "last week"` and `before: "february 5th"`. Try combining them with other terms to search a specific time window!

  * You can now right-click a thread to search for other threads from that sender or with that subject.

  * You can now focus the search bar and conduct searches entirely with keyboard shortcuts (use Escape to exit the search bar!) #960

* Mailspring now uses Electron 2.0.2, which delibers some [great bug fixes and new features](https://github.com/electron/electron/releases/tag/v2.0.0):

  * Chrome 61, Node 8.9.3, V8 6.1.534.41 with improved performance and lower memory footprints
  * Better GTK+ theme support, including support for menu styling
  * Better support for Linux desktop notifications
  * The app will no longer cancel restart or shutdown

Fixes:

* Mailspring no longer clips some messages containing images incorrectly. #569

* The Reply-To header is now shown when you expand the message headers. #973

* Dropping images onto the composer now reliably inserts them as inline attachments. #822

* Mailspring now correctly opens attachments with filenames containing emoji on Windows.

* You can now drag and attachment out of Mailspring by it's quicklook preview as well as it's title.

* Using Mailspring on Windows in a user account containing accent characters or other special characters no longer prevents attachments from being cached. #810

* Mailspring no longer throws an exception when trying to display a message with attachments but no downloaded body. #804

* The "hamburger" icon in the top right of the main window no longer appears gray-on-gray in the "Ubuntu" theme. #801

* Auto-hiding of the menu bar now works correctly on Linux. #938

* Clicking on the open/link tracking "detail dot" now shows individual tracking events correctly. #945

* The Print window no longer contains an incorrect menu bar on Windows. #958

* Signatures with Facebook and Twitter profiles now display the service favicons reliably when viewed in Gmail and Outlook. #968

* Invalid themes no longer "brick" the app - Mailspring will present an alert with the error and offer to revert to the basic theme. (Mailspring-Theme-Starter/issues/1)

### 1.2.2 (5/30/2018)

Fixes:

* Drafts sent with RTL text now appear correctly justified for recipients. #869

* In the Linux Snapcraft release, app indicator compatibility has been improved by coercing XDG_CURRENT_DESKTOP to Unity (Thanks Martin Wimpress at Canonical!)

* On Linux, clicking on the system tray toggles the visibility of Mailspring's windows instead of always showing them. #650

* On macOS, Mailspring asks if it can move itself to Applications and handles the new app translocation rules in High Sierra correctly.

* Drafts now allow file attachments up to 25MB in size, and the error message has been corrected. #854

* When linking email accounts, the IMAP/SMTP host fields correctly ignore whitespace to avoid connection errors. #876

* Mailspring's sync process no longer crashes when the snooze / reminder actions of more than 200 threads need to be processed at once.

* Mailspring now correctly auto-links email addresses in the composer into mailto: links #814

* Searching by `subject:xxx` now works, thanks to fixes to the mailsync indexer. #860

* Viewing a draft with no recognized `from` participant no longer causes the app to crash. #857

Development

* Bumped to Electron 1.8.7, which includes patches for security vulnerabilities (updated command-line backlist switches), and fixes a flickering issue on high-DPI macOS displays.

### 1.2.1 (4/4/2018)

Fixes:

* Copy / paste now works correctly in message contents and draft fields, correcting a regression in 1.2.0.

* Right clicking words in the composer now correctly shows spelling suggestions. #747

* Right clicking in the composer now presents a "Paste and Match Style" option. #655

* The left 50px of "To" field of message headers is now clickable.

* Signatures with images now display correctly in mail clients that don't support CSS. To take advantage of this improvement, remove and re-attach images to existing signatures.

* URLs containing the format `#/xxxx?a=b` are now automatically linked correctly.

* The "learn more" link in the thread sharing modal now links to a public knowledgebase article.

### 1.2.0 (4/3/2018)

Features:

* **Thread Sharing** allows you to easily sync an email thread to the cloud and share it using a link. Mailspring automatically syncs new emails that arrive on the thread and anyone with the link can view the thread or download attachments.

Fixes:

* Searching your mailbox using the "in:folder" syntax no longer produces a limited / old set of results when many, many results match.

* The composer cursor no longer gets "stuck" occasionally when typing diatric or multi-key composition characters. #718, #578

* The composer no longer copies an empty string to the clipboard if you have no selected text when you press Ctrl/Cmd+C. #787

* The thread toolbar buttons now have a grouped appearance which makes the UI more compact and usable. #283

* Mailspring now uses the correct presets for Fastmail and Startmail accounts. #759, #756

* Clicking to collapse a message with expanded headers now works as expected. #636

* Mailspring never shows images by default when you're viewing your spam folder. #784

Development:

* The "Download attachments when..." option, which was never implemented in the new sync engine, has been removed from Preferences > General.

* When resetting an account, Mailspring correctly re-fetches open/read receipt and snoozing metadata

* Mailspring now uses Electron 1.8.4.

### 1.1.5 (3/6/2018)

Fixes:

* Mailspring no longer crashes when trying to connect some IMAP accounts that it cannot resolve to a preset configuration. #739

* Mailspring no longer requires you to manually provide information for IMAP accounts that are aliases of other proivders, like hotmail.it. #736

* An error no longer replaces the composer when an "emoji mark" cannot be found. #685

* When you click a mis-spelled word, Mailspring no longer selects the entire word. #677

* When you send mail, Mailspring no longer puts your hostname in the MIME Message-ID.

* In the composer you can now edit existing links and links don't open by default unless you control-click them. #702, #704, #639

* The colon character (:) no longer breaks automatic link detection. #695

* When you remove an account, Mailspring resets its local cache for that account, removing stored data on disk. #724

* Images with width and height values containing decimals no longer break logic designed to autosize them for display.

Improvements:

* Mailspring now uses Electron 1.8.3, which includes two security improvements.

### 1.1.4 (2/14/2018)

Fixes:

* Searching in the `Sent` folder (and other folders assigned mailbox roles) now works reliably.

* Connecting accounts no longer throws `SIGABRT` / `3221225477` errors in some scenarios. #292

* Connecting accounts no longer fails when the email provider returns non-UTF8 characters in IMAP responses.

* The open tracking pixel now has an `alt` tag that self-identifies it as a tracking pixel, which prevents messages from Mailspring from being flagged as spam by some providers. #668

* Mailspring no longer registers for the Utility and Development application categories and appears in the `mail` package category on Debian systems. #673, #678

* On Linux, the tray assets are larger again (48x48px) in an attempt to make them render properly in more distros.

* In the Taiga theme, the selected item in dropdown menus is visible. #674

### 1.1.3 (2/6/2018)

Improvements:

* When adding an IMAP account, Mailspring now uses the domain's MX records to identify if it can use settings for a common email service to skip the full, complicated IMAP settings screen.

* When adding a Gmail account, Mailspring now uses two-legged OAuth instead of three-legged OAuth which allows it to renew it's access token more rapidly. (Re-authenticate Gmail accounts for this to take effect.)

* Mailspring `VACUUM`'s the SQLite database every two weeks to prevent fragmentation that can eventually ruin performance. Unfortunately, data cannot be read or written during this process and it can take ~2 minutes for a 3GB database, so it is performed at launch with a new progress screen.

Fixes:

* On linux, the system tray icon is smaller (22x22 with 18x18 content vs 32x32)

* In dark themes, quoted text no longer appears a dark purple that is difficult to read.

* Mailspring no longer becomes "blocked" when ingesting a large number of deletions in a mailbox and will no longer attempt to retrieve many, many new messages all at once.

* When changing accounts in the composer the signature correctly updates to the new account's default. #570

* In the message viewer, the "Download All Attachments" button appears if the email contains multiple images. #583

* In the message viewer, inline images specified using a "cid:filename.png@RANDOM"-style URL now render correctly in the message body instead of as attachments. #569

* Threads with only sent emails no longer appear as from "1969" in some places. #508, #457

* The "Local Time" shown in the company sidebar is now correct and updates in realtime.

* On Linux, `mailspring.desktop` no longer reports that the app is an editor for `text/plain` #602

* Undo no longer triggers in both the email body and other recently edited text fields at the same time. #613

* Creating a draft no longer clears the conversations's "snippet" in the thread list.

* When printing a thread, Mailspring no longer prints `undefined` beside particicpants with no name.

* When pasting HTML, Mailspring now correctly preserves links that have other styling. #592

* When using "two pane mode", viewing the same conversation repeatedly will mark any new messages as read. #617

* When sending an email, the word "attachments" in your signature will no longer cause the app to complain about missing attachments. #610

* Mailspring no longer attempts to create the folder `Mailspring..Snoozed` on providers that include the path delimiter in the IMAP namespace prefix. #634

* When composing an email, Mailspring will display an alert if you need to choose a Drafts folder to send mail. #634

* Mailspring now uses Electron 1.8.2-beta5, which includes stability and security fixes.

* Exporting raw data from the Activity Dashboard now waits for the filesystem buffer to flush, preventing it from writing only some of the email data on slower hard drives.

* Mailspring no longer briefly spawns duplicate sync processes in some scenarios when you have many accounts linked.

* When your mailbox contains emails with the same subject and participants and no `Date` header, Mailspring now syncs them all instead of syncing them as a single message, which should prevent thrashing

* A subtle multithreading issue has been fixed which could cause your folders to become corrupted and prevent Mailspring from launching.

Memory and Performance:

* Creating a draft is now ~16x faster in scenarios where lots of quoted text is present.

* The undo history of the composer is cleared when you navigate away from a draft, reclaiming memory.

* Completed tasks are purged from the app's task queue more rapidly so performing many, many actions on your mailbox does not cause the application to use more memory.

### 1.1.2

Fixes:

* Mailspring creates the folder "Mailspring/Snoozed" on your email provider with the intermediate folder. [#588]

* Switching to drafts, away from drafts, and back to drafts no longer causes a crash. [#590]

* "Create a package manually" now works properly when the app is running without the `dev` flag.

* Drag and drop of emails now works again. [#586]

* When removing quoted text, some emails no longer cause an exception to be thrown. [#589]

### 1.1.1 (1/28/2018)

Features:

* The new composer now supports additional Gmail shortcuts, which you can view from Preferences > Shortcuts, including Cmd-K (make link), Cmd-Shift-8 (make bulleted list), etc. (#555)

* Mailspring now supports indicators in Ubuntu Gnome Session (Ubuntu 17+)

* Mailspring now supports Secureserver (GoDaddy), Roundcube, 163.com, and several other providers that did not allow folder names to contain the `[` character.

Fixes:

* The small "X" on the quoted text control is back, allowing you to easily remove the quoted text block when replying.

* Performance of the new composer has been greatly improved by eliminating calls to `draft.body` during editing.

* In dark mode, text in the composer appears white instead of black.

* Switching to a different font size and back to "normal" no longer makes text a slightly different size than it was originally.

* Spellcheck now supports words with non-latin characters correctly. (#564)

* The Less-is-More theme no longer contains small visual glitches with the new composer. (#547)

* Undo/redo within the composer or any text field no longer trigger both text undo/redo and mail action undo/redo. (#577)

* Mailspring now creates a "Mailspring" folder instead of a "[Mailspring]" folder because some providers do not allow the `[` character. (#551)
  Development:

* Mailspring no longer contains or supports Coffeescript or CJSX!

* Moved to Electron 1.8.2-beta4

* Moved to React 16.2

### 1.1.0 (1/16/2018)

Features:

* Overhauled composer with a great new editing toolbar and support for fonts, sizes, colors, right-to-left text, markdown shortcuts, and more.

* Brand new template editor in _Preferences > Templates_ with a more streamlined UI based on the new composer.

* From the Activity screen, you can now export the raw data in the selected time range to perform custom analysis on your open and link tracking data.

Improvements:

* On Linux, Mailspring now lets you choose to auto-hide the menubar, or use the sleek, Windows-style unified window frame with the menu behind a hamburger button.

Fixes:

* Mailspring no longer cleans up messages you've downloaded recently.

* When you edit an existing account, it's credentials are prepopulated for editing. (#496)

* The signature editor now supports Twitter profile pictures and autoformats your handle. (#493)

* On Windows, Mailspring supports installation in user directories with special characters. (#113)

* Generation of IDs in Mailspring is no longer timezone-sensitive on some machines.

* Drafts no longer fail to sze when you exit the app in some scenarios.

### 1.0.12 (12/28/2017)

Improvements:

* **Automatic CC / BCC**: From Preferences > Accounts, you can now configure automatic CC / BCC on emails sent from an account. (#275)

* The "Are you sure you want to send addressed to 'XXX'" warning is smarter and better phrased. (#381)

* You can now change the interface zoom from Preferences > Appearance. (#176)

Fixes:

* A regression from 1.0.11 has been fixed - Mailspring no longer fails to sync new mail for some accounts that do not support CONDSTORE. Mailspring will no longer give these messages timestamps from "1970". (#475)

* Panel widths are now saved correctly on exit. (#41)

* When waking from sleep, Mailspring checks for new mail immediately. (#468)

* When linking an account, you can now omit the SMTP username for SMTP without authentication. (#469)

* Mailspring allows all deprecated HTML attributes like `<strike>`, improving the rendering of emails. (#260)

* The `View` links in the contact sidebar now open the browser correctly.

* Electron has been bumped to 1.7.10, which fixes:

  * Subpixel font rendering with freetype on Linux.

  * Rendering issues with Nvidia GPU on High Sierra

  * Downloading updates twice on Windows

  * Auto-update for non-admin users on macOS.

### 1.0.11 (12/15/2017)

Improvements:

* You can now reset the cache for an individual account from Preferences > Accounts

* Mailspring now creates its config directory with more appropriate unix permissions (thanks @agurz!)

Fixes:

* On Windows, Mailspring now sends attachments with non-latin characters correctly.

* Mailspring now moves mail correctly (via archiving, deleting, etc.), even if the provider does not support the IMAP MOVE extension.

* Mailspring now fetches incoming messages correctly (and immediately) for providers that support both CONDSTORE and QRESYNC.

* On Linux, the Mailspring snap no longer complains about missing typefaces on some machines.

* Drang and drop from search results into folders/labels has been fixed.

* The translation plugin has been fixed.

### 1.0.10 (12/7/2017)

Features:

* A brand new signature editor makes it easy to create beautiful signatures with images and important contact details.

Performance:

* SQLite schema changes significantly improve Mailspring's sync performance on very large mailboxes.

Fixes:

* A major memory leak on Windows has been fixed which caused Mailspring to slow down your computer, especially when waking from sleep.

* Mailspring no longer reports that it is still "looking for messages" in some cases after sync has completed.

* Search now correctly supports the "in:" syntax for all arbitrary folders and labels as well as built-in ones like "in:inbox".

* Several exceptions thrown in UI edge-cases have been fixed.

### 1.0.9 (12/1/2017)

Improvements:

* Sync progress reporting and status messages have been improved.

* Mailspring only attempts to passively fetch message contents once for each message, so bad messages no longer cause the app to "hang" in an "Syncing your Mailbox" state.

* A new setting allows you to choose the default spellcheck language. (Thanks @oserban!)

* A new setting allows you to choose whether Mailspring opens containing folders after downloading attachments. (Thanks @mattlyons0!)

* You can now copy-paste a file from the Finder or Windows Explorer into the composer.

* Mailspring now correctly sends mail with inline image attachments on all providers.

* Many issues that caused search to "hang" have been resolved.

* Mailspring now correctly linkifies URLs in more scenarios. (Thanks @agurz!)

* Many small email rendering issues have been resolved thanks to a new message sanitizer.

* Creating and immediately sending a draft with tracking enabled no longer fails in rare cases.

* Undo send no longer causes other open composer windows to close when a message is sent.

Development:

* Improved error collection will make it much easier to track down and fix remaining sync issues.

* Password management errors are now considered fatal, since they break the app during onboarding.

* The analytics package has been removed - we were not using the collected metrics.

### 1.0.8 (11/10/2017)

Features:

* A brand new Activity View (in the sidebar beneath Drafts) provides quick mailbox statistics and analytics for read receipts and link tracking.

Improvements:

* When snoozing, a setting in Preferences > General now allows you to choose whether emails should be moved to the top of your inbox or just returned to the inbox as unread. (Thanks @casuallancelot)

* Space and shift-space now move you up and down in the thread view. (Thanks @victortrac)

* The window title now carries the subject of the currently selected email. (Thanks @agurz)

* The dark theme has been overhauled to improve readability and ensure visual queues are present for important UI. It looks more like Spotify and less "all gray."

Fixes:

* Undo send now works correctly!

* Mailspring no longer pre-processes HTML through `tidy`, which was too strict and causing emails to display incorrectly and links to break.

* The thread list no longer "flickers" when archiving / deleting unread email.

* The spellchecker now handles non-ASCII characters in words correctly. (Thanks @jGleitz)

* Undo toasts no longer re-appear after switching views.

* In single pane mode, the "Back" button title with the folder name is no longer converted to titlecase.

* Disabling read receipts and link tracking now effects the current draft correctly in addition to future drafts.

* You can now provide any IMAP/SMTP hostname (e.g. `mail`)

* Starting and deleting a forwarded message no longer blocks you from creating another one in the same thread for a few seconds.

* The secret "Show Original" feature is back.

* Screenshot mode has been fixed. (Thanks @agurz)

* Mailspring now corrects inconsistencies in it's data as you perform mail actions, so threads can't get "stuck" in the trash, snoozed folder, etc.

* Drag and drop to the `starred` or `unread` views now works properly.

* Snooze dates are properly synced to the Mailspring backend, so they're persisted when you clear your cache or re-install Mailspring.

* On Windows, Mailspring no longer has problems saving attachments with extended UTF-16 characters, (eg Japanese or Polish.)

* Mailsync no longer crashes when messages have more than ~150 references to other messages in their headers.

### 1.0.7 (10/28/2017)

Fixes:

* The `Starred` and `Unread` views now correctly show threads with many starred/unread messages. (#100)

* The folder and label shortcuts are now separate and work properly for Gmail accounts. (#259 - thanks @casuallancelot)

* Mailspring no longer segfaults when it's unable to connect to your SMTP server during onboarding,
  and error messages no longer "destroy" the layout of the window.

* Mailspring no longer uses all memory on the computer in a rare scenario where your mail provider return an infinite range of message IDs. (#91)

* Mailspring can now be put in a verbose logging mode using `AppEnv.mailsyncBridge.toggleVerboseLogging()`, in which all IMAP and SMTP traffic is logged.

* You can now dismiss the "Please pay for Mailspring Pro!" prompt in the bottom left when more than four accounts are syncing. (Thanks @mattlyons0)

* On Linux, Mailspring no longer launches with the onboarding window in between monitors on dual-display setups. (Thanks @dbhowell)

* The contact search index now includes the first names of contacts, so you can find them more easily when typing in address fields. (#227)

* The default template no longer references Nylas incorrectly. (Thanks @Galaxias)

### 1.0.6 (10/19/2017)

Features:

* Mailspring now identifies an "Archive" folder if one is present in your Office 365 / IMAP accounts and enables the "Archive" button and "Swipe to Archive" behavior. If it is not picked up automatically, you can set it from Preferences > Folders.

* Mailspring now warns you if you the salutation in your email ("Hey Ben!") doesn't match the name of a recipient or appears misspelled.

* A new keyboard shortcut allows you to attach a file in the composer. (Ctrl-Shift-A by default!)

Fixes:

* The contact sidebar now loads correctly if you switch to a contact with no name.

* On Windows, Mailspring no longer needs to be restarted once before you can link a Gmail account.

* When replying to a message you sent in a thread, Mailspring no longer incorrectly addresses the new message to yourself.

* Mail rules now run correctly as new mail is received.

* The label picker is now correctly hidden if your selection includes threads from non-Gmail accounts.

* When you forward a message, it is now correctly associated with the existing thread.

* When renaming folders / labels, the app no longer shows the old and new items side-by-side in the left panel for a few minutes.

* When creating folders / labels, you can now use any characters supported by your provider, including emoji.

* When you move an item to a folder in a generic IMAP account, undoing the action now works properly.

### 1.0.5 (10/15/2017)

Features:

* A new bar appears when you view the Trash and Spam folders allowing you to permanently delete messages.

Fixes:

* On Windows, Mailspring now uses the system font, which looks more crisp on Windows 10.

* On Windows, swipe to archive now works on touch-screen laptops.

* On Windows, we now ship the VS C++ Redistributable runtime, fixing issues many users had running the app after a fresh install.

* The default Chomium "double-tap-to-zoom" behavior has been disabled on all platforms.

* Preferences > Folders now shows UTF8 folder titles correctly.

* On OpenSUSE, Mailspring now looks for certificates at the correct path, fixing authentication issues with servers that use SSL.

* The undo/redo toast no longer appears when switching to Drafts and back.

### 1.0.4 (10/12/2017)

Features:

* Company profiles are now available in the right sidebar! See tons of great information about the people you're emailing, including their local time zone, the company's core business area, and more.

* You can now choose folder associations explicitly if Mailspring is unable to correctly identify your Sent folder, for example.

* The IMAP/SMTP authentication panel automatically defaults to security settings that match the ports you provide.

Fixes:

* Sending mail is considerably faster for accounts that do not place the message in the Sent folder automatically.

* Sent mail no longer appears to be from `Dec 31st 1969` when sent through some older SMTP gateways.

* New folders / labels appear faster after you create them, and adding folders now works properly on IMAP servers that use a namespace prefix like `INBOX.`.

* Improves display of "Identity is missing required fields" error and directs people to a knowledge base article.

* Localhost is an allowed IMAP/SMTP server address.

* `<object>` tags are now completely blocked in message bodies.

### 1.0.3 (10/10/2017)

Features:

* You can now choose custom IMAP and SMTP ports when linking a custom email account.

* You can now leave the SMTP username and password blank to connect to an SMTP gateway that does not require authentication.

Fixes:

* On Linux, Mailspring looks for your trusted SSL certificate roots in more locations, fixing the "Certificate Errors" many Fedora and ArchLinux users were seeing when linking accounts.

* On Linux, Mailspring bundles SASL2 and SASL2 plugins, resolving "Authentication Error" messages that users of non-Debian Linux distros saw when the local installation of SASL2 was an incompatible version.

* On Linux, Mailspring now links against libsecret, resolving intermittent "Identity missing required fields" errors that were caused by the Node bindings to libgnome-keyring's API.

* On Linux, composer and thread windows no longer have a "double window bar".

* On Linux, window menu bars no longer hide until you press the Alt key.

* The .rpm package now requires `libXss`, resolving installation issues for some users.

* Spellchecking on linux now works reliably.

* On Mac OS X, some menu shortcuts (like Command-H) now appear in the menu bar properly.

* Mailspring now correctly parses `mailto:` links with multiple semicolon-separated CC and BCC addresses.

* The "Raw HTML" signature editor is now the proper size.

### 1.0.2 (10/6/2017)

Fixes:

* During authentication, you can now view a "Raw Log" of the IMAP and SMTP communication with your servers for easy debugging of connection issues.

* During authentication, Mailspring will warn you if you connect Gmail via IMAP.

* The "Install Theme...", "Install a Plugin Manually..." and "Create a Plugin..." menu items now work. Note that Nylas Mail / N1 themes require some modifications to work with Mailspring!

* On Windows and Linux, Mailspring can now make itself the default mail client.

* The contact sidebar in the app now works reliably and is rate-limited for free users (The Clearbit API is very expensive!)

* On Windows, Mailspring now displays emails with encoded subject lines (often containing emoji or foreign characters) correctly.

* On Windows, you can now resize and maximize the Mailspring window.

* Mailspring now skips folders it can't sync rather than stopping the entire account.

### 1.0.1 (10/4/2017)

Fixes:

* On Linux, Mailspring now syncs mail reliably thanks to fixed builds of curl and mailcore2.

* On Windows, the app's icon now includes all the required resolutions.

* Many other minor fixes and sync improvements.

### 1.0.0 (10/3/2017)

Features:

* Entirely re-written sync engine uses significantly less RAM and CPU, improving performance and battery life.

* Mailspring launches 55% faster, thanks to a new package manager and theme manager and a thinner application bundle.

* Improved quoted text detection makes it easier to read threads, especially messages sent from Exchange and older versions of Outlook.

Developer:

* Mailspring now stores user preferences in the appropriate platform-specific location: `Library/Application Support` on the Mac, `AppData/Roaming` on Windows, etc.

* `NylasEnv` is now known as `AppEnv` and `nylas-exports` and `nylas-component-kit` have been renamed `mailspring-*`. Additionally, packages need to specify `"engines": {"mailspring":"*"}` instead of listing `nylas`.

* Much more of Mailspring has been converted to ES2016, and CoffeeScript is no longer supported for plugin development. The CoffeeScript interpreter will be removed in a future version. Please use ES2016 JavaScript instead.

* Mailspring now uses `Prettier` — before submitting pull requests, ensure `npm run lint` is clean, or add a Prettier plugin to your text editor. (It's awesome!)

* A plugin browser / "store" is coming soon - stay tuned!

Privacy:

* Mailspring does not send your email credentials to the cloud. Features like Snooze, Send Later, and Send Reminders now run on your computer. Future versions may re-introduce the option to run these features in the cloud.
