import { Task } from './task';
import * as Attributes from '../attributes';
import { Event } from '../models/event';
import { AttributeValues } from '../models/model';
import { localized } from '../../intl';
import {
  Actions,
  DatabaseChangeRecord,
  DatabaseStore,
  ICSEventHelpers,
  ICSParticipantStatus,
} from 'mailspring-exports';

/**
 * Snapshot of event data for undo/redo support.
 * Contains only the fields needed to restore the event state.
 */
interface EventSnapshot {
  ics: string;
  recurrenceStart: number;
  recurrenceEnd: number;
}

/** An answer to an invitation, kept so it can be made again on a copy that changed under it. */
export interface RSVPAnswer {
  email: string;
  status: ICSParticipantStatus;
  /** The invitation to one occurrence, when only that occurrence was answered. */
  occurrenceIcs?: string;
  /** Set on the write made again, which is not retried a second time. */
  retried?: boolean;
}

const FRESH_COPY_TIMEOUT_MS = 30 * 1000;

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
    rsvp: Attributes.Obj({
      modelKey: 'rsvp',
    }),
  };

  event: Event;
  calendarId: string;
  undoData?: EventSnapshot;
  newData?: EventSnapshot;
  taskDescription?: string;
  rsvp?: RSVPAnswer;

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

  /**
   * Records our answer to an invitation on our copy of the event. Not undoable: the REPLY
   * emailed beside it cannot be retracted.
   */
  static forAnswering({ event, answer }: { event: Event; answer: RSVPAnswer }) {
    return new SyncbackEventTask({
      event,
      calendarId: event.calendarId,
      accountId: event.accountId,
      rsvp: answer,
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

  // The engine's read-back after the PUT (DAVWorker::writeAndResyncEvent) updates only this row.
  // A series' exception rows, and any exception this write added, arrive with the next full sync.
  async onSuccess() {
    AppEnv.mailsyncBridge.sendSyncCalendarNow(this.accountId);
  }

  // Keys from TaskProcessor::perform{Local,Remote}SyncbackEvent and DAVWorker::writeAndResyncEvent.
  // Only the network ones (etag-conflict, no-calendar, not-found) leave the rejected edit on screen.
  async onError({ key, debuginfo }: { key: string; debuginfo: string }) {
    if (key === 'etag-conflict' && this.rsvp && !this.rsvp.retried) {
      if (await this._answerAgainOnCurrentCopy()) return;
    }
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

  /**
   * An invitation update reaches our copy on the server before the engine's periodic sync shows
   * it, so an answer given in between is refused as an etag-conflict. Our answer is the only
   * change this write made, so it is made once more on the copy the server holds now. False
   * when that copy did not arrive or no longer lists us.
   */
  async _answerAgainOnCurrentCopy(): Promise<boolean> {
    const current = await this._nextCopyOfEvent();
    if (!current) return false;
    const { email, status, occurrenceIcs } = this.rsvp;
    const ics = occurrenceIcs
      ? ICSEventHelpers.updateOccurrenceAttendeeStatus(current.ics, occurrenceIcs, email, status)
      : ICSEventHelpers.updateAttendeeStatus(current.ics, email, status);
    if (!ics) return false;
    const event = current.clone();
    event.ics = ics;
    Actions.queueTask(
      SyncbackEventTask.forAnswering({ event, answer: { ...this.rsvp, retried: true } })
    );
    return true;
  }

  // Asks the engine to re-read the calendar, and resolves with the event as that sync stores it.
  _nextCopyOfEvent(): Promise<Event | null> {
    return new Promise((resolve) => {
      const finish = (event: Event | null) => {
        clearTimeout(timer);
        unlisten();
        resolve(event);
      };
      const timer = setTimeout(() => finish(null), FRESH_COPY_TIMEOUT_MS);
      const unlisten = DatabaseStore.listen((record: DatabaseChangeRecord<Event>) => {
        if (record.type !== 'persist' || record.objectClass !== Event.name) return;
        const stored = record.objects.find((e) => e.id === this.event.id);
        if (stored) finish(stored);
      });
      AppEnv.mailsyncBridge.sendSyncCalendarNow(this.accountId);
    });
  }
}
