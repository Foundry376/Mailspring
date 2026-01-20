import {
  Actions,
  Event,
  SyncbackEventTask,
  ICSEventHelpers,
  CalendarUtils,
  localized,
} from 'mailspring-exports';
import { showRecurringEventDialog, RecurringEventOperation } from './recurring-event-dialog';

/**
 * Snapshot of event data for undo support.
 */
interface EventSnapshot {
  ics: string;
  recurrenceStart: number;
  recurrenceEnd: number;
}

/**
 * Captures the current event state for undo support.
 */
function captureEventSnapshot(event: Event): EventSnapshot {
  return {
    ics: event.ics,
    recurrenceStart: event.recurrenceStart,
    recurrenceEnd: event.recurrenceEnd,
  };
}

/**
 * Options for modifying an event's times
 */
export interface EventTimeChangeOptions {
  /** The Event model to modify */
  event: Event;
  /** Original occurrence start time (unix seconds) - for recurring events */
  originalOccurrenceStart: number;
  /** New start time (unix seconds) */
  newStart: number;
  /** New end time (unix seconds) */
  newEnd: number;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Description for the undo toast (e.g., "Move event") */
  description?: string;
}

/**
 * Result of an event modification operation
 */
export interface EventModificationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Whether the operation was cancelled by user */
  cancelled?: boolean;
  /** The modified master event (if applicable) */
  masterEvent?: Event;
  /** The created exception event (if applicable) */
  exceptionEvent?: Event;
}

/**
 * Modifies a simple (non-recurring) event's times and queues the syncback task.
 * The task is automatically undoable via UndoRedoStore.
 */
export function modifySimpleEvent(options: EventTimeChangeOptions): void {
  const { event, newStart, newEnd, isAllDay, description } = options;

  // Capture original state for undo BEFORE modifying
  const undoData = captureEventSnapshot(event);

  // Update ICS data
  event.ics = ICSEventHelpers.updateEventTimes(event.ics, {
    start: newStart,
    end: newEnd,
    isAllDay,
  });

  // Update cached fields
  event.recurrenceStart = newStart;
  event.recurrenceEnd = newEnd;

  // Queue syncback with undo support
  const task = SyncbackEventTask.forUpdating({
    event,
    undoData,
    description: description || localized('Edit event'),
  });
  Actions.queueTask(task);
}

/**
 * Creates an exception for a single occurrence of a recurring event.
 * Updates the master event with an EXDATE and creates a new exception event.
 *
 * Note: Undo for exception creation is complex (requires removing EXDATE and
 * deleting the exception). Currently only the master event update supports undo.
 */
export function createOccurrenceException(options: EventTimeChangeOptions): Event {
  const { event: masterEvent, originalOccurrenceStart, newStart, newEnd, isAllDay, description } =
    options;

  // Capture master event state for undo BEFORE modifying
  const masterUndoData = captureEventSnapshot(masterEvent);

  // Create the exception ICS data
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

  // Queue task for master event with undo support
  Actions.queueTask(
    SyncbackEventTask.forUpdating({
      event: masterEvent,
      undoData: masterUndoData,
      description: description || localized('Edit occurrence'),
    })
  );

  // Queue task for exception event (no undo - creating new event)
  Actions.queueTask(
    SyncbackEventTask.forCreating({
      event: exceptionEvent,
      calendarId: masterEvent.calendarId,
      accountId: masterEvent.accountId,
    })
  );

  return exceptionEvent;
}

/**
 * Modifies all occurrences of a recurring event by shifting the master times.
 * The task is automatically undoable via UndoRedoStore.
 */
export function modifyAllOccurrences(options: EventTimeChangeOptions): void {
  const { event, originalOccurrenceStart, newStart, newEnd, isAllDay, description } = options;

  // Capture original state for undo BEFORE modifying
  const undoData = captureEventSnapshot(event);

  // Update the master event's times (shifts entire series)
  event.ics = ICSEventHelpers.updateRecurringEventTimes(
    event.ics,
    originalOccurrenceStart,
    newStart,
    newEnd,
    isAllDay
  );

  // Re-parse to get the new master times
  const { event: icsEvent } = CalendarUtils.parseICSString(event.ics);
  event.recurrenceStart = icsEvent.startDate.toJSDate().getTime() / 1000;
  event.recurrenceEnd = icsEvent.endDate.toJSDate().getTime() / 1000;

  // Queue syncback with undo support
  const task = SyncbackEventTask.forUpdating({
    event,
    undoData,
    description: description || localized('Edit recurring event'),
  });
  Actions.queueTask(task);
}

/**
 * Handles modification of an event, showing the recurring dialog if needed.
 * This is the main entry point for event modifications that need to handle
 * recurring events properly.
 *
 * @param options - The modification options
 * @param operation - The type of operation for the dialog (move, resize, edit)
 * @param eventTitle - The event title for the dialog
 * @returns Result indicating success/cancellation and any created events
 */
export async function modifyEventWithRecurringSupport(
  options: EventTimeChangeOptions,
  operation: RecurringEventOperation,
  eventTitle: string
): Promise<EventModificationResult> {
  const { event, newStart, newEnd, isAllDay } = options;

  // Check if this is a recurring event (and not already an exception)
  const isRecurring = ICSEventHelpers.isRecurringEvent(event.ics);

  if (isRecurring && !event.isRecurrenceException()) {
    // Show dialog for recurring events
    const choice = await showRecurringEventDialog(operation, eventTitle);

    if (choice === 'cancel') {
      return { success: false, cancelled: true };
    }

    if (choice === 'this-occurrence') {
      // Create exception for this occurrence only
      const exceptionEvent = createOccurrenceException(options);
      return {
        success: true,
        masterEvent: event,
        exceptionEvent,
      };
    } else {
      // Modify all occurrences
      modifyAllOccurrences(options);
      return {
        success: true,
        masterEvent: event,
      };
    }
  } else {
    // Non-recurring event or already an exception - simple update
    modifySimpleEvent(options);
    return {
      success: true,
      masterEvent: event,
    };
  }
}
