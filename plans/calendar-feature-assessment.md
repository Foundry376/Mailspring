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

## Architecture Overview for Implementers

This section provides detailed guidance for agents and developers implementing new calendar features.

### Directory Structure

```
app/
├── src/                                    # Core application source
│   ├── flux/
│   │   ├── models/
│   │   │   ├── calendar.ts                 # Calendar database model
│   │   │   └── event.ts                    # Event database model
│   │   ├── tasks/
│   │   │   ├── event-rsvp-task.ts          # RSVP task (working example)
│   │   │   └── syncback-event-task.ts      # Event sync task (UNIMPLEMENTED)
│   │   ├── stores/
│   │   │   └── database-store.ts           # Read-only database access
│   │   └── actions.ts                      # Application-wide actions
│   ├── calendar-utils.ts                   # ICS parsing utilities
│   └── mailsync-bridge.ts                  # Sync engine communication
│
├── internal_packages/
│   ├── main-calendar/                      # Main calendar UI package
│   │   ├── package.json                    # Plugin manifest (windowTypes: calendar)
│   │   ├── lib/
│   │   │   ├── main.tsx                    # Plugin entry point
│   │   │   ├── quick-event-button.tsx      # Toolbar "+" button
│   │   │   ├── quick-event-popover.tsx     # Natural language event creation
│   │   │   └── core/
│   │   │       ├── mailspring-calendar.tsx # Root calendar component
│   │   │       ├── calendar-data-source.ts # RxJS data observable
│   │   │       ├── calendar-constants.ts   # Enums (CalendarView)
│   │   │       ├── calendar-helpers.tsx    # Color calculation utilities
│   │   │       │
│   │   │       ├── week-view.tsx           # Week view (FUNCTIONAL)
│   │   │       ├── week-view-helpers.ts    # Overlap calculation, time ticks
│   │   │       ├── week-view-event-column.tsx  # Single day column
│   │   │       ├── week-view-all-day-events.tsx # All-day events bar
│   │   │       │
│   │   │       ├── month-view.tsx          # Month view (STUB)
│   │   │       │
│   │   │       ├── calendar-event.tsx      # Event box component
│   │   │       ├── calendar-event-container.tsx # Mouse event wrapper
│   │   │       ├── calendar-event-popover.tsx   # Event details/edit popover
│   │   │       │
│   │   │       ├── header-controls.tsx     # Navigation & view buttons
│   │   │       ├── calendar-source-list.tsx # Calendar visibility toggles
│   │   │       ├── event-search-bar.tsx    # Search (STUBBED)
│   │   │       ├── current-time-indicator.tsx # Red "now" line
│   │   │       ├── event-grid-background.tsx  # Canvas grid lines
│   │   │       ├── event-timerange-picker.tsx # Date/time input
│   │   │       └── event-attendees-input.tsx  # Attendee management
│   │   │
│   │   └── styles/
│   │       ├── main-calendar.less
│   │       └── nylas-calendar.less
│   │
│   └── events/                             # Email RSVP integration
│       ├── package.json
│       └── lib/
│           ├── main.tsx                    # Extension registration
│           └── event-header.tsx            # RSVP buttons in email
```

### Plugin Architecture

#### Entry Point Pattern (`main.tsx`)

Every internal package follows this pattern:

```typescript
// app/internal_packages/main-calendar/lib/main.tsx
import { WorkspaceStore, ComponentRegistry } from 'mailspring-exports';
import { MailspringCalendar } from './core/mailspring-calendar';

export function activate() {
  // Register components at specific UI locations
  ComponentRegistry.register(MailspringCalendar, {
    location: WorkspaceStore.Location.Center,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(MailspringCalendar);
}
```

**Key registration locations:**
- `WorkspaceStore.Location.Center` - Main content area
- `WorkspaceStore.Location.Center.Toolbar` - Toolbar buttons
- `WorkspaceStore.Sheet.Main.Header` - Header area
- `{ role: 'message:BodyHeader' }` - Inside email message view
- `{ role: 'Calendar:Event' }` - Injected into calendar events
- `{ role: 'Calendar:Week:Banner' }` - Banner above week view

#### Package Manifest (`package.json`)

```json
{
  "name": "main-calendar",
  "main": "./lib/main",
  "windowTypes": {
    "calendar": true    // Loads only in calendar window type
  }
}
```

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      React Components                                │
│  (calendar-event-popover.tsx, quick-event-popover.tsx, etc.)        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Actions.queueTask()                            │
│                    (app/src/flux/actions.ts)                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MailsyncBridge                               │
│                   (app/src/mailsync-bridge.ts)                       │
│           Serializes task → JSON → stdin to sync engine              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Mailspring-Sync (C++)                          │
│              External process per account                            │
│         Executes tasks, syncs with remote APIs                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    stdout (JSON deltas)                              │
│               { type: 'persist', objectClass: 'Event', ... }        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DatabaseStore.trigger()                        │
│                 Notifies all QuerySubscriptions                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Rx.Observable.fromQuery()                         │
│              CalendarDataSource.buildObservable()                    │
│                 Reactive UI updates                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      React Re-render                                 │
│                  (WeekView, CalendarEvent, etc.)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Models

#### Event Model (`app/src/flux/models/event.ts`)

```typescript
class Event extends Model {
  static attributes = {
    calendarId: Attributes.String({ queryable: true }),
    ics: Attributes.String({}),           // Full ICS data stored as string
    icsuid: Attributes.String({ queryable: true }),
    recurrenceStart: Attributes.Number({ queryable: true }),  // Unix timestamp
    recurrenceEnd: Attributes.Number({ queryable: true }),    // Unix timestamp
  };

  static searchable = true;
  static searchFields = ['title', 'description', 'location', 'participants'];
}
```

**Important:** The Event model stores raw ICS data in the `ics` field. Parsed event details are extracted at runtime using `ical-expander`.

#### Calendar Model (`app/src/flux/models/calendar.ts`)

```typescript
class Calendar extends Model {
  static attributes = {
    name: Attributes.String({}),
    description: Attributes.String({}),
    readOnly: Attributes.Boolean({}),
  };
}
```

#### EventOccurrence Interface (`calendar-data-source.ts`)

Runtime representation of a single event occurrence (handles recurring events):

```typescript
interface EventOccurrence {
  start: number;         // Unix timestamp
  end: number;           // Unix timestamp
  id: string;            // "{eventId}-e{occurrenceIndex}"
  accountId: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  isAllDay: boolean;
  organizer: { email: string } | null;
  attendees: { email: string; name: string }[];
}
```

### Reactive Data Pattern

#### CalendarDataSource (`calendar-data-source.ts`)

```typescript
class CalendarDataSource {
  buildObservable({ startUnix, endUnix, disabledCalendars }) {
    // Query database for events in time range
    const query = DatabaseStore.findAll<Event>(Event).where(matcher);

    // Create reactive observable
    this.observable = Rx.Observable.fromQuery(query)
      .flatMapLatest(results =>
        Rx.Observable.from([{
          events: occurrencesForEvents(results, { startUnix, endUnix })
        }])
      );
    return this.observable;
  }
}
```

**Usage in components:**

```typescript
// In WeekView.tsx
componentDidMount() {
  this._sub = this.props.dataSource
    .buildObservable({
      disabledCalendars: this.props.disabledCalendars,
      startUnix: bufferedStart.unix(),
      endUnix: bufferedEnd.unix(),
    })
    .subscribe(state => this.setState(state));
}
```

### Task System

#### Working Example: EventRSVPTask (`app/src/flux/tasks/event-rsvp-task.ts`)

```typescript
export class EventRSVPTask extends Task {
  static attributes = {
    ...Task.attributes,
    ics: Attributes.String({ modelKey: 'ics' }),
    icsRSVPStatus: Attributes.String({ modelKey: 'icsRSVPStatus' }),
    // ... other attributes
  };

  // Factory method for creating properly configured task
  static forReplying({ accountId, to, messageId, icsOriginalData, icsRSVPStatus }) {
    // Parse ICS, modify participant status, create reply
    const { event, root } = CalendarUtils.parseICSString(icsOriginalData);
    // ... modify ICS ...
    return new EventRSVPTask({ ... });
  }

  label() {
    return localized('Sending RSVP');
  }

  // Called when sync engine reports success
  async onSuccess() {
    // Update local metadata
  }
}
```

#### Unimplemented: SyncbackEventTask (`app/src/flux/tasks/syncback-event-task.ts`)

```typescript
// CURRENT STATE - needs implementation
export class SyncbackEventTask {
  constructor() {
    throw new Error('Unimplemented!');
  }
}
```

**To implement, follow EventRSVPTask pattern:**
1. Extend `Task` base class
2. Define static `attributes` for serialization
3. Implement `label()` for UI feedback
4. Implement `onSuccess()` / `onError()` callbacks
5. Sync engine must handle the task type

### ICS Parsing Utilities (`app/src/calendar-utils.ts`)

```typescript
// Parse ICS string into ical.js objects
parseICSString(ics: string): { root: ICALComponent, event: ICALEvent }

// Extract email from mailto: URI
emailFromParticipantURI(uri: string): string | null

// Get attendee info from ICS event
cleanParticipants(icsEvent: ICALEvent): ICSParticipant[]

// Find current user in attendee list
selfParticipant(icsEvent: ICALEvent, accountId: string): ICSParticipant | undefined
```

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `ical.js` | ^2.2.1 | Parse ICS format (RFC 5545) |
| `ical-expander` | ^3.2.0 | Expand recurring events |
| `moment` | ^2.30.1 | Date/time manipulation |
| `moment-timezone` | ^0.6.0 | Timezone handling |
| `chrono-node` | ^2.9.0 | Natural language date parsing |
| `windows-iana` | ^4.2.1 | Convert Windows timezone names |

### Where to Add New Features

| Feature | Location | Notes |
|---------|----------|-------|
| **New calendar view (e.g., day view)** | `app/internal_packages/main-calendar/lib/core/day-view.tsx` | Follow `week-view.tsx` pattern; register in `calendar-constants.ts` and `mailspring-calendar.tsx` |
| **Event write operations** | `app/src/flux/tasks/syncback-event-task.ts` | Implement Task class; requires sync engine support |
| **New event UI component** | `app/internal_packages/main-calendar/lib/core/` | Add to `core/` directory; import in parent component |
| **Event search** | `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx` | Currently stubbed; implement search logic |
| **Calendar model changes** | `app/src/flux/models/calendar.ts` | Database schema changes require sync engine updates |
| **ICS parsing enhancements** | `app/src/calendar-utils.ts` | Shared utility functions |
| **New email integration** | `app/internal_packages/events/lib/` | Follow `event-header.tsx` pattern |
| **Keyboard shortcuts** | Register in `KeyCommandsRegion` in `mailspring-calendar.tsx` | Define handlers in the component |
| **Drag-and-drop** | `app/internal_packages/main-calendar/lib/core/calendar-event.tsx` | Add drag handlers to event component |
| **New toolbar button** | `app/internal_packages/main-calendar/lib/` | Register at `WorkspaceStore.Location.Center.Toolbar` |
| **Styles** | `app/internal_packages/main-calendar/styles/` | Use LESS; follows BEM-like naming |

### Component Extension Points

The calendar provides injection points for plugins:

```typescript
// In week-view.tsx - Banner above week view
<InjectedComponentSet matching={{ role: 'Calendar:Week:Banner' }} />

// In calendar-event.tsx - Injected into event boxes
<InjectedComponentSet
  matching={{ role: 'Calendar:Event' }}
  exposedProps={{ event: event }}
/>
```

### Implementing a New View (Example: Day View)

1. **Create the component:**
   ```typescript
   // app/internal_packages/main-calendar/lib/core/day-view.tsx
   export class DayView extends React.Component<MailspringCalendarViewProps, State> {
     // Follow week-view.tsx patterns for:
     // - Subscribing to CalendarDataSource
     // - Rendering events
     // - Handling navigation
   }
   ```

2. **Register the view:**
   ```typescript
   // In calendar-constants.ts
   export enum CalendarView {
     WEEK = 'week',
     MONTH = 'month',
     DAY = 'day',  // Add new view
   }

   // In mailspring-calendar.tsx
   const VIEWS = {
     [CalendarView.WEEK]: WeekView,
     [CalendarView.MONTH]: MonthView,
     [CalendarView.DAY]: DayView,  // Register component
   };
   ```

3. **Add navigation button:**
   ```typescript
   // In header-controls.tsx
   // Add button for switching to day view
   ```

### Implementing Event Write Operations

1. **Implement SyncbackEventTask:**
   ```typescript
   // app/src/flux/tasks/syncback-event-task.ts
   export class SyncbackEventTask extends Task {
     static attributes = {
       ...Task.attributes,
       eventId: Attributes.String({ modelKey: 'eventId' }),
       operation: Attributes.String({ modelKey: 'operation' }), // 'create'|'update'|'delete'
       icsData: Attributes.String({ modelKey: 'icsData' }),
     };

     label() { return localized('Saving event...'); }

     async onSuccess() {
       // Handle successful sync
     }
   }
   ```

2. **Enable in quick-event-popover.tsx:**
   ```typescript
   // Uncomment the commented code:
   return DatabaseStore.inTransaction((t) => {
     return t.persistModel(event);
   }).then(() => {
     const task = new SyncbackEventTask({ eventId: event.id, operation: 'create' });
     Actions.queueTask(task);
   });
   ```

3. **Sync engine implementation required** - The C++ sync engine must handle the task message and execute the calendar API calls.

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
