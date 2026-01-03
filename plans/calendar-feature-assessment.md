# Calendar Feature Assessment

**Date:** January 2026
**Status:** Read-only Preview
**Completeness:** ~25-30%

---

## Executive Summary

The Mailspring calendar is currently a **read-only preview** with a notice stating: *"Calendar is launching later this year! This preview is read-only and only supports Google calendar."*

The calendar functions well as a viewer with excellent email RSVP integration, but lacks all write capabilities. The architecture and data models are solid - the main gap is the write path and additional UI views.

---

## Features Currently Implemented

### Core Calendar Views
- [x] Week view with timed events and all-day events section
- [x] Mini month sidebar for date picker navigation
- [x] Calendar source list with visibility toggles per calendar
- [x] Date navigation (Previous/Next week, "Today" button)
- [x] Current time indicator (red line, updates every 60 seconds)

### Event Display
- [x] Event rendering with color-coding by calendar
- [x] Overlap calculation for concurrent events (side-by-side display)
- [x] Event selection (single and multi-select with Shift/Cmd keys)
- [x] Double-click to open event details popover

### Email Integration (Strong)
- [x] Parse ICS attachments from meeting invitation emails
- [x] Display event details in email headers
- [x] RSVP buttons (Accept/Tentative/Decline) - fully functional
- [x] Track and display RSVP status in message metadata
- [x] Organizer response detection
- [x] Automatic hiding of redundant ICS attachments

### Recurrence Support
- [x] Recurring event expansion using `ical-expander`
- [x] Individual occurrence display within time ranges

---

## Features Partially Implemented (Stubbed)

| Feature | Current State | File Location |
|---------|---------------|---------------|
| Event Editing UI | Form exists but save is disabled | `app/internal_packages/main-calendar/lib/core/calendar-event-popover.tsx` |
| Quick Event Creation | Natural language parsing works, persistence commented out | `app/internal_packages/main-calendar/lib/quick-event-popover.tsx` |
| Month View | Header only; navigation logs to console, no grid | `app/internal_packages/main-calendar/lib/core/month-view.tsx` |
| Event Search | Component returns empty `<span />` | `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx` |

---

## Features Not Implemented

### Critical Missing Features

| Feature | Priority | Notes |
|---------|----------|-------|
| Event Creation | Critical | `SyncbackEventTask` throws "Unimplemented!" |
| Event Modification | Critical | Edit UI exists but changes don't persist |
| Event Deletion | Critical | UI has delete button but no task to execute |
| Month View | High | No functional calendar grid |
| Day View | Medium | Defined in enum but not implemented |
| Event Search | Medium | Completely stubbed out |
| Multi-Provider Support | High | Only Google Calendar currently |

### Features Users Would Expect

| Feature | Status | Priority |
|---------|--------|----------|
| Create new events | Not implemented | Critical |
| Drag-and-drop event moving | Not implemented | High |
| Drag to resize event duration | Not implemented | High |
| Recurring event creation | Not implemented | High |
| Reminders/notifications | Not implemented | High |
| Agenda/list view | Not implemented | Medium |
| Year view | Not implemented | Low |
| Calendar sharing | Not implemented | Medium |
| Create new calendars | Not implemented | Medium |
| Import/export ICS files | Not implemented | Medium |
| Integration with tasks/todos | Not implemented | Low |
| Availability/free-busy view | Not implemented | Low |
| Event invitations (sending) | Not implemented | High |
| Keyboard shortcuts | Not implemented | Medium |
| Multiple timezone display | Not implemented | Low |
| Working hours configuration | Not implemented | Low |
| Print calendar | Not implemented | Low |

---

## Key Technical Blockers

### 1. SyncbackEventTask (Critical)

**File:** `app/src/flux/tasks/syncback-event-task.ts`

This is the primary blocker for all write operations. The task currently throws an error:

```typescript
performRemote() {
  return Promise.reject(new Error('Unimplemented!'));
}
```

Until this is implemented, no event creation, modification, or deletion can occur.

### 2. Sync Engine Calendar Write Support

The C++ Mailspring-Sync engine would need to support calendar write operations, handling the JSON task messages from Electron and syncing changes to remote calendar APIs.

### 3. Provider API Integration

OAuth and API integration for calendar providers beyond read-only access:
- Google Calendar API (write scopes)
- Microsoft Outlook/Exchange
- Apple iCloud
- CalDAV generic support

---

## Architecture Overview

### Code Locations

```
/app/internal_packages/main-calendar/
├── lib/
│   ├── main.tsx                    # Entry point & registration
│   ├── quick-event-button.tsx      # "+" button component
│   ├── quick-event-popover.tsx     # Natural language event creation (disabled)
│   └── core/
│       ├── mailspring-calendar.tsx # Main container component
│       ├── week-view.tsx           # Week view (functional)
│       ├── month-view.tsx          # Month view (stub)
│       ├── calendar-event.tsx      # Event rendering
│       ├── calendar-event-popover.tsx # Event details/edit form
│       ├── calendar-data-source.ts # RxJS observable data source
│       ├── event-search-bar.tsx    # Search (stubbed)
│       └── ...

/app/internal_packages/events/
├── lib/
│   ├── main.tsx                    # Email integration entry
│   └── event-header.tsx            # RSVP UI for emails

/app/src/
├── flux/
│   ├── models/
│   │   ├── calendar.ts             # Calendar model
│   │   └── event.ts                # Event model
│   └── tasks/
│       ├── event-rsvp-task.ts      # RSVP handling (implemented)
│       └── syncback-event-task.ts  # Event sync (NOT implemented)
├── calendar-utils.ts               # ICS parsing utilities
```

### Data Models

**Event Model** stores raw ICS data and parses on-demand:
- `calendarId`: Reference to parent calendar
- `ics`: Full ICS data as JSON string
- `icsuid`: Unique ICS event identifier
- `recurrenceStart/End`: Calculated timestamps
- `title`, `participants`: Searchable fields

**Calendar Model**:
- `name`, `description`, `readOnly`

### Dependencies

- `ical-expander` (^3.2.0) - Recurring event expansion
- `ical.js` (^2.2.1) - ICS format parsing
- `moment` / `moment-timezone` - Date/time handling
- `chrono-node` (^2.9.0) - Natural language date parsing

---

## Completeness Breakdown

| Category | Percentage | Description |
|----------|------------|-------------|
| Read-only viewing | ~90% | Week view, event display, calendar toggles |
| Email integration | ~95% | RSVP, event parsing, header display |
| Write operations | ~5% | UI exists but backend not implemented |
| Additional views | ~10% | Month/day/agenda views missing |
| Advanced features | ~0% | Drag-drop, reminders, sharing, etc. |
| **Overall** | **~25-30%** | Functional viewer, no write capability |

---

## Detailed To-Do List

### Phase 1: Enable Write Operations (Critical)

- [ ] **Implement SyncbackEventTask**
  - File: `app/src/flux/tasks/syncback-event-task.ts`
  - Handle event creation, modification, and deletion
  - Communicate with sync engine via stdin JSON messages

- [ ] **Update sync engine for calendar writes**
  - Add calendar sync write handlers in Mailspring-Sync (C++)
  - Implement Google Calendar API write operations

- [ ] **Enable event creation flow**
  - File: `app/internal_packages/main-calendar/lib/quick-event-popover.tsx`
  - Uncomment and fix the `DatabaseStore.inTransaction()` code
  - Connect to working SyncbackEventTask

- [ ] **Enable event editing**
  - File: `app/internal_packages/main-calendar/lib/core/calendar-event-popover.tsx`
  - Fix TODO comments around save functionality
  - Wire up to SyncbackEventTask

- [ ] **Enable event deletion**
  - Add delete task or extend SyncbackEventTask with delete operation
  - Wire delete button in popover to task

### Phase 2: Complete Core Views (High Priority)

- [ ] **Implement Month View**
  - File: `app/internal_packages/main-calendar/lib/core/month-view.tsx`
  - Build calendar grid with day cells
  - Display events within day cells (possibly truncated)
  - Handle navigation (previous/next month)
  - Click day to navigate to week view

- [ ] **Implement Day View**
  - Create new `day-view.tsx` component
  - Similar to week view but single column
  - More detailed event display

- [ ] **Implement Event Search**
  - File: `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx`
  - Query DatabaseStore for events matching search term
  - Display results in dropdown or separate view

### Phase 3: Enhanced Interactions (High Priority)

- [ ] **Drag-and-drop event moving**
  - Add drag handlers to CalendarEvent component
  - Calculate new time based on drop position
  - Trigger SyncbackEventTask with updated times

- [ ] **Drag to resize event duration**
  - Add resize handles to event edges
  - Update end time on drag

- [ ] **Click-and-drag to create events**
  - Track mousedown/mouseup in time grid
  - Create new event spanning selected time range

- [ ] **Keyboard shortcuts**
  - Arrow keys for date navigation
  - Enter to open selected event
  - Delete/Backspace to delete event
  - N for new event

### Phase 4: Multi-Provider Support (High Priority)

- [ ] **Microsoft Outlook/Exchange support**
  - OAuth flow for Microsoft accounts
  - Microsoft Graph API integration for calendar

- [ ] **Apple iCloud support**
  - Authentication handling
  - CalDAV or iCloud API integration

- [ ] **Generic CalDAV support**
  - CalDAV protocol implementation
  - Server URL configuration

### Phase 5: Notifications & Reminders (Medium Priority)

- [ ] **Event reminders**
  - Parse VALARM components from ICS
  - Schedule local notifications
  - Reminder preferences UI

- [ ] **Desktop notifications**
  - Integrate with Electron notification API
  - Configurable notification timing

### Phase 6: Additional Views (Medium Priority)

- [ ] **Agenda/List view**
  - Chronological list of upcoming events
  - Grouped by day

- [ ] **Year view**
  - 12-month overview
  - Heat map or dot indicators for busy days

### Phase 7: Advanced Features (Lower Priority)

- [ ] **Create new calendars**
  - UI for calendar creation
  - Sync to provider

- [ ] **Calendar sharing**
  - Share calendar with other users
  - Manage permissions

- [ ] **Import/export ICS files**
  - Import .ics files to calendar
  - Export calendar or events to .ics

- [ ] **Recurring event creation**
  - UI for recurrence rules (daily, weekly, monthly, etc.)
  - RRULE generation

- [ ] **Event invitations (sending)**
  - Compose meeting invitation emails
  - Generate ICS with attendees

- [ ] **Multiple timezone display**
  - Show secondary timezone in week view
  - Event time conversion

- [ ] **Working hours configuration**
  - Define working hours per day
  - Visual distinction in calendar grid

- [ ] **Free/busy availability**
  - Query attendee availability
  - Suggest meeting times

- [ ] **Print calendar**
  - Print-friendly view generation
  - PDF export option

---

## Existing TODOs in Codebase

These TODO comments exist in the source code and should be addressed:

### calendar-event-popover.tsx (lines 74-81)
```typescript
// TODO: this component shouldn't save the event here, we should expose an
// `onEditEvent` or similar callback

// TODO: How will this affect the event if the when object was originally
//   a datespan, with start_date and end_date attributes?

// TODO: where's the best place to put this?
```

### event-search-bar.tsx (line 75)
```typescript
// TODO BG
return <span />;  // Entire search feature disabled
```

### quick-event-popover.tsx (lines 75-81)
```typescript
// todo bg
// return DatabaseStore.inTransaction((t) => {
//   return t.persistModel(event)
// }).then(() => {
//   const task = new SyncbackEventTask(event.id);
//   Actions.queueTask(task);
// })
```

---

## Recommendations

1. **Start with SyncbackEventTask** - This unblocks all write operations and is the single most impactful change.

2. **Focus on creation before editing** - Users expect to create events; editing existing events is secondary.

3. **Month view before day view** - Month view is more commonly expected in calendar applications.

4. **Google Calendar first** - Complete Google integration before adding other providers.

5. **Consider removing "preview" notice** - Once basic write operations work, the calendar becomes genuinely useful.

---

## References

- Main calendar package: `app/internal_packages/main-calendar/`
- Events email integration: `app/internal_packages/events/`
- Core models: `app/src/flux/models/event.ts`, `app/src/flux/models/calendar.ts`
- Sync task: `app/src/flux/tasks/syncback-event-task.ts`
- ICS utilities: `app/src/calendar-utils.ts`
