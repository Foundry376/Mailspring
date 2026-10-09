# Calendar: open gaps

What the calendar still lacks, checked against the code on 2026-10-07. Create, edit, delete, drag
and keyboard moves, day/week/month/agenda views, search, RSVP (including propose-a-new-time and
accepting a counter), and Google plus generic CalDAV sync all work. Verify an item against the code
before planning from it, and delete it here when it lands.

## Saved nowhere, though the editor shows it

- **Reminders.** The event editor's Alert control (`alert-selector.tsx`) is editor state only: no
  VALARM is written and nothing schedules a notification.
- **Show as busy/free.** `ShowAsSelector` is editor state only: TRANSP is never written.

## Partial

- **Repeat rules.** `repeat-selector.tsx` offers none, daily, weekly, monthly and yearly. There is no
  interval, weekday choice, count or end date, and no custom rule.
- **Sending invitations.** Attendees and the organizer are written into the event, but neither the app
  nor the sync engine sends an iMIP REQUEST or CANCEL; the engine sends only REPLY and COUNTER
  (`TaskProcessor.cpp`). Guests hear about a meeting only if the CalDAV server does the scheduling,
  which is unverified per provider.
- **Keyboard.** Enter does not open the selected event, and New Event (`core:add-item`) has no default
  key.
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

## In flight

- Drawing a new event by dragging across empty space: Foundry376/Mailspring#2943.
- The calendar moving into the main window, which removes the preview notice that still claims the
  calendar is read-only and Google-only: Foundry376/Mailspring#2946.

## Not built

Year view, creating calendars, sharing, ICS import/export, tasks (see `caldav-10-vtodo-support.md`),
free/busy lookup, working hours, a second timezone column, printing.
