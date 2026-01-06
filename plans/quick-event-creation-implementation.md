# Quick Event Creation Implementation Plan

## Overview

Implement the functionality in `quick-event-popover.tsx` to save new events using `SyncbackEventTask` and then select/focus the event on the calendar view after creation.

## Current State

The `createEvent` method in `quick-event-popover.tsx:41-82` currently:
1. Finds editable calendars
2. Creates an `Event` model with the parsed date/time info
3. Has a TODO comment with non-functional code that never saves the event

## Required Changes

### 1. Import Required Modules

Add imports to `quick-event-popover.tsx`:
- `SyncbackEventTask` - for creating the task to save the event
- `TaskQueue` - for waiting on task completion

**Location**: `quick-event-popover.tsx:2`

```typescript
import {
  Actions,
  Calendar,
  DatabaseStore,
  DateUtils,
  Event,
  localized,
  SyncbackEventTask,
  TaskQueue
} from 'mailspring-exports';
```

### 2. Update createEvent Method

Replace the TODO code block with working implementation:

**Location**: `quick-event-popover.tsx:73-82`

**Implementation Steps**:

a. Create the `SyncbackEventTask` using the `forCreating` factory method:
```typescript
const task = SyncbackEventTask.forCreating({
  event,
  calendarId: editableCals[0].id,
  accountId: editableCals[0].accountId,
});
```

b. Queue the task:
```typescript
Actions.queueTask(task);
```

c. Wait for task completion using `TaskQueue.waitForPerformRemote(task)`:
```typescript
await TaskQueue.waitForPerformRemote(task);
```

d. After task completes, focus the calendar on the new event using `Actions.focusCalendarEvent`. This requires creating an `EventOccurrence` object from our Event:

```typescript
const eventOccurrence = {
  id: event.id,
  start: event.start,
  end: event.end,
  accountId: event.accountId,
  calendarId: event.calendarId,
  title: event.title || '',
  location: event.location || '',
  description: event.description || '',
  isAllDay: false,
  isCancelled: false,
  isException: false,
  organizer: null,
  attendees: event.attendees || [],
};
Actions.focusCalendarEvent(eventOccurrence);
```

### 3. Key Patterns Used

**Task Queueing Pattern** (from `draft-store.ts:208-211`):
```typescript
const task = new SomeTask({ ... });
Actions.queueTask(task);
await TaskQueue.waitForPerformRemote(task);
// Now safe to proceed with result
```

**Event Focus Pattern** (from `event-search-bar.tsx:131-134`):
```typescript
_onSelectEvent = (event: EventOccurrence) => {
  this.setState({ query: '', suggestions: [], focused: false, selectedIdx: -1 });
  Actions.focusCalendarEvent(event);
};
```

**How focusCalendarEvent works** (from `mailspring-calendar.tsx:138-140`):
```typescript
_focusEvent = (event: EventOccurrence) => {
  this.setState({ focusedMoment: moment(event.start * 1000), focusedEvent: event });
};
```
This sets the calendar's focused moment to the event's start time and marks the event as focused.

### 4. EventOccurrence Interface

From `calendar-data-source.ts:5-19`:
```typescript
export interface EventOccurrence {
  start: number; // unix
  end: number; // unix
  id: string;
  accountId: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  isAllDay: boolean;
  isCancelled: boolean;
  isException: boolean;
  organizer: { email: string } | null;
  attendees: { email: string; name: string }[];
}
```

## Final Implementation

```typescript
createEvent = async ({
  leftoverText,
  start,
  end,
}: {
  leftoverText: string;
  start: Moment;
  end: Moment;
}) => {
  const allCalendars = await DatabaseStore.findAll<Calendar>(Calendar);
  const editableCals = allCalendars.filter(c => !c.readOnly);
  if (editableCals.length === 0) {
    AppEnv.showErrorDialog(
      localized(
        "This account has no editable calendars. We can't create an event for you. Please make sure you have an editable calendar with your account provider."
      )
    );
    return;
  }

  const event = new Event({
    calendarId: editableCals[0].id,
    accountId: editableCals[0].accountId,
    start: start.unix(),
    end: end.unix(),
    when: {
      start_time: start.unix(),
      end_time: end.unix(),
    },
    title: leftoverText,
  });

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
  const eventOccurrence = {
    id: event.id,
    start: event.start,
    end: event.end,
    accountId: event.accountId,
    calendarId: event.calendarId,
    title: event.title || '',
    location: event.location || '',
    description: event.description || '',
    isAllDay: false,
    isCancelled: false,
    isException: false,
    organizer: null,
    attendees: event.attendees || [],
  };
  Actions.focusCalendarEvent(eventOccurrence);
};
```

## Testing Considerations

1. **Happy path**: Create event with valid date string, verify event appears in calendar
2. **No editable calendars**: Should show error dialog
3. **Task failure**: Should handle errors gracefully (currently no error handling - could add try/catch)
4. **Calendar navigation**: After creation, calendar should navigate to the event's date

## Related Files

- `app/internal_packages/main-calendar/lib/quick-event-popover.tsx` - Main file to modify
- `app/src/flux/tasks/syncback-event-task.ts` - Task class with `forCreating` factory
- `app/src/flux/stores/task-queue.ts` - `waitForPerformRemote` method
- `app/internal_packages/main-calendar/lib/core/event-search-bar.tsx` - Reference for `focusCalendarEvent`
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx` - Listener for `focusCalendarEvent`
- `app/internal_packages/main-calendar/lib/core/calendar-data-source.ts` - `EventOccurrence` interface
