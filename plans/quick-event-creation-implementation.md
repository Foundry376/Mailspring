# Quick Event Creation Implementation

## Summary

Implemented the quick event creation functionality in `quick-event-popover.tsx` to save new events using `SyncbackEventTask` and focus the calendar on the newly created event.

## Changes Made

### 1. Created `FocusedEventInfo` Type

**File**: `app/internal_packages/main-calendar/lib/core/calendar-data-source.ts`

Added a minimal type for focusing events that only requires the properties actually used:

```typescript
export type FocusedEventInfo = Pick<EventOccurrence, 'start' | 'id'>;
```

This allows `focusCalendarEvent` to accept a simple `{ start, id }` object instead of a full `EventOccurrence`.

### 2. Updated Components to Use `FocusedEventInfo`

Updated the following files to use the new minimal type for `focusedEvent`:

- `mailspring-calendar.tsx` - State, props interfaces, and `_focusEvent` method
- `week-view-event-column.tsx` - Props interface
- `month-view-day-cell.tsx` - Props interface

### 3. Implemented `createEvent` in Quick Event Popover

**File**: `app/internal_packages/main-calendar/lib/quick-event-popover.tsx`

Added imports:
```typescript
import { ..., SyncbackEventTask, TaskQueue } from 'mailspring-exports';
```

Replaced TODO code with working implementation:
```typescript
// Create and queue the task to save the event
const task = SyncbackEventTask.forCreating({
  event,
  calendarId: editableCals[0].id,
  accountId: editableCals[0].accountId,
});
Actions.queueTask(task);

// Wait for the task to complete (synced to server)
await TaskQueue.waitForPerformRemote(task);

// Focus the calendar on the newly created event
Actions.focusCalendarEvent({ id: event.id, start: event.start });
```

## Key Patterns Used

1. **Task Queueing**: Uses `SyncbackEventTask.forCreating()` factory method
2. **Task Completion**: Waits with `TaskQueue.waitForPerformRemote(task)`
3. **Event Selection**: Uses `Actions.focusCalendarEvent()` with minimal properties

## Files Modified

- `app/internal_packages/main-calendar/lib/core/calendar-data-source.ts`
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx`
- `app/internal_packages/main-calendar/lib/core/week-view-event-column.tsx`
- `app/internal_packages/main-calendar/lib/core/month-view-day-cell.tsx`
- `app/internal_packages/main-calendar/lib/quick-event-popover.tsx`
