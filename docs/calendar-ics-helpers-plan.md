# Calendar ICS Helpers and Recurring Event Dialog Implementation Plan

This document outlines the implementation plan for:
1. A centralized ICS helper module for creating and modifying calendar event ICS data
2. A "this occurrence or all occurrences" confirmation dialog for recurring events

## Background

### Current State

When calendar events are dragged, the persistence flow in `mailspring-calendar.tsx:495-543` only updates `recurrenceStart` and `recurrenceEnd` on the Event model. The underlying ICS data (stored in `event.ics`) is not modified. This creates a mismatch between the cached time fields and the actual ICS calendar data.

The existing ICS utilities in `app/src/calendar-utils.ts` provide:
- `parseICSString(ics)` - Parse ICS string into ical.js objects
- `cleanParticipants(icsEvent)` - Extract attendee information
- `selfParticipant(icsEvent, accountId)` - Find current user in attendees

The codebase uses:
- **ical.js** (^2.2.1) - For parsing and manipulating ICS data
- **ical-expander** (^3.2.0) - For expanding recurring events

### Problem Statement

1. **ICS data inconsistency**: When events are modified (dragged, edited), only the cached fields are updated, not the ICS data
2. **No recurring event handling**: When modifying a recurring event occurrence, there's no prompt to ask whether to modify just this occurrence or all occurrences

---

## Part 1: Centralized ICS Helper Module

### 1.1 New File: `app/src/ics-event-helpers.ts`

Create a new module that provides high-level operations for ICS manipulation.

```typescript
// app/src/ics-event-helpers.ts

import { Event } from './flux/models/event';
import { parseICSString } from './calendar-utils';

type ICAL = typeof import('ical.js').default;
let ICAL: ICAL = null;

function getICAL(): ICAL {
  if (!ICAL) {
    ICAL = require('ical.js');
  }
  return ICAL;
}

/**
 * Options for creating a new ICS event
 */
export interface CreateEventOptions {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  organizer?: { email: string; name?: string };
  attendees?: Array<{ email: string; name?: string; role?: string }>;
  recurrenceRule?: string; // RRULE string like "FREQ=WEEKLY;BYDAY=MO,WE,FR"
}

/**
 * Options for updating event times
 */
export interface UpdateTimesOptions {
  start: number; // Unix timestamp
  end: number; // Unix timestamp
  isAllDay?: boolean;
}

/**
 * Result of modifying a recurring event occurrence
 */
export interface RecurrenceModificationResult {
  /** Updated master event (with EXDATE added if creating exception) */
  masterEvent?: Event;
  /** New exception event (if modifying single occurrence) */
  exceptionEvent?: Event;
  /** The event to save (master if modifying all, exception if single) */
  eventToSave: Event;
}
```

### 1.2 Core Functions

#### 1.2.1 Create ICS from Scratch

```typescript
/**
 * Creates a new ICS string for an event
 */
export function createICSString(options: CreateEventOptions): string {
  const ICAL = getICAL();

  // Create VCALENDAR component
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('prodid', '-//Mailspring//Calendar//EN');
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('calscale', 'GREGORIAN');

  // Create VEVENT component
  const vevent = new ICAL.Component('vevent');
  const event = new ICAL.Event(vevent);

  // Set UID (generate if not provided)
  event.uid = options.uid || generateUID();

  // Set summary (title)
  event.summary = options.summary;

  // Set times
  if (options.isAllDay) {
    // For all-day events, use DATE type (no time component)
    const startDate = ICAL.Time.fromJSDate(options.start, true);
    startDate.isDate = true;
    event.startDate = startDate;

    const endDate = ICAL.Time.fromJSDate(options.end, true);
    endDate.isDate = true;
    event.endDate = endDate;
  } else {
    event.startDate = ICAL.Time.fromJSDate(options.start, false);
    event.endDate = ICAL.Time.fromJSDate(options.end, false);
  }

  // Set optional properties
  if (options.description) {
    event.description = options.description;
  }
  if (options.location) {
    event.location = options.location;
  }

  // Set organizer
  if (options.organizer) {
    const organizer = vevent.addProperty('organizer');
    organizer.setValue(`mailto:${options.organizer.email}`);
    if (options.organizer.name) {
      organizer.setParameter('cn', options.organizer.name);
    }
  }

  // Set attendees
  if (options.attendees) {
    for (const attendee of options.attendees) {
      const prop = vevent.addProperty('attendee');
      prop.setValue(`mailto:${attendee.email}`);
      if (attendee.name) {
        prop.setParameter('cn', attendee.name);
      }
      prop.setParameter('partstat', 'NEEDS-ACTION');
      prop.setParameter('role', attendee.role || 'REQ-PARTICIPANT');
    }
  }

  // Set recurrence rule
  if (options.recurrenceRule) {
    vevent.addPropertyWithValue('rrule', ICAL.Recur.fromString(options.recurrenceRule));
  }

  // Set timestamp
  vevent.addPropertyWithValue('dtstamp', ICAL.Time.now());

  calendar.addSubcomponent(vevent);
  return calendar.toString();
}

function generateUID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}@mailspring`;
}
```

#### 1.2.2 Update Event Times in ICS

```typescript
/**
 * Updates the start/end times in an event's ICS data
 * Returns the modified ICS string
 */
export function updateEventTimes(ics: string, options: UpdateTimesOptions): string {
  const ICAL = getICAL();
  const { root, event } = parseICSString(ics);

  const startDate = new Date(options.start * 1000);
  const endDate = new Date(options.end * 1000);

  if (options.isAllDay) {
    // For all-day events, use DATE type
    const newStart = ICAL.Time.fromJSDate(startDate, true);
    newStart.isDate = true;
    event.startDate = newStart;

    const newEnd = ICAL.Time.fromJSDate(endDate, true);
    newEnd.isDate = true;
    event.endDate = newEnd;
  } else {
    // For timed events, preserve timezone if possible
    const originalTz = event.startDate.zone;

    const newStart = ICAL.Time.fromJSDate(startDate, false);
    if (originalTz && originalTz.tzid !== 'UTC') {
      newStart.zone = originalTz;
    }
    event.startDate = newStart;

    const newEnd = ICAL.Time.fromJSDate(endDate, false);
    if (originalTz && originalTz.tzid !== 'UTC') {
      newEnd.zone = originalTz;
    }
    event.endDate = newEnd;
  }

  // Update DTSTAMP to indicate modification
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  // Increment SEQUENCE if present (for proper sync)
  const sequence = vevent.getFirstPropertyValue('sequence');
  if (sequence !== null) {
    vevent.updatePropertyWithValue('sequence', (parseInt(sequence, 10) || 0) + 1);
  }

  return root.toString();
}
```

#### 1.2.3 Create Recurrence Exception

```typescript
/**
 * Creates an exception instance for a recurring event
 * This is used when modifying a single occurrence of a recurring event
 *
 * @param masterIcs - The master event's ICS data
 * @param originalOccurrenceStart - The original start time of the occurrence being modified
 * @param newStart - New start time (unix timestamp)
 * @param newEnd - New end time (unix timestamp)
 * @returns Object with modified master ICS (with EXDATE) and new exception ICS
 */
export function createRecurrenceException(
  masterIcs: string,
  originalOccurrenceStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean
): { masterIcs: string; exceptionIcs: string; recurrenceId: string } {
  const ICAL = getICAL();
  const { root: masterRoot, event: masterEvent } = parseICSString(masterIcs);

  // Create RECURRENCE-ID value from original occurrence start
  const originalDate = new Date(originalOccurrenceStart * 1000);
  const recurrenceId = isAllDay
    ? formatDateOnly(originalDate)
    : formatDateTime(originalDate);

  // Add EXDATE to master to exclude this occurrence
  const masterVevent = masterRoot.name === 'vevent'
    ? masterRoot
    : masterRoot.getFirstSubcomponent('vevent');

  const exdateTime = ICAL.Time.fromJSDate(originalDate, !isAllDay);
  if (isAllDay) {
    exdateTime.isDate = true;
  }
  masterVevent.addPropertyWithValue('exdate', exdateTime);

  // Create exception VCALENDAR
  const exceptionCal = new ICAL.Component(['vcalendar', [], []]);
  exceptionCal.updatePropertyWithValue('prodid', '-//Mailspring//Calendar//EN');
  exceptionCal.updatePropertyWithValue('version', '2.0');

  // Clone the VEVENT for the exception
  const exceptionVevent = new ICAL.Component(masterVevent.toJSON());

  // Remove recurrence rule from exception (it's a single instance)
  exceptionVevent.removeProperty('rrule');
  exceptionVevent.removeProperty('rdate');
  exceptionVevent.removeProperty('exdate');

  // Set RECURRENCE-ID
  const recIdTime = ICAL.Time.fromJSDate(originalDate, !isAllDay);
  if (isAllDay) {
    recIdTime.isDate = true;
  }
  exceptionVevent.updatePropertyWithValue('recurrence-id', recIdTime);

  // Set new times
  const newStartDate = new Date(newStart * 1000);
  const newEndDate = new Date(newEnd * 1000);

  const exceptionEvent = new ICAL.Event(exceptionVevent);
  if (isAllDay) {
    const startTime = ICAL.Time.fromJSDate(newStartDate, true);
    startTime.isDate = true;
    exceptionEvent.startDate = startTime;

    const endTime = ICAL.Time.fromJSDate(newEndDate, true);
    endTime.isDate = true;
    exceptionEvent.endDate = endTime;
  } else {
    exceptionEvent.startDate = ICAL.Time.fromJSDate(newStartDate, false);
    exceptionEvent.endDate = ICAL.Time.fromJSDate(newEndDate, false);
  }

  // Update DTSTAMP
  exceptionVevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  exceptionCal.addSubcomponent(exceptionVevent);

  return {
    masterIcs: masterRoot.toString(),
    exceptionIcs: exceptionCal.toString(),
    recurrenceId,
  };
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}
```

#### 1.2.4 Update All Occurrences (Shift Recurrence)

```typescript
/**
 * Updates times for all occurrences of a recurring event
 * Shifts the entire series by the delta between original and new times
 */
export function updateRecurringEventTimes(
  ics: string,
  originalStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean
): string {
  const { root, event } = parseICSString(ics);

  // Calculate the time delta
  const deltaMs = (newStart - originalStart) * 1000;

  // Get current times and apply delta
  const currentStart = event.startDate.toJSDate().getTime();
  const currentEnd = event.endDate.toJSDate().getTime();

  const adjustedStart = currentStart + deltaMs;
  const adjustedEnd = currentEnd + deltaMs;

  return updateEventTimes(ics, {
    start: adjustedStart / 1000,
    end: adjustedEnd / 1000,
    isAllDay,
  });
}
```

#### 1.2.5 Check if Event is Recurring

```typescript
/**
 * Checks if an event has recurrence rules
 */
export function isRecurringEvent(ics: string): boolean {
  const { root } = parseICSString(ics);
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  return !!(
    vevent.getFirstPropertyValue('rrule') ||
    vevent.getFirstPropertyValue('rdate')
  );
}

/**
 * Gets information about the recurrence pattern
 */
export function getRecurrenceInfo(ics: string): {
  isRecurring: boolean;
  rule?: string;
  frequency?: string;
} {
  const { root } = parseICSString(ics);
  const vevent = root.name === 'vevent' ? root : root.getFirstSubcomponent('vevent');

  const rrule = vevent.getFirstPropertyValue('rrule');
  if (!rrule) {
    return { isRecurring: false };
  }

  return {
    isRecurring: true,
    rule: rrule.toString(),
    frequency: rrule.freq,
  };
}
```

### 1.3 Export from `mailspring-exports`

Update `app/src/global/mailspring-exports.ts` to export the new module:

```typescript
export * as ICSEventHelpers from '../ics-event-helpers';
```

Update `app/src/global/mailspring-exports.d.ts`:

```typescript
export type ICSEventHelpers = typeof import('../ics-event-helpers');
export const ICSEventHelpers: ICSEventHelpers;
```

---

## Part 2: Recurring Event Confirmation Dialog

### 2.1 New Component: `RecurringEventDialog.tsx`

Create a reusable dialog component for recurring event modifications.

**File:** `app/internal_packages/main-calendar/lib/core/recurring-event-dialog.tsx`

```typescript
import React from 'react';
import { localized } from 'mailspring-exports';

export type RecurringEventChoice = 'this-occurrence' | 'all-occurrences' | 'cancel';

export interface RecurringEventDialogProps {
  /** Type of operation being performed */
  operation: 'move' | 'resize' | 'delete' | 'edit';
  /** Event title for display */
  eventTitle: string;
  /** Callback when user makes a choice */
  onChoice: (choice: RecurringEventChoice) => void;
}

/**
 * Shows a dialog asking whether to modify this occurrence or all occurrences
 * Returns a promise that resolves with the user's choice
 */
export function showRecurringEventDialog(
  operation: 'move' | 'resize' | 'delete' | 'edit',
  eventTitle: string
): Promise<RecurringEventChoice> {
  return new Promise((resolve) => {
    const remote = require('@electron/remote');

    const operationText = {
      move: localized('Move'),
      resize: localized('Resize'),
      delete: localized('Delete'),
      edit: localized('Edit'),
    }[operation];

    const response = remote.dialog.showMessageBoxSync({
      type: 'question',
      buttons: [
        localized('This occurrence only'),
        localized('All occurrences'),
        localized('Cancel'),
      ],
      defaultId: 0,
      cancelId: 2,
      title: localized('Recurring Event'),
      message: localized('%1$@ recurring event "%2$@"?', operationText, eventTitle),
      detail: localized(
        'This is a recurring event. Do you want to %1$@ only this occurrence, or all occurrences in the series?',
        operation
      ),
    });

    const choices: RecurringEventChoice[] = ['this-occurrence', 'all-occurrences', 'cancel'];
    resolve(choices[response]);
  });
}
```

### 2.2 Integration with Drag Persistence

Update `mailspring-calendar.tsx` `_persistDragChange` method:

```typescript
import {
  ICSEventHelpers,
  Event,
  DatabaseStore,
  Actions,
  SyncbackEventTask
} from 'mailspring-exports';
import { showRecurringEventDialog, RecurringEventChoice } from './recurring-event-dialog';

async _persistDragChange(dragState: DragState) {
  // Clear the drag state immediately for responsive UI
  this.setState({ dragState: null });

  try {
    const eventId = parseEventIdFromOccurrence(dragState.event.id);
    const event = await DatabaseStore.find<Event>(Event, eventId);

    if (!event) {
      console.error('Could not find event to update:', eventId);
      return;
    }

    // Check if calendar is read-only
    const calendar = this.state.calendars.find(c => c.id === event.calendarId);
    if (calendar?.readOnly) {
      console.warn('Cannot modify event in read-only calendar');
      return;
    }

    // Store original values for undo
    const originalStart = event.recurrenceStart;
    const originalEnd = event.recurrenceEnd;

    // Calculate new times
    let newStart = dragState.previewStart;
    let newEnd = dragState.previewEnd;

    if (dragState.event.isAllDay) {
      const snapped = snapAllDayTimes(newStart, newEnd);
      newStart = snapped.start;
      newEnd = snapped.end;
    }

    // Check if this is a recurring event
    const isRecurring = ICSEventHelpers.isRecurringEvent(event.ics);

    if (isRecurring && !event.isRecurrenceException()) {
      // Show dialog for recurring events
      const choice = await showRecurringEventDialog(
        dragState.mode === 'move' ? 'move' : 'resize',
        dragState.event.title
      );

      if (choice === 'cancel') {
        return; // User cancelled
      }

      if (choice === 'this-occurrence') {
        // Create exception for this occurrence only
        await this._persistSingleOccurrenceChange(
          event,
          dragState.event.start, // Original occurrence start
          newStart,
          newEnd,
          dragState.event.isAllDay,
          originalStart,
          originalEnd
        );
      } else {
        // Modify all occurrences
        await this._persistAllOccurrencesChange(
          event,
          dragState.event.start,
          newStart,
          newEnd,
          dragState.event.isAllDay,
          originalStart,
          originalEnd
        );
      }
    } else {
      // Non-recurring event or already an exception - simple update
      await this._persistSimpleEventChange(
        event,
        newStart,
        newEnd,
        dragState.event.isAllDay,
        originalStart,
        originalEnd
      );
    }
  } catch (error) {
    console.error('Failed to persist drag change:', error);
  }
}

/**
 * Persist a simple (non-recurring) event change
 */
async _persistSimpleEventChange(
  event: Event,
  newStart: number,
  newEnd: number,
  isAllDay: boolean,
  originalStart: number,
  originalEnd: number
) {
  // Update ICS data
  event.ics = ICSEventHelpers.updateEventTimes(event.ics, {
    start: newStart,
    end: newEnd,
    isAllDay,
  });

  // Update cached fields
  event.recurrenceStart = newStart;
  event.recurrenceEnd = newEnd;

  // Queue syncback
  const task = SyncbackEventTask.forUpdating({ event });
  Actions.queueTask(task);

  // Register undo
  this._registerUndoAction(event, originalStart, originalEnd, newStart, newEnd);
}

/**
 * Persist a change to a single occurrence (creates exception)
 */
async _persistSingleOccurrenceChange(
  masterEvent: Event,
  originalOccurrenceStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean,
  originalStart: number,
  originalEnd: number
) {
  const { masterIcs, exceptionIcs, recurrenceId } = ICSEventHelpers.createRecurrenceException(
    masterEvent.ics,
    originalOccurrenceStart,
    newStart,
    newEnd,
    isAllDay
  );

  // Update master event with EXDATE
  masterEvent.ics = masterIcs;

  // Create new exception event
  const exceptionEvent = new Event({
    accountId: masterEvent.accountId,
    calendarId: masterEvent.calendarId,
    ics: exceptionIcs,
    icsuid: masterEvent.icsuid,
    recurrenceId: recurrenceId,
    recurrenceStart: newStart,
    recurrenceEnd: newEnd,
    status: masterEvent.status,
  });

  // Queue tasks to save both events
  Actions.queueTask(SyncbackEventTask.forUpdating({ event: masterEvent }));
  Actions.queueTask(SyncbackEventTask.forCreating({
    event: exceptionEvent,
    calendarId: masterEvent.calendarId,
    accountId: masterEvent.accountId,
  }));

  // Register undo (more complex for exceptions - may need custom undo logic)
  this._registerUndoAction(masterEvent, originalStart, originalEnd, newStart, newEnd);
}

/**
 * Persist a change to all occurrences of a recurring event
 */
async _persistAllOccurrencesChange(
  event: Event,
  originalOccurrenceStart: number,
  newStart: number,
  newEnd: number,
  isAllDay: boolean,
  originalStart: number,
  originalEnd: number
) {
  // Update the master event's times (shifts entire series)
  event.ics = ICSEventHelpers.updateRecurringEventTimes(
    event.ics,
    originalOccurrenceStart,
    newStart,
    newEnd,
    isAllDay
  );

  // Update cached fields based on new master times
  const { event: icsEvent } = parseICSString(event.ics);
  event.recurrenceStart = icsEvent.startDate.toJSDate().getTime() / 1000;
  event.recurrenceEnd = icsEvent.endDate.toJSDate().getTime() / 1000;

  // Queue syncback
  const task = SyncbackEventTask.forUpdating({ event });
  Actions.queueTask(task);

  // Register undo
  this._registerUndoAction(event, originalStart, originalEnd, newStart, newEnd);
}
```

---

## Part 3: Update Event Popover

The event popover (`calendar-event-popover.tsx`) also saves events and should use the same ICS helpers.

### 3.1 Update `_onSave` Method

```typescript
// In calendar-event-popover.tsx

_onSave = async () => {
  const occurrenceId = this.props.event.id;
  const eventId = occurrenceId.replace(/-e\d+$/, '');

  const event = await DatabaseStore.find<Event>(Event, eventId);
  if (!event) {
    console.error(`Could not find event with id ${eventId} to update`);
    this.setState({ editing: false });
    return;
  }

  // Update ICS data with new times
  event.ics = ICSEventHelpers.updateEventTimes(event.ics, {
    start: this.state.start,
    end: this.state.end,
    isAllDay: this.props.event.isAllDay,
  });

  // Update cached fields
  event.recurrenceStart = this.state.start;
  event.recurrenceEnd = this.state.end;

  this.setState({ editing: false });

  const task = SyncbackEventTask.forUpdating({ event });
  Actions.queueTask(task);
};
```

---

## Implementation Steps

### Phase 1: ICS Helper Module

1. Create `app/src/ics-event-helpers.ts` with core functions
2. Add comprehensive unit tests in `app/spec/ics-event-helpers-spec.ts`
3. Export from `mailspring-exports`
4. Verify ical.js API compatibility with existing usage

### Phase 2: Recurring Event Dialog

1. Create `recurring-event-dialog.tsx` component
2. Add localization strings for dialog text
3. Write tests for dialog behavior

### Phase 3: Integration

1. Update `_persistDragChange` in `mailspring-calendar.tsx`
2. Update `_onSave` in `calendar-event-popover.tsx`
3. Add integration tests for drag persistence
4. Test with various calendar providers (Google, Exchange, CalDAV)

### Phase 4: Edge Cases and Polish

1. Handle timezone edge cases
2. Handle events with complex recurrence rules
3. Test undo/redo for all scenarios
4. Add error handling and user feedback for sync failures

---

## Testing Considerations

### Unit Tests

- `createICSString` generates valid ICS
- `updateEventTimes` preserves other properties
- `createRecurrenceException` generates valid EXDATE and exception
- `isRecurringEvent` correctly detects recurrence rules
- Timezone handling for various scenarios

### Integration Tests

- Drag non-recurring event and verify ICS updated
- Drag recurring event, choose "this occurrence", verify exception created
- Drag recurring event, choose "all occurrences", verify series shifted
- Undo after each operation

### Manual Testing

- Test with Google Calendar events
- Test with Exchange/Office 365 events
- Test with CalDAV events
- Verify changes sync correctly to server
- Verify changes appear correctly in other calendar clients

---

## Files to Create/Modify

### New Files
- `app/src/ics-event-helpers.ts`
- `app/spec/ics-event-helpers-spec.ts`
- `app/internal_packages/main-calendar/lib/core/recurring-event-dialog.tsx`

### Modified Files
- `app/src/global/mailspring-exports.ts` - Add ICSEventHelpers export
- `app/src/global/mailspring-exports.d.ts` - Add type definitions
- `app/internal_packages/main-calendar/lib/core/mailspring-calendar.tsx` - Update persistence
- `app/internal_packages/main-calendar/lib/core/calendar-event-popover.tsx` - Update save method

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ical.js API changes | Pin version, add comprehensive tests |
| Timezone issues | Preserve original timezone, extensive testing |
| Sync engine compatibility | Coordinate with sync engine to ensure it handles updated ICS |
| Complex recurrence rules | Start with simple RRULE support, iterate |
| Performance with large ICS | Parse lazily, cache parsed results |
