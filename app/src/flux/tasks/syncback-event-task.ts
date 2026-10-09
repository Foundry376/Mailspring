import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';
import { bumpEventSequenceUp } from '../../ics-event-helpers';

/**
 * Snapshot of event data for undo/redo support.
 * Contains only the fields needed to restore the event state.
 */
interface EventSnapshot {
  ics: string;
  recurrenceStart: number;
  recurrenceEnd: number;
}

// Event id to the ICS this window last queued for it. Undo and redo re-send a snapshot that can be
// several revisions behind, and Google answers 409 to a SEQUENCE below the one it holds.
const latestQueuedIcs = new Map<string, string>();

export class SyncbackEventTask extends Task {
  static attributes = {
    ...Task.attributes,

    event: Attributes.Obj({
      modelKey: 'event',
      itemClass: Event,
    }),
    calendarId: Attributes.String({
      modelKey: 'calendarId',
    }),
    /** Original event data for undo - if provided, task can be undone */
    undoData: Attributes.Obj({
      modelKey: 'undoData',
    }),
    /** New event data captured at task creation - used for redo */
    newData: Attributes.Obj({
      modelKey: 'newData',
    }),
    taskDescription: Attributes.String({
      modelKey: 'taskDescription',
    }),
  };

  event: Event;
  calendarId: string;
  undoData?: EventSnapshot;
  newData?: EventSnapshot;
  taskDescription?: string;

  static forCreating({
    event,
    calendarId,
    accountId,
  }: {
    event: Event;
    calendarId: string;
    accountId: string;
  }) {
    return new SyncbackEventTask({
      event,
      calendarId,
      accountId,
      // Creating events cannot be undone via this mechanism
      // (would need DestroyEventTask)
    });
  }

  static forUpdating({
    event,
    undoData,
    description,
  }: {
    event: Event;
    /** Original event state to enable undo. If not provided, task cannot be undone. */
    undoData?: EventSnapshot;
    /** Description for the undo toast (e.g., "Move event") */
    description?: string;
  }) {
    // Capture the new state at task creation time for reliable redo
    const newData: EventSnapshot = {
      ics: event.ics,
      recurrenceStart: event.recurrenceStart,
      recurrenceEnd: event.recurrenceEnd,
    };
    latestQueuedIcs.set(event.id, event.ics);

    return new SyncbackEventTask({
      event,
      calendarId: event.calendarId,
      accountId: event.accountId,
      undoData,
      newData,
      taskDescription: description,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackEventTask.attributes> = {}) {
    super(data);
    // canBeUndone is computed from undoData presence
    this.canBeUndone = !!this.undoData;
  }

  description(): string | null {
    return this.taskDescription || null;
  }

  /**
   * Creates an undo task that restores the event to its previous state, as a revision past the
   * copy last queued.
   *
   * Note: This relies on Event.clone() creating a deep clone. If Event.clone()
   * were shallow, modifications to restoredEvent would leak to this.event,
   * breaking undo/redo. The Model base class provides deep cloning via toJSON/fromJSON.
   */
  createUndoTask(): SyncbackEventTask {
    if (!this.undoData) {
      throw new Error('SyncbackEventTask: Cannot create undo task without undoData');
    }

    // Create a new event with the original state restored (deep clone)
    const restoredEvent = this.event.clone();
    restoredEvent.ics = bumpEventSequenceUp(this.undoData.ics, latestQueuedIcs.get(this.event.id));
    latestQueuedIcs.set(restoredEvent.id, restoredEvent.ics);
    restoredEvent.recurrenceStart = this.undoData.recurrenceStart;
    restoredEvent.recurrenceEnd = this.undoData.recurrenceEnd;

    // The undo task's undoData is the new state (from our snapshot),
    // and its newData is the old state (what we're restoring to)
    return new SyncbackEventTask({
      event: restoredEvent,
      calendarId: this.calendarId,
      accountId: this.accountId,
      undoData: this.newData, // New state becomes undo data for redo-of-undo
      newData: this.undoData, // Old state becomes new data (what we're applying)
      taskDescription: localized('Undo %@', this.taskDescription || localized('event change')),
    });
  }

  /**
   * Creates the redo task: the captured newData snapshot, as a revision past the copy last
   * queued. The snapshot keeps redo reliable even if the event object has been mutated since
   * task creation.
   */
  createIdenticalTask(): this {
    if (!this.newData) {
      // Fall back to default behavior for tasks without newData (e.g., forCreating)
      return super.createIdenticalTask();
    }

    // Create a fresh event with the new state from our snapshot
    const redoEvent = this.event.clone();
    redoEvent.ics = bumpEventSequenceUp(this.newData.ics, latestQueuedIcs.get(this.event.id));
    latestQueuedIcs.set(redoEvent.id, redoEvent.ics);
    redoEvent.recurrenceStart = this.newData.recurrenceStart;
    redoEvent.recurrenceEnd = this.newData.recurrenceEnd;

    return new SyncbackEventTask({
      event: redoEvent,
      calendarId: this.calendarId,
      accountId: this.accountId,
      undoData: this.undoData,
      newData: this.newData,
      taskDescription: this.taskDescription,
    }) as this;
  }

  label() {
    return localized('Saving event...');
  }

  // The engine's read-back after the PUT (DAVWorker::writeAndResyncEvent) updates only this row.
  // A series' exception rows, and any exception this write added, arrive with the next full sync.
  async onSuccess() {
    AppEnv.mailsyncBridge.sendSyncCalendarNow(this.accountId);
  }

  // Keys from TaskProcessor::perform{Local,Remote}SyncbackEvent and DAVWorker::writeAndResyncEvent.
  // Only the network ones (etag-conflict, no-calendar, not-found) leave the rejected edit on screen.
  onError({ key, debuginfo }: { key: string; debuginfo: string }) {
    const messages: { [key: string]: string } = {
      'etag-conflict': localized(
        'This event was changed by another client. Refresh the calendar and make your change again.'
      ),
      'ics-incomplete': localized(
        'This series already has modified occurrences on the server. Refresh the calendar and edit it again.'
      ),
      'invalid-ics': localized('The event could not be read.'),
      'no-calendar': localized('The calendar this event belongs to is no longer available.'),
      'not-found': localized('This event no longer exists.'),
    };
    AppEnv.showErrorDialog(
      {
        title: localized('Unable to save event'),
        message: messages[key] || `${localized('An unknown error has occurred')}: ${key}`,
      },
      { detail: debuginfo }
    );
  }
}
