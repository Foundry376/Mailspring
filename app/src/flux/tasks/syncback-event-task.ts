import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';

/**
 * Snapshot of event data for undo/redo support.
 * Contains only the fields needed to restore the event state.
 */
interface EventSnapshot {
  ics: string;
  recurrenceStart: number;
  recurrenceEnd: number;
}

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
   * Creates an undo task that restores the event to its previous state.
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
    restoredEvent.ics = this.undoData.ics;
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
   * Creates an identical task for redo.
   * Uses the captured newData snapshot to ensure reliable redo even if
   * the event object has been mutated since task creation.
   */
  createIdenticalTask(): this {
    if (!this.newData) {
      // Fall back to default behavior for tasks without newData (e.g., forCreating)
      return super.createIdenticalTask();
    }

    // Create a fresh event with the new state from our snapshot
    const redoEvent = this.event.clone();
    redoEvent.ics = this.newData.ics;
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
}
