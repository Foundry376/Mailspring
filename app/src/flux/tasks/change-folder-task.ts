import { ChangeMailTask } from './change-mail-task';
import * as Attributes from '../attributes';
import { Folder } from '../models/folder';
import { localized } from '../../intl';
import { Message } from '../models/message';
import { Thread } from '../models/thread';
import { AttributeValues } from '../models/model';

let CategoryStore = null;

/** The folder each copy of a message was shown in before a move, one entry per copy. */
export type SourceFoldersByMessageId = { [messageId: string]: string[] };

/*
Public: Moves threads or messages to a folder.

A message can have a copy in several folders at once, so the task describes which copies
move. The engine decides per placement:

  - destination role trash or spam: every placement of every message moves.
  - otherwise: placements in `sourceFolderIds` if given, else every placement whose
    folder role is not `sent` or `drafts`.

Callers with a perspective (the mailbox the user is looking at) pass that folder as
`sourceFolderIds`; TaskFactory, mail rules and MCP have none and omit it. The destination
is never a meaningful source, so the constructor drops it from `sourceFolderIds` (a Gmail
perspective on All Mail can otherwise produce a move to All Mail scoped to All Mail).

Undo: during its local phase the engine records the folder each copy it moved came from as
`undoPlacements` (`{ messageId: [folderId, ...] }`) on this task, the same way
`DestroyDraftTask` receives `stubIds`. `createUndoTasks()` copies that map onto the undo
task as `restorePlacements`, scoped to this task's destination, and the engine moves one
copy from the destination back to each recorded folder. `undoPlacements` is only present on the task version streamed back from the engine
(`UndoRedoStore` waits for the local phase before building the undo task), and is `{}` when
the move selected no copy. When it never arrives, the undo is approximated from the folders the threads were in when the task was
built (see `createUndoTasks`).
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
  undoPlacements?: SourceFoldersByMessageId;
  restorePlacements?: SourceFoldersByMessageId;

  engineWritesUndoData = true;

  // Folders each thread or message was in when the task was built, keyed by id. Not
  // serialized: it only backs the approximate undo used when the engine never reports
  // `undoPlacements`, and models built from JSON (engine echoes, redo copies) have none.
  _foldersAtCreation: { [itemId: string]: Folder[] } = {};

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
    this.sourceFolderIds = (this.sourceFolderIds || []).filter(
      (id) => id && id !== this.folder?.id
    );

    for (const thread of data.threads || []) {
      this._foldersAtCreation[thread.id] = (thread.folders || []).filter(
        (f) => f instanceof Folder
      );
    }
    for (const message of data.messages || []) {
      if (message instanceof Message) {
        this._foldersAtCreation[message.id] = message
          .categories()
          .filter((c): c is Folder => c instanceof Folder);
      }
    }
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

  // Returns the single undo task, for callers that cannot queue several; the approximate
  // undo of a multi-source move needs one task per source folder and is only reachable
  // through `createUndoTasks()`.
  createUndoTask(): this {
    const tasks = this.createUndoTasks();
    if (tasks.length !== 1) {
      throw new Error(`ChangeFolderTask: undo needs ${tasks.length} tasks; use createUndoTasks()`);
    }
    return tasks[0];
  }

  createUndoTasks(): this[] {
    if (this.undoPlacements) {
      // An empty map is the engine reporting that the move selected no copy, so there is
      // nothing to send back. `folder` only describes the undo to the user: the engine
      // sends each copy to its recorded folder. None being known means they have all been
      // deleted.
      const folder = this._firstRestoreFolder();
      if (!folder) {
        return [];
      }
      const task = super.createUndoTask();
      task.folder = folder;
      task.sourceFolderIds = [this.folder.id];
      task.restorePlacements = this.undoPlacements;
      return [task];
    }

    // The engine has not reported what it moved (offline, or it never ran). The move can
    // still be reversed approximately by sending the copies now in the destination back
    // to where each item came from: the folder the task was scoped to, else the folder
    // the item was in when the task was built, one undo task per distinct folder.
    const scopedSource = this._singleSourceFolder();
    const groups = new Map<string, { folder: Folder; itemIds: string[] }>();
    for (const itemId of [...this.threadIds, ...this.messageIds]) {
      const folder = scopedSource || this._approximateRestoreFolderFor(itemId);
      if (!folder) {
        continue;
      }
      const group = groups.get(folder.id) || { folder, itemIds: [] };
      group.itemIds.push(itemId);
      groups.set(folder.id, group);
    }
    return [...groups.values()].map(({ folder, itemIds }) => {
      const task = super.createUndoTask();
      task.folder = folder;
      task.sourceFolderIds = [this.folder.id];
      task.threadIds = itemIds.filter((id) => this.threadIds.includes(id));
      task.messageIds = itemIds.filter((id) => this.messageIds.includes(id));
      return task;
    });
  }

  // The folder an item most plausibly left: one the move was scoped to, else one the
  // engine would have taken by default (not Sent or Drafts), else any it was in.
  _approximateRestoreFolderFor(itemId: string): Folder | null {
    const candidates = (this._foldersAtCreation[itemId] || []).filter(
      (f) => f.id !== this.folder.id
    );
    const scoped = candidates.filter((f) => this.sourceFolderIds.includes(f.id));
    const takenByDefault = candidates.filter((f) => !['sent', 'drafts'].includes(f.role));
    return scoped[0] || takenByDefault[0] || candidates[0] || null;
  }

  _singleSourceFolder(): Folder | null {
    if (!this.sourceFolderIds || this.sourceFolderIds.length !== 1) {
      return null;
    }
    return this._folderById(this.sourceFolderIds[0]);
  }

  _firstRestoreFolder(): Folder | null {
    for (const folderIds of Object.values(this.undoPlacements || {})) {
      for (const folderId of folderIds) {
        const folder = this._folderById(folderId);
        if (folder) {
          return folder;
        }
      }
    }
    return null;
  }

  _folderById(folderId: string): Folder | null {
    if (!this.accountId) {
      return null;
    }
    CategoryStore = CategoryStore || require('../stores/category-store').default;
    const category = CategoryStore.byId(this.accountId, folderId);
    return category instanceof Folder ? category : null;
  }
}
