# Calendar ICS Implementation - Remaining Work Plan

This document outlines the remaining issues identified during the code review and exploration, prioritized by impact and complexity.

## Summary of Completed Work

- ✅ Created `ics-event-helpers.ts` with ICS manipulation functions
- ✅ Created `recurring-event-dialog.ts` for "this occurrence or all" prompts
- ✅ Updated `mailspring-calendar.tsx` drag persistence to use ICS helpers
- ✅ Updated `calendar-event-popover.tsx` save to use ICS helpers and recurring dialog
- ✅ Updated keyboard event movement to use ICS helpers
- ✅ Exported `ICSEventHelpers` from `mailspring-exports`

---

## Phase 1: High Priority Issues

### 1.1 Add Recurring Event Handling to Deletion

**Issue**: `_onDeleteSelectedEvents` in `mailspring-calendar.tsx:230-254` doesn't check for recurring events or show the dialog.

**Current behavior**: Deletes the event directly without asking about series vs occurrence.

**Files to modify**:
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx`

**Implementation**:
```typescript
_onDeleteSelectedEvents = async () => {
  if (this.state.selectedEvents.length === 0) {
    return;
  }

  // For each selected event, check if recurring
  for (const occurrence of this.state.selectedEvents) {
    const eventId = parseEventIdFromOccurrence(occurrence.id);
    const event = await DatabaseStore.find<Event>(Event, eventId);

    if (!event) continue;

    const isRecurring = ICSEventHelpers.isRecurringEvent(event.ics);

    if (isRecurring && !event.isRecurrenceException()) {
      const choice = await showRecurringEventDialog('delete', occurrence.title);

      if (choice === 'cancel') {
        continue;
      }

      if (choice === 'this-occurrence') {
        // Add EXDATE to master and create cancelled exception
        // Or just add EXDATE if server handles it
      } else {
        // Delete entire series
      }
    } else {
      // Show standard delete confirmation
      // Delete single event
    }
  }
};
```

**Complexity**: Medium
**Estimated scope**: ~50 lines of code changes

---

### 1.2 Add ICS Generation to Quick Event Creation

**Issue**: `quick-event-popover.tsx:71-77` creates Event objects without ICS data.

**Current code**:
```typescript
const event = new Event({
  calendarId: editableCals[0].id,
  accountId: editableCals[0].accountId,
  recurrenceStart: start.unix(),
  recurrenceEnd: end.unix(),
});
event.title = leftoverText;
```

**Files to modify**:
- `app/internal_packages/main-calendar/lib/quick-event-popover.tsx`

**Implementation**:
```typescript
import { ICSEventHelpers } from 'mailspring-exports';

// In createEvent method:
const ics = ICSEventHelpers.createICSString({
  summary: leftoverText,
  start: start.toDate(),
  end: end.toDate(),
  isAllDay: false,
});

const event = new Event({
  calendarId: editableCals[0].id,
  accountId: editableCals[0].accountId,
  ics: ics,
  icsuid: // extract from generated ICS or generate separately
  recurrenceStart: start.unix(),
  recurrenceEnd: end.unix(),
});
event.title = leftoverText;
```

**Complexity**: Low
**Estimated scope**: ~15 lines of code changes

---

### 1.3 Fix Incomplete Undo for Recurrence Exceptions

**Issue**: When undoing a "this occurrence only" change, the exception event that was created is never deleted.

**Current behavior** (`mailspring-calendar.tsx:682-690`):
```typescript
// Register undo (note: undoing exception creation is complex, we just restore master)
this._registerUndoAction(
  masterEvent,
  originalStart,
  originalEnd,
  originalIcs,
  newStart,
  newEnd
);
```

**Options**:

**Option A**: Full undo support (recommended)
- Store the exception event ID when creating it
- On undo: restore master ICS AND delete the exception event
- Requires a new `DestroyEventTask` to be queued on undo

**Option B**: Disable undo for this operation
- Don't register undo action for "this occurrence only" changes
- Show a warning toast: "This action cannot be undone"

**Option C**: Partial undo (current)
- Keep current behavior but improve the comment/documentation
- Users can manually delete the orphan exception if needed

**Files to modify**:
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx`
- Potentially `calendar-event-popover.tsx` for consistency

**Implementation for Option A**:
```typescript
async _persistSingleOccurrenceChange(...) {
  // ... existing code to create exception ...

  // Store exception ID for potential undo
  const exceptionId = exceptionEvent.id; // or generate one

  // Register undo that cleans up both
  this._registerExceptionUndoAction(
    masterEvent,
    exceptionId,
    originalIcs
  );
}

_registerExceptionUndoAction(
  masterEvent: Event,
  exceptionId: string,
  originalMasterIcs: string
) {
  const undoBlock = {
    description: localized('Move event occurrence'),
    do: () => {},
    undo: async () => {
      // Restore master
      const master = await DatabaseStore.find<Event>(Event, masterEvent.id);
      if (master) {
        master.ics = originalMasterIcs;
        Actions.queueTask(SyncbackEventTask.forUpdating({ event: master }));
      }
      // Delete exception
      const exception = await DatabaseStore.find<Event>(Event, exceptionId);
      if (exception) {
        Actions.queueTask(new DestroyEventTask({
          eventId: exceptionId,
          accountId: exception.accountId,
        }));
      }
    },
    redo: async () => {
      // Re-create the exception... this is complex
      // May need to store more state
    },
  };
  (UndoRedoStore as any)._onQueueBlock(undoBlock);
}
```

**Complexity**: High (for full undo support)
**Estimated scope**: ~80 lines of code changes

---

## Phase 2: Medium Priority Issues

### 2.1 Fix Deprecated `componentWillMount` Lifecycle

**Issue**: `mailspring-calendar.tsx:130` uses deprecated React lifecycle method.

**Current code**:
```typescript
componentWillMount() {
  this._disposable = this._subscribeToCalendars();
  this._unlisten = Actions.focusCalendarEvent.listen(this._focusEvent);
}
```

**Fix**: Move to constructor or componentDidMount
```typescript
constructor(props) {
  super(props);
  this.state = { ... };
  // Move subscriptions here or to componentDidMount
}

componentDidMount() {
  this._disposable = this._subscribeToCalendars();
  this._unlisten = Actions.focusCalendarEvent.listen(this._focusEvent);
}
```

**Complexity**: Low
**Estimated scope**: ~10 lines moved

---

### 2.2 Improve Timezone Handling in ICS Helpers

**Issue**: When updating event times, timezone information may be lost during JavaScript Date conversion.

**Current code** (`ics-event-helpers.ts:200-214`):
```typescript
const originalTz = event.startDate?.zone;
const newStart = ical.Time.fromJSDate(startDate, false);
if (originalTz && originalTz.tzid && originalTz.tzid !== 'UTC') {
  newStart.zone = originalTz;
}
```

**Problem**: `fromJSDate` interprets the Date in local time, then we set the zone after. This may not correctly convert the time.

**Better approach**:
```typescript
// Create time in the original timezone directly
const newStart = new ical.Time({
  year: startDate.getFullYear(),
  month: startDate.getMonth() + 1,
  day: startDate.getDate(),
  hour: startDate.getHours(),
  minute: startDate.getMinutes(),
  second: startDate.getSeconds(),
}, originalTz);
```

**Complexity**: Medium
**Estimated scope**: ~30 lines of code changes

---

### 2.3 Handle Race Condition During Async Dialog

**Issue**: While the recurring event dialog is shown, the event could be modified by a sync operation.

**Current flow**:
1. User drags event
2. Fetch event from database
3. Show dialog (user thinking...)
4. Meanwhile, sync updates the event
5. User clicks "All occurrences"
6. We overwrite sync changes

**Fix**: Re-fetch event after dialog closes
```typescript
if (isRecurring && !event.isRecurrenceException()) {
  const choice = await showRecurringEventDialog(...);

  if (choice === 'cancel') return;

  // Re-fetch to get latest version
  const freshEvent = await DatabaseStore.find<Event>(Event, eventId);
  if (!freshEvent) {
    console.error('Event was deleted during edit');
    return;
  }

  // Check if ICS changed
  if (freshEvent.ics !== event.ics) {
    console.warn('Event was modified during edit, using latest version');
    event = freshEvent;
  }

  // Continue with save...
}
```

**Complexity**: Low
**Estimated scope**: ~15 lines of code changes per location (drag + popover)

---

## Phase 3: Lower Priority Issues

### 3.1 Add Timestamp Validation to ICS Helpers

**Location**: `ics-event-helpers.ts:updateEventTimes()`

```typescript
export function updateEventTimes(ics: string, options: UpdateTimesOptions): string {
  // Add validation
  if (options.end <= options.start) {
    throw new Error('Event end time must be after start time');
  }
  if (options.start < 0 || options.end < 0) {
    throw new Error('Invalid timestamp: must be positive');
  }
  // ... rest of function
}
```

**Complexity**: Low

---

### 3.2 Add Null Check for VEVENT Component

**Location**: `ics-event-helpers.ts` (multiple functions)

```typescript
const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
if (!vevent) {
  throw new Error('Invalid ICS: no VEVENT component found');
}
```

**Complexity**: Low

---

### 3.3 Fix All-Day Event Date Handling

**Issue**: Using UTC methods for all-day events may cause off-by-one day errors.

**Location**: `ics-event-helpers.ts:formatDateOnly()`

**Current**:
```typescript
function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  // ...
}
```

**Fix**: Use local date for all-day events
```typescript
function formatDateOnly(date: Date, useLocalTime: boolean = true): string {
  const year = useLocalTime ? date.getFullYear() : date.getUTCFullYear();
  // ...
}
```

**Complexity**: Low

---

### 3.4 Add Missing Localization Keys

**New strings that need translation**:
- "This occurrence only"
- "All occurrences"
- "Recurring Event"
- "%1$@ recurring event \"%2$@\"?"
- "This is a recurring event. Do you want to %1$@ only this occurrence, or all occurrences in the series?"

**Files to update**: Localization JSON files (location TBD based on project structure)

**Complexity**: Low (but requires coordination with i18n workflow)

---

## Recommended Order of Implementation

1. **Phase 1.2**: Quick Event Creation ICS (Low complexity, high value)
2. **Phase 1.1**: Recurring Event Deletion (Medium complexity, high value)
3. **Phase 2.1**: Fix deprecated lifecycle (Low complexity, good hygiene)
4. **Phase 2.3**: Race condition fix (Low complexity, prevents bugs)
5. **Phase 1.3**: Fix undo for exceptions (High complexity, important for UX)
6. **Phase 2.2**: Timezone handling (Medium complexity, edge case fixes)
7. **Phase 3.x**: Lower priority items as time permits

---

## Testing Checklist

For each change, verify:

- [ ] Non-recurring events: edit, drag, delete work correctly
- [ ] Recurring events: "this occurrence" creates proper exception
- [ ] Recurring events: "all occurrences" shifts entire series
- [ ] Undo/redo works for all operations
- [ ] Quick event creation generates valid ICS
- [ ] All-day events handle date boundaries correctly
- [ ] Events sync correctly to server
- [ ] Events appear correctly after sync from server
- [ ] Cancelled occurrences display as cancelled
