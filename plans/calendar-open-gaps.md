# Calendar: open gaps

What the calendar still lacks, checked against the code on 2026-10-16. Create, edit, delete, drag
and keyboard moves, day/week/month/agenda views, search, RSVP (including propose-a-new-time and
accepting a counter; see Bugs), and Google plus generic CalDAV sync all work. Verify an item against
the code before planning from it, and delete it here when it lands.

## Bugs

- **Deleting a whole series as a guest tells nobody.** `_deleteEntireEvent` queues a
  `DestroyEventTask`, and Google drops a guest's deleted copy without telling the organizer. Deleting
  one occurrence does reach them, because Google turns the EXDATE into a decline. Checked live
  2026-10-15 with an Outlook.com organizer.
- **Accepting an invitation that isn't on a Google calendar yet doesn't add it.** When Google hasn't
  put the invitation on the calendar itself (its "Add invitations to my calendar" setting, or an
  invitation Gmail filed as spam), Yes or Maybe in the invitation header queues
  `SyncbackEventTask.forCreating`, and Google answers the PUT with an empty 400. The emailed REPLY
  still goes out. Once the create works, check whether Google also emails the organizer about it; if
  so, that path needs the same skip as an update (`EventRSVPTask.calendarWriteSendsReply`). Seen live
  2026-11-03.
- **Times are always 12-hour.** `formatTime` in `calendar-event-popover.tsx`, `formatEventTimeRange`
  (`calendar-helpers.tsx`), the drag tooltip (`calendar-drag-utils.ts`) and search results
  (`event-search-bar.tsx`) hardcode AM/PM, so 24-hour locales see "10 AM". `formatShortTime` already
  follows the locale.
- **A moved occurrence can be drawn at its old time.** Every Event row of a series holds the whole
  resource, and the rows can disagree. When the series' main row is older than an exception's row,
  `occurrencesForEvents` expands the main row, and its standalone-exception branch reads the
  exception row's first VEVENT, which is the master. Seen in 2 of 56 exception rows in one real
  calendar.
- **A rejected save stays on screen.** When the server refuses a save without changing its own copy
  (Google's 409 for a SEQUENCE lower than its own, or a 400 or 403), the local row keeps the rejected
  change, and a resync doesn't correct it because the row's etag still matches the server's. An etag
  conflict (412) does correct itself: the server's etag has changed, so the next sync re-reads it.

## Saved nowhere, though the editor shows it

- **Reminders.** The event editor's Alert control (`alert-selector.tsx`) is editor state only: no
  VALARM is written and nothing schedules a notification.

## Partial

- **Repeat rules.** `repeat-selector.tsx` offers none, daily, weekly, monthly and yearly. There is no
  interval, weekday choice, count or end date, and no custom rule.
- **Sending invitations.** Attendees and the organizer are written into the event, but neither the app
  nor the sync engine sends an iMIP REQUEST or CANCEL; the engine sends only REPLY and COUNTER
  (`TaskProcessor.cpp`). Guests hear about a meeting only if the CalDAV server does the scheduling.
  Google does: invitations, updates and cancellations, for a whole series or one occurrence, all
  reached an Outlook.com guest (checked live 2026-10-05 to 2026-10-15). Other servers are unverified.
  Whether guests on clients other than Google and Outlook.com apply an update sent at an unchanged
  SEQUENCE, as undo and redo send, is untested.
- **Keyboard.** Enter does not open the selected event, and New Event (`core:add-item`) has no default
  key. On hold until the event card moves into a sidebar.
- **Notes formatting.** The event panel shows a description as plain text:
  `extractNotesFromDescription` (`calendar-helpers.tsx`) flattens the HTML Google writes (bold,
  lists, links) into lines, and only bare URLs come back as links. Showing the formatting, from
  sanitized HTML or from Markdown in a plain-text description, is open.
- **CalDAV server address.** Hosts are discovered through the identity server
  (`DAVWorker.cpp`, `resolve-dav-hosts`); there is no setting to enter one by hand.

## Sync engine

- **Microsoft calendars.** Outlook.com and Office 365 calendars sync and save edits through Microsoft
  Graph, but answering an invitation does not go through Graph yet.

## Not built

Year view, creating calendars, sharing, ICS import/export, tasks (see `caldav-10-vtodo-support.md`),
free/busy lookup, working hours, a second timezone column, printing.
