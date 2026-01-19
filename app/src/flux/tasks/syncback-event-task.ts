import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';

/**
 * Snapshot of event data for undo support.
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
    taskDescription: Attributes.String({
      modelKey: 'taskDescription',
    }),
  };

  event: Event;
  calendarId: string;
  undoData?: EventSnapshot;
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
    return new SyncbackEventTask({
      event,
      calendarId: event.calendarId,
      accountId: event.accountId,
      undoData,
      taskDescription: description,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackEventTask.attributes> = {}) {
    super(data);
  }

  get canBeUndone(): boolean {
    return !!this.undoData;
  }

  description(): string | null {
    return this.taskDescription || null;
  }

  createUndoTask(): SyncbackEventTask {
    if (!this.undoData) {
      throw new Error('SyncbackEventTask: Cannot create undo task without undoData');
    }

    // Create a new event with the original state restored
    const restoredEvent = this.event.clone();
    restoredEvent.ics = this.undoData.ics;
    restoredEvent.recurrenceStart = this.undoData.recurrenceStart;
    restoredEvent.recurrenceEnd = this.undoData.recurrenceEnd;

    // The undo task's undoData is the current state (for redo)
    const undoTaskUndoData: EventSnapshot = {
      ics: this.event.ics,
      recurrenceStart: this.event.recurrenceStart,
      recurrenceEnd: this.event.recurrenceEnd,
    };

    return new SyncbackEventTask({
      event: restoredEvent,
      calendarId: this.calendarId,
      accountId: this.accountId,
      undoData: undoTaskUndoData,
      taskDescription: localized('Undo %@', this.taskDescription || localized('event change')),
    });
  }

  label() {
    return localized('Saving event...');
  }
}
