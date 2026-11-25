import {
  Actions,
  DatabaseStore,
  DateUtils,
  DestroyEventTask,
  Event,
  EventRSVPTask,
  SyncbackEventTask,
  TaskQueue,
  ICSEventHelpers,
  CalendarUtils,
  localized,
} from 'mailspring-exports';
import {
  DeleteRole,
  showDeleteDialog,
  showRecurringEventDialog,
  RecurringEventChoice,
  RecurringEventOperation,
} from './recurring-event-dialog';
import {
  EventOccurrence,
  focusedEventInfoForEvents,
  occurrenceForRecurrenceId,
  occurrenceSlot,
  occurrenceStartUnix,
  occurrenceTimes,
} from './calendar-data-source';
import { ShowAsOption } from './show-as-selector';
import { hasGuests, momentOf, organizerForAccount } from './calendar-helpers';
import {
  canRespondToEvent,
  myAttendeeEmail,
  occurrenceRecurrenceId,
  recordAndSendRSVP,
} from './calendar-rsvp';
import { UnsentChange, unsentEdit } from './unsent-change';
import type { AttendeeChange } from '../../../../src/ics-event-helpers';

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
   * occurrence" dialog and always edits only this exception.
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
  /** With `timezone` only when the event moves to that zone, which a series does as a whole. */
  times?: { start: number; end: number; isAllDay: boolean; timezone?: string };
  edits: EventPropertyEdit[];
  attendees?: AttendeeChange;
}

function applyPropertyEdit(ics: string, edit: EventPropertyEdit) {
  return edit.property === 'rrule'
    ? ICSEventHelpers.updateRecurrenceRule(ics, edit.value)
    : ICSEventHelpers.updateEventProperty(ics, edit.property, edit.value);
}

function applyAttendeeChange(
  ics: string,
  event: Event,
  change: EventChange,
  recurrenceId?: string
): string {
  if (!change.attendees) return ics;
  const organizer = organizerForAccount(event.accountId);
  return ICSEventHelpers.changeAttendees(ics, change.attendees, { organizer, recurrenceId });
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
  let ics = applyAttendeeChange(change.edits.reduce(applyPropertyEdit, event.ics), event, change);
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
 * Writes a guest's own settings to their copy of an invitation, for `scope` on a series. The
 * SEQUENCE stays: only the organizer revises a meeting (RFC 5546 section 2.1.4).
 */
export function modifyGuestCopy(
  row: Event,
  change: EventChange & { slot?: number },
  scope: ChangeScope
): SyncbackEventTask {
  const undoData = captureEventSnapshot(row);
  const { slot } = change;
  row.ics =
    slot === undefined || row.isRecurrenceException() || scope === 'all-occurrences'
      ? change.edits.reduce(applyPropertyEdit, row.ics)
      : occurrenceExceptionIcs(row.ics, slot, {
          ...change,
          times: occurrenceTimes(occurrenceAtSlot(row, slot)),
        }).ics;
  const task = SyncbackEventTask.forUpdating({
    event: row,
    undoData,
    description: localized('Edit event'),
  });
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

function occurrenceExceptionIcs(
  masterIcs: string,
  slot: number,
  change: EventChange & Required<Pick<EventChange, 'times'>>
) {
  const { times } = change;
  const created = ICSEventHelpers.createRecurrenceException(
    masterIcs,
    slot,
    times.start,
    times.end,
    times.isAllDay
  );
  const edited = (property: EventPropertyEdit['property']) =>
    change.edits.find((e) => e.property === property)?.value ?? undefined;
  const ics = change.edits.length
    ? ICSEventHelpers.applyEditsToException(created.masterIcs, created.recurrenceId, {
        summary: edited('summary'),
        location: edited('location'),
        description: edited('description'),
        transparency: edited('transp') as ShowAsOption | undefined,
      })
    : created.masterIcs;
  return { ics, recurrenceId: created.recurrenceId };
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
  const { ics, recurrenceId } = occurrenceExceptionIcs(master.ics, slot, change);

  master.ics = ICSEventHelpers.bumpEventSequence(
    applyAttendeeChange(ics, master, change, recurrenceId),
    recurrenceId
  );
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
  let ics = applyAttendeeChange(change.edits.reduce(applyPropertyEdit, master.ics), master, change);

  if (change.times) {
    const { start, end, isAllDay, timezone } = change.times;
    ics = ICSEventHelpers.updateRecurringEventTimes(ics, slot, start, end, isAllDay, timezone);
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
  return modifyOccurrenceChange(row, slot, {
    ...change,
    times: change.times ?? occurrenceTimes(occurrenceAtSlot(row, slot)),
  });
}

function occurrenceAtSlot(row: Event, slot: number) {
  const occurrence = occurrenceForRecurrenceId([row], slot);
  if (!occurrence) throw new Error(`No occurrence of ${row.id} at ${slot} to change`);
  return occurrence;
}

/**
 * A moved occurrence's slot as a UTC instant, which names its VEVENT whatever form its series
 * writes RECURRENCE-ID in. Undefined where the row's first VEVENT is the one.
 */
export function ownRecurrenceId(occurrence: EventOccurrence, row: Event): string | undefined {
  if (!occurrence.isException || row.isRecurrenceException()) return undefined;
  return new Date(occurrenceSlot(occurrence) * 1000).toISOString().replace(/[-:]|\.\d+/g, '');
}

/**
 * Written at once with the SEQUENCE kept: a reminder is the user's own, so guests get no update
 * for it.
 */
export async function updateEventAlarm(
  occurrence: EventOccurrence,
  index: number,
  trigger: string | null
) {
  const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
  const row = await DatabaseStore.find<Event>(Event, eventId);
  if (!row) return;
  const undoData = captureEventSnapshot(row);
  row.ics = ICSEventHelpers.editAlarm(row.ics, index, trigger, ownRecurrenceId(occurrence, row));
  const task = SyncbackEventTask.forUpdating({
    event: row,
    undoData,
    description: localized('Edit event'),
  });
  Actions.queueTask(task);
  await TaskQueue.waitForPerformLocal(task);
}

/**
 * Writes a change made in the panel. `follow.onMove` gets where the shown occurrence lands
 * before the sync engine writes it, so the host can keep it selected.
 */
export async function updateEvent(
  change: UnsentChange,
  scope: ChangeScope = 'this-occurrence',
  follow?: {
    shown: EventOccurrence;
    onMove: (row: Event, start: number, staleIcs: string) => void;
  }
) {
  const row = await DatabaseStore.find<Event>(Event, change.eventId);
  if (!row) return;
  const staleIcs = row.ics;
  const task = change.guestCopy
    ? modifyGuestCopy(row, change, scope)
    : modifyEventChange(row, change, scope);
  // A new repeat rule or time leaves the one-off fallback in currentOccurrence nothing to match.
  if (follow) {
    const start = change.times?.start ?? occurrenceStartUnix(follow.shown);
    // A new rule may have no occurrence there, so its next one is shown.
    const landing = unsentEdit(change, 'rrule')
      ? (focusedEventInfoForEvents([row], start)?.start ?? start)
      : start;
    follow.onMove(row, landing, staleIcs);
  }
  await TaskQueue.waitForPerformLocal(task);
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

interface DeleteTarget {
  occurrence: EventOccurrence;
  event: Event;
  master: Event;
}

async function deleteTarget(occurrence: EventOccurrence): Promise<DeleteTarget | null> {
  const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
  const event = await DatabaseStore.find<Event>(Event, eventId);
  if (!event) {
    console.error('Could not find event to delete:', eventId);
    return null;
  }
  // A moved occurrence is cancelled on its master; see removeInlineException for why its row
  // must never be destroyed on its own.
  const master = event.isRecurrenceException()
    ? await DatabaseStore.findBy<Event>(Event, {
        accountId: event.accountId,
        calendarId: event.calendarId,
        icsuid: event.icsuid,
        recurrenceId: '',
      })
    : event;
  if (!master) {
    showOccurrenceNotFoundError();
    return null;
  }
  return { occurrence, event, master };
}

function showOccurrenceNotFoundError() {
  AppEnv.showErrorDialog({
    title: localized('Delete Failed'),
    message: localized(
      'This occurrence could not be found in its series. Refresh the calendar and try again.'
    ),
  });
}

function isSeries({ event, master }: DeleteTarget) {
  return event.isRecurrenceException() || ICSEventHelpers.isRecurringEvent(master.ics);
}

/** A date its organizer cancelled doesn't cancel the series it belongs to. */
function wholeEventOccurrence({ occurrence, master }: DeleteTarget): EventOccurrence {
  const { event } = CalendarUtils.parseICSString(master.ics);
  return {
    ...occurrence,
    isCancelled: event.component.getFirstPropertyValue('status') === 'CANCELLED',
  };
}

function deleteRole(occurrence: EventOccurrence): DeleteRole {
  if (!occurrence.isMine && canRespondToEvent(occurrence)) return 'guest';
  return occurrence.isMine && hasGuests(occurrence) ? 'organizer' : 'own';
}

/** `skipped` counts selected events left out as read-only, which the dialog mentions. */
export async function deleteEvents(occurrences: EventOccurrence[], skipped = 0) {
  try {
    const targets = (await Promise.all(occurrences.map(deleteTarget))).filter(Boolean);
    if (targets.length === 0) return;

    const choice = showDeleteDialog(
      targets.map((target) => ({
        title: target.occurrence.title || localized('(No title)'),
        role: deleteRole(
          targets.length === 1 && isSeries(target)
            ? wholeEventOccurrence(target)
            : target.occurrence
        ),
        eventId: target.master.id,
        day: isSeries(target)
          ? DateUtils.dayString(momentOf(target.occurrence.startDate))
          : undefined,
      })),
      { series: targets.length === 1 && isSeries(targets[0]), skipped }
    );
    if (choice === 'cancel') return;

    if (choice === 'all-occurrences') {
      await deleteEntireEvent(targets[0]);
      return;
    }

    const byMaster = new Map<string, DeleteTarget[]>();
    for (const target of targets) {
      byMaster.set(target.master.id, [...(byMaster.get(target.master.id) || []), target]);
    }
    for (const group of byMaster.values()) {
      if (isSeries(group[0])) {
        if (!deleteOccurrences(group[0].master, group)) showOccurrenceNotFoundError();
      } else {
        await deleteEntireEvent(group[0]);
      }
    }
  } catch (error) {
    console.error('Failed to delete event:', error);
    AppEnv.showErrorDialog({
      title: localized('Delete Failed'),
      message: localized('Failed to delete the event. Please try again.'),
    });
  }
}

/**
 * Cancels occurrences of one series on its master and queues one syncback task. Null, with
 * nothing queued, when an occurrence can't be found in the series.
 */
export function deleteOccurrences(
  masterEvent: Event,
  targets: Pick<DeleteTarget, 'occurrence' | 'event'>[]
): SyncbackEventTask | null {
  const undoData = captureEventSnapshot(masterEvent);
  let ics = masterEvent.ics;
  for (const { occurrence, event } of targets) {
    // On Google a guest's EXDATE reaches the organizer as a decline of that date.
    if (!occurrence.isException) {
      ics = ICSEventHelpers.addExclusionDate(
        ics,
        occurrenceStartUnix(occurrence),
        occurrence.isAllDay
      );
      continue;
    }
    const recurrenceId = event.isRecurrenceException()
      ? event.recurrenceId
      : occurrenceRecurrenceId(occurrence).toICALString();
    const updated = ICSEventHelpers.removeInlineException(ics, recurrenceId);
    if (updated === ics) {
      // The row and its master disagree about which occurrence this is. Both live in one
      // resource, so a DELETE would take the series; refuse rather than guess.
      return null;
    }
    ics = updated;
  }

  masterEvent.ics = ICSEventHelpers.bumpEventSequence(ics);
  const task = SyncbackEventTask.forUpdating({
    event: masterEvent,
    undoData,
    description: localized('Delete occurrence'),
  });
  Actions.queueTask(task);
  return task;
}

/** On Google a guest's DELETE tells the organizer nothing, but a declined copy does. */
async function deleteEntireEvent(target: DeleteTarget) {
  const { master: event, occurrence } = target;
  const myEmail =
    deleteRole(wholeEventOccurrence(target)) === 'guest' && myAttendeeEmail(occurrence);
  if (myEmail && EventRSVPTask.calendarWriteSendsReply(event.accountId)) {
    await recordAndSendRSVP({ event, myEmail, status: 'DECLINED', recurrenceId: null });
  }
  Actions.queueTask(DestroyEventTask.forRemoving({ events: [event] }));
}
