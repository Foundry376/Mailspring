import {
  Actions,
  Event,
  SyncbackEventTask,
  ICSEventHelpers,
  CalendarUtils,
  localized,
} from 'mailspring-exports';
import {
  showRecurringEventDialog,
  RecurringEventChoice,
  RecurringEventOperation,
} from './recurring-event-dialog';
import { occurrenceForRecurrenceId, occurrenceTimes } from './calendar-data-source';
import { ShowAsOption } from './show-as-selector';

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
export function modifySimpleEvent(options: EventTimeChangeOptions): SyncbackEventTask {
  const { event, newStart, newEnd, isAllDay, description } = options;
  return modifySimpleEventChange(
    event,
    { times: { start: newStart, end: newEnd, isAllDay }, edits: [] },
    description
  );
}

export type EventPropertyEdit =
  | { property: 'summary' | 'location' | 'description' | 'transp'; value: string }
  | { property: 'rrule'; value: string | null };

/** Edits to one simple event sent as a single update, so its guests get one email. */
export interface EventChange {
  times?: { start: number; end: number; isAllDay: boolean };
  edits: EventPropertyEdit[];
}

function applyPropertyEdit(ics: string, edit: EventPropertyEdit) {
  return edit.property === 'rrule'
    ? ICSEventHelpers.updateRecurrenceRule(ics, edit.value)
    : ICSEventHelpers.updateEventProperty(ics, edit.property, edit.value);
}

/**
 * Writes a change's times and properties to a simple event and queues one syncback task. Every
 * other property is written back as stored, so editing the title leaves an invitation's
 * formatted description intact.
 */
export function modifySimpleEventChange(
  event: Event,
  change: EventChange,
  description = localized('Edit event')
): SyncbackEventTask {
  const undoData = captureEventSnapshot(event);
  let ics = change.edits.reduce(applyPropertyEdit, event.ics);
  if (change.times) {
    ics = ICSEventHelpers.updateEventTimes(ics, change.times);
    event.recurrenceStart = change.times.start;
    event.recurrenceEnd = change.times.end;
  }
  event.ics = ICSEventHelpers.bumpEventSequence(ics);

  const task = SyncbackEventTask.forUpdating({ event, undoData, description });
  Actions.queueTask(task);
  return task;
}

/**
 * Creates an exception for a single occurrence of a recurring event.
 * Embeds the exception VEVENT inline in the master VCALENDAR and queues a single
 * update task (RFC 4791 §4.1 compliant — same UID must share the same resource).
 * Undo reverses the entire master ICS change, removing the inline exception.
 */
export function createOccurrenceException(options: EventTimeChangeOptions): void {
  const { event, originalOccurrenceStart, newStart, newEnd, isAllDay, description } = options;
  modifyOccurrenceChange(
    event,
    originalOccurrenceStart,
    { times: { start: newStart, end: newEnd, isAllDay }, edits: [] },
    description
  );
}

/**
 * Writes a change to one occurrence of a series as its inline exception and queues one syncback
 * task. A repeat rule belongs to the whole series, so a change carrying one goes to
 * modifySeriesChange instead.
 *
 * @param slot - The occurrence's RECURRENCE-ID instant, where the rule puts it (unix seconds)
 */
export function modifyOccurrenceChange(
  master: Event,
  slot: number,
  change: EventChange & Required<Pick<EventChange, 'times'>>,
  description = localized('Edit occurrence')
): SyncbackEventTask {
  const undoData = captureEventSnapshot(master);
  const { times } = change;
  const { masterIcs, recurrenceId } = ICSEventHelpers.createRecurrenceException(
    master.ics,
    slot,
    times.start,
    times.end,
    times.isAllDay
  );
  const edited = (property: EventPropertyEdit['property']) =>
    change.edits.find((e) => e.property === property)?.value ?? undefined;
  const ics = change.edits.length
    ? ICSEventHelpers.applyEditsToException(masterIcs, recurrenceId, {
        summary: edited('summary'),
        location: edited('location'),
        description: edited('description'),
        transparency: edited('transp') as ShowAsOption | undefined,
      })
    : masterIcs;

  master.ics = ICSEventHelpers.bumpEventSequence(ics, recurrenceId);
  master.recurrenceStart = times.start;
  master.recurrenceEnd = times.end;

  const task = SyncbackEventTask.forUpdating({ event: master, undoData, description });
  Actions.queueTask(task);
  return task;
}

/**
 * Modifies all occurrences of a recurring event by shifting the master times.
 * The task is automatically undoable via UndoRedoStore.
 */
export function modifyAllOccurrences(options: EventTimeChangeOptions): void {
  const { event, originalOccurrenceStart, newStart, newEnd, isAllDay, description } = options;
  modifySeriesChange(
    event,
    originalOccurrenceStart,
    { times: { start: newStart, end: newEnd, isAllDay }, edits: [] },
    description
  );
}

/**
 * Writes a change to every occurrence of a series and queues one syncback task. New times move
 * the series by however far the occurrence at `slot` moved.
 *
 * @param slot - The edited occurrence's RECURRENCE-ID instant, where the rule puts it (unix seconds)
 */
export function modifySeriesChange(
  master: Event,
  slot: number,
  change: EventChange,
  description = localized('Edit recurring event')
): SyncbackEventTask {
  const undoData = captureEventSnapshot(master);
  let ics = change.edits.reduce(applyPropertyEdit, master.ics);

  if (change.times) {
    const { start, end, isAllDay } = change.times;
    ics = ICSEventHelpers.updateRecurringEventTimes(ics, slot, start, end, isAllDay);
    // Exceptions keep their own times; only their RECURRENCE-IDs follow the rule's slots.
    if (start !== slot) ics = ICSEventHelpers.shiftInlineExceptions(ics, (start - slot) * 1000);
  }
  master.ics = ICSEventHelpers.bumpEventSequence(ics);

  const { event: icsEvent } = CalendarUtils.parseICSString(master.ics);
  master.recurrenceStart = icsEvent.startDate.toJSDate().getTime() / 1000;
  master.recurrenceEnd = icsEvent.endDate.toJSDate().getTime() / 1000;

  const task = SyncbackEventTask.forUpdating({ event: master, undoData, description });
  Actions.queueTask(task);
  return task;
}

export type ChangeScope = Exclude<RecurringEventChoice, 'cancel'>;

/**
 * Writes a change made to one occurrence and queues one syncback task: to the event itself for a
 * one-off or an exception stored as its own row, otherwise to the series for `scope`. A change
 * to a series carries the edited occurrence's `occurrenceSlot`.
 */
export function modifyEventChange(
  row: Event,
  change: EventChange & { slot?: number },
  scope: ChangeScope
): SyncbackEventTask {
  const { slot } = change;
  if (slot === undefined || row.isRecurrenceException()) {
    return modifySimpleEventChange(row, change);
  }
  if (scope === 'all-occurrences') {
    return modifySeriesChange(row, slot, change);
  }
  const occurrence = change.times ? null : occurrenceForRecurrenceId([row], slot);
  if (!change.times && !occurrence) {
    throw new Error(`No occurrence of ${row.id} at ${slot} to change`);
  }
  return modifyOccurrenceChange(row, slot, {
    ...change,
    times: change.times ?? occurrenceTimes(occurrence),
  });
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
    // because `CalendarUtils.parseOccurrenceId` strips the `-e{N}` suffix from inline occurrences).
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
