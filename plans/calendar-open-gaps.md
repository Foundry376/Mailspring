# Calendar: open gaps

What the calendar still lacks, checked against the code on 2026-10-07. Create, edit, delete, drag
and keyboard moves, day/week/month/agenda views, search, RSVP (including propose-a-new-time and
accepting a counter), and Google plus generic CalDAV sync all work. Verify an item against the code
before planning from it, and delete it here when it lands.

## Before launch

Bugs to fix before the calendar is announced. The last two are borderline: rarer, but each can show
a meeting at the wrong time.

- **Deleting a whole series as a guest tells nobody.** `_deleteEntireEvent` queues a
  `DestroyEventTask`, and Google drops a guest's deleted copy without telling the organizer. Deleting
  one occurrence does reach them, because Google turns the EXDATE into a decline. Checked live
  2026-10-15 with an Outlook.com organizer.
- **Answering an invitation sends the organizer two replies.** Both answer paths,
  `respondToCalendarEvent` (`calendar-rsvp.ts`) and the invitation header (`event-header.tsx`), write
  PARTSTAT to the calendar copy and also queue an `EventRSVPTask` reply. On Google the write already
  makes Google email the organizer, so an outside organizer gets both, and a Google organizer ignores
  the emailed one. Seen live 2026-10-15.
- **Times are always 12-hour.** `formatTime` in `calendar-event-popover.tsx`, `formatEventTimeRange`
  (`calendar-helpers.tsx`), the drag tooltip (`calendar-drag-utils.ts`) and search results
  (`event-search-bar.tsx`) hardcode AM/PM, so 24-hour locales see "10 AM". `formatShortTime` already
  follows the locale.
- **New events go on an arbitrary calendar.** The editor, drag-to-create and the quick-event box all
  take the first writable calendar (`getEditableCalendars(...)[0]`), so with several accounts a
  meeting can go out from the wrong address. It should default to Mail's "Send new messages from"
  account (`core.sending.defaultAccountIdForSend`).
- **A moved occurrence can be drawn at its old time** (borderline). Every Event row of a series holds
  the whole resource, and the rows can disagree. When the series' main row is older than an
  exception's row, `occurrencesForEvents` expands the main row, and its standalone-exception branch
  reads the exception row's first VEVENT, which is the master. Seen in 2 of 56 exception rows in one
  real calendar.
- **A rejected save stays on screen** (borderline). When the server refuses a save, the local row
  keeps the rejected change, and a resync doesn't correct it because the row's etag already matches
  the server's.

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
- **CalDAV server address.** Hosts are discovered through the identity server
  (`DAVWorker.cpp`, `resolve-dav-hosts`); there is no setting to enter one by hand.

## Sync engine

- **Removed exceptions linger.** When a server re-serves a series without one of its exception VEVENTs,
  the stale exception row is never deleted: both sync paths in `DAVWorker` only upsert, and rows are
  removed only when a whole resource disappears.
- **DURATION is ignored.** An event with DURATION and no DTEND is stored as zero-length:
  icalendarlib doesn't parse DURATION and `Event::endOf` falls back to DTSTART.
- **Microsoft calendars.** Onboarding requests Graph calendar scopes, but the engine has no Graph
  calendar sync. Whether Outlook/Office 365 accounts get a CalDAV host from discovery is unverified.

## Not built

Year view, creating calendars, sharing, ICS import/export, tasks (see `caldav-10-vtodo-support.md`),
free/busy lookup, working hours, a second timezone column, printing.
