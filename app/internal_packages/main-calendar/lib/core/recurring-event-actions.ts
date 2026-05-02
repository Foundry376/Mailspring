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
  /**
   * Original occurrence start time (unix seconds).
   * For a regular occurrence this is its RRULE-generated start time.
   * For an inline exception this must be the RECURRENCE-ID value (i.e.
   * `occurrence.recurrenceIdStart`), NOT the exception's moved DTSTART —
   * otherwise `createRecurrenceException` computes the wrong RECURRENCE-ID
   * and the upsert fails to replace the existing inline exception VEVENT.
   */
  originalOccurrenceStart: number;
  /** New start time (unix seconds) */
  newStart: number;
  /** New end time (unix seconds) */
  newEnd: number;
  /** Whether this is an all-day event */
  isAllDay: boolean;
  /** Description for the undo toast (e.g., "Move event") */
  description?: string;
  /**
   * True when the occurrence being modified is already an inline exception.
   * When set, `modifyEventWithRecurringSupport` skips the "edit all / this
   * occurrence" dialog and always edits only this exception — matching the
   * behaviour of the popover's `saveEdits` path.
   */
  isException?: boolean;
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
 * Embeds the exception VEVENT inline in the master VCALENDAR and queues a single
 * update task (RFC 4791 §4.1 compliant — same UID must share the same resource).
 * Undo reverses the entire master ICS change, removing the inline exception.
 */
export function createOccurrenceException(options: EventTimeChangeOptions): void {
  const {
    event: masterEvent,
    originalOccurrenceStart,
    newStart,
    newEnd,
    isAllDay,
    description,
  } = options;

  // Capture master event state for undo BEFORE modifying
  const masterUndoData = captureEventSnapshot(masterEvent);

  // Embed the exception VEVENT inline in the master VCALENDAR
  const { masterIcs } = ICSEventHelpers.createRecurrenceException(
    masterEvent.ics,
    originalOccurrenceStart,
    newStart,
    newEnd,
    isAllDay
  );

  // Update master event ICS (now contains the inline exception VEVENT)
  masterEvent.ics = masterIcs;
  masterEvent.recurrenceStart = newStart;
  masterEvent.recurrenceEnd = newEnd;

  // Queue a single update task with full undo support
  Actions.queueTask(
    SyncbackEventTask.forUpdating({
      event: masterEvent,
      undoData: masterUndoData,
      description: description || localized('Edit occurrence'),
    })
  );
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

  // Shift inline exception RECURRENCE-IDs by the same delta so they remain mapped to
  // the correct (now-shifted) RRULE-generated slots. Exception DTSTART/DTEND are left
  // unchanged — the user's explicit exception time (e.g., 2AM) is preserved.
  const deltaMs = (newStart - originalOccurrenceStart) * 1000;
  if (deltaMs !== 0) {
    event.ics = ICSEventHelpers.shiftInlineExceptions(event.ics, deltaMs);
  }

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
  const { event, newStart, newEnd, isAllDay, isException } = options;

  // Check if this is a recurring event (and not already a standalone DB exception)
  const isRecurring = ICSEventHelpers.isRecurringEvent(event.ics);

  if (isRecurring && !event.isRecurrenceException() && !isException) {
    // Show dialog for recurring events.
    // Skip when `isException` is true: the occurrence being modified is already
    // an inline exception — always edit just that exception (no dialog needed).
    const choice = await showRecurringEventDialog(operation, eventTitle);

    if (choice === 'cancel') {
      return { success: false, cancelled: true };
    }

    if (choice === 'this-occurrence') {
      // Create exception for this occurrence only (inline, single task)
      createOccurrenceException(options);
      return {
        success: true,
        masterEvent: event,
      };
    } else {
      // Modify all occurrences
      modifyAllOccurrences(options);
      return {
        success: true,
        masterEvent: event,
      };
    }
  } else if (isException && !event.isRecurrenceException()) {
    // Inline exception being modified — `options.event` is the master event (guaranteed
    // because `parseEventIdFromOccurrence` strips the `-e{N}` suffix from inline occurrences).
    // `originalOccurrenceStart` must be the RECURRENCE-ID value (occurrence.recurrenceIdStart),
    // not the exception's moved DTSTART.
    createOccurrenceException(options);
    return {
      success: true,
      masterEvent: event,
    };
  } else {
    // Non-recurring event, or standalone DB exception (event.isRecurrenceException() === true).
    // For standalone exceptions the loaded event IS the exception record, not the master, so
    // createOccurrenceException would embed into the wrong ICS. Just update it directly.
    modifySimpleEvent(options);
    return {
      success: true,
      masterEvent: event,
    };
  }
}
