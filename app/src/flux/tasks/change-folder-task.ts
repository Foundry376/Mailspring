import { ChangeMailTask } from './change-mail-task';
import * as Attributes from '../attributes';
import { Folder } from '../models/folder';
import { localized } from '../../intl';
import { Message } from '../models/message';
import { Thread } from '../models/thread';
import { AttributeValues } from '../models/model';

let CategoryStore = null;

/** One physical copy of a message, as recorded by the sync engine before a move. */
export interface Placement {
  folderId: string;
  remoteUID: number;
}

export type PlacementsByMessageId = { [messageId: string]: Placement[] };

/*
Public: Moves threads or messages to a folder.

A message can have a copy in several folders at once, so the task describes which copies
move. The engine decides per placement:

  - destination role trash or spam: every placement of every message moves.
  - otherwise: placements in `sourceFolderIds` if given, else every placement whose
    folder role is not `sent` or `drafts`.

Callers with a perspective (the mailbox the user is looking at) pass that folder as
`sourceFolderIds`; TaskFactory, mail rules and MCP have none and omit it.

Undo: during its local phase the engine records the placements it moved as
`undoPlacements` (`{ messageId: [{ folderId, remoteUID }] }`) on this task, the same way
`DestroyDraftTask` receives `stubIds`. `createUndoTask()` copies that map onto the undo
task as `restorePlacements`, and the engine moves each copy back to its original folder.
`undoPlacements` is only present on the task version streamed back from the engine
(`UndoRedoStore` waits for the local phase before building the undo task).
*/
export class ChangeFolderTask extends ChangeMailTask {
  static attributes = {
    ...ChangeMailTask.attributes,

    folder: Attributes.Obj({
      modelKey: 'folder',
      itemClass: Folder,
    }),
    sourceFolderIds: Attributes.Collection({
      modelKey: 'sourceFolderIds',
    }),
    undoPlacements: Attributes.Obj({
      modelKey: 'undoPlacements',
    }),
    restorePlacements: Attributes.Obj({
      modelKey: 'restorePlacements',
    }),
  };

  folder: Folder;
  sourceFolderIds: string[];
  undoPlacements?: PlacementsByMessageId;
  restorePlacements?: PlacementsByMessageId;

  constructor(
    data: AttributeValues<typeof ChangeFolderTask.attributes> & {
      threads?: Thread[];
      messages?: Message[];
    } = {}
  ) {
    super(data);

    if (this.folder && !(this.folder instanceof Folder)) {
      throw new Error(
        `ChangeFolderTask: You must provide a single folder. Got ${typeof this.folder}: ${JSON.stringify(this.folder)}`
      );
    }
    this.sourceFolderIds = (this.sourceFolderIds || []).filter(Boolean);
  }

  label() {
    if (this.folder) {
      return `Moving to ${this.folder.displayName}`;
    }
    return localized('Moving to folder');
  }

  description() {
    if (this.taskDescription) {
      return this.taskDescription;
    }

    const source = this._singleSourceFolder();
    if (this.threadIds.length > 1) {
      return source
        ? localized(
            `Moved %@ threads from %@ to %@`,
            this.threadIds.length,
            source.displayName,
            this.folder.displayName
          )
        : localized(`Moved %@ threads to %@`, this.threadIds.length, this.folder.displayName);
    } else if (this.messageIds.length > 1) {
      return source
        ? localized(
            `Moved %@ messages from %@ to %@`,
            this.messageIds.length,
            source.displayName,
            this.folder.displayName
          )
        : localized(`Moved %@ messages to %@`, this.messageIds.length, this.folder.displayName);
    }
    return source
      ? localized(`Moved from %@ to %@`, source.displayName, this.folder.displayName)
      : localized(`Moved to %@`, this.folder.displayName);
  }

  willBeQueued() {
    if (!this.folder) {
      throw new Error('Must specify a `folder`');
    }
    if (this.threadIds.length > 0 && this.messageIds.length > 0) {
      throw new Error('ChangeFolderTask: You can move `threads` or `messages` but not both');
    }
    if (this.threadIds.length === 0 && this.messageIds.length === 0) {
      throw new Error(
        'ChangeFolderTask: You must provide a `threads` or `messages` Array of models or IDs.'
      );
    }
    if (this.sourceFolderIds.includes(this.folder.id)) {
      throw new Error('ChangeFolderTask: `sourceFolderIds` must not contain the destination');
    }

    super.willBeQueued();
  }

  _isArchive() {
    return this.folder.name === 'archive' || this.folder.name === 'all';
  }

  // The engine fills `undoPlacements` as it runs; a re-queued copy must start empty so a
  // stale snapshot is never mistaken for this run's.
  createIdenticalTask(): this {
    const task = super.createIdenticalTask();
    delete task.undoPlacements;
    return task;
  }

  createUndoTask() {
    const task = super.createUndoTask();
    task.sourceFolderIds = [];

    if (this.undoPlacements && Object.keys(this.undoPlacements).length > 0) {
      task.restorePlacements = this.undoPlacements;
      // `folder` is what the undo describes to the user and what an engine without
      // per-placement restore would move to; the first recorded source is the best
      // single answer.
      task.folder = this._firstRestoreFolder() || this.folder;
      return task;
    }

    // The engine has not reported what it moved (offline, or it never ran). A move
    // scoped to one source folder can still be reversed approximately by moving the
    // copies now in the destination back to that folder.
    const source = this._singleSourceFolder();
    if (source) {
      task.folder = source;
      task.sourceFolderIds = [this.folder.id];
      return task;
    }

    throw new Error(
      'ChangeFolderTask: cannot build an undo task before the sync engine has recorded undoPlacements'
    );
  }

  _singleSourceFolder(): Folder | null {
    if (!this.sourceFolderIds || this.sourceFolderIds.length !== 1) {
      return null;
    }
    return this._folderById(this.sourceFolderIds[0]);
  }

  _firstRestoreFolder(): Folder | null {
    for (const placements of Object.values(this.undoPlacements || {})) {
      for (const { folderId } of placements) {
        const folder = this._folderById(folderId);
        if (folder) {
          return folder;
        }
      }
    }
    return null;
  }

  _folderById(folderId: string): Folder | null {
    CategoryStore = CategoryStore || require('../stores/category-store').default;
    const category = CategoryStore.byId(this.accountId, folderId);
    return category instanceof Folder ? category : null;
  }
}
