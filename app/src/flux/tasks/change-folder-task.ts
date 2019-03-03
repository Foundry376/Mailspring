import { ChangeMailTask } from './change-mail-task';
import Attributes from '../attributes';
import { Folder } from '../models/folder';
import { localized } from '../../intl';
import { Message } from '../models/Message';
import { Thread } from '../models/Thread';
import { AttributeValues } from '../models/model';

// Public: Create a new task to apply labels to a message or thread.
//
// Takes an options object of the form:
//   - folder: The {Folder} or {Folder} IDs to move to
//   - threads: An array of {Thread}s or {Thread} IDs
//   - threads: An array of {Message}s or {Message} IDs
//   - undoData: Since changing the folder is a destructive action,
//   undo tasks need to store the configuration of what folders messages
//   were in. When creating an undo task, we fill this parameter with
//   that configuration
//
export class ChangeFolderTask extends ChangeMailTask {
  static attributes = Object.assign({}, ChangeMailTask.attributes, {
    previousFolder: Attributes.Object({
      modelKey: 'previousFolder',
      itemClass: Folder,
    }),
    folder: Attributes.Object({
      modelKey: 'folder',
      itemClass: Folder,
    }),
  });

  previousFolder: Folder;
  folder: Folder;

  constructor(
    data: AttributeValues<typeof ChangeFolderTask.attributes> & {
      threads?: Thread[];
      messages?: Message[];
    }
  ) {
    if (!data.previousFolder) {
      const folders = [];
      for (const t of data.threads || []) {
        const f = t.folders.find(f => f.id !== data.folder.id) || t.folders[0];
        if (!folders.find(other => other.id === f.id)) {
          folders.push(f);
        }
      }
      for (const m of data.messages || []) {
        if (!folders.find(other => other.id === m.folder.id)) {
          folders.push(m.folder);
        }
      }
      /* TODO: Right now, each task must have a single undo task. With folder moves,
       * it's possible to start with mail from many folders and move it to one folder,
       * and a single task can't represent the reverse. Right now, such moves are
       * just undoable. Need to revisit this and make createUndoTask() return an array.
       */
      if (folders.length === 1) {
        data.previousFolder = folders[0];
        data.canBeUndone = true;
      } else {
        data.canBeUndone = false;
      }
    }

    super(data);

    if (this.folder && !(this.folder instanceof Folder)) {
      throw new Error('ChangeFolderTask: You must provide a single folder.');
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

    if (this.threadIds.length > 1) {
      return localized(`Moved %@ threads to %@`, this.threadIds.length, this.folder.displayName);
    } else if (this.messageIds.length > 1) {
      return localized(`Moved %@ messages to %@`, this.messageIds.length, this.folder.displayName);
    }
    return localized(`Moved to %@`, this.folder.displayName);
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

    super.willBeQueued();
  }

  _isArchive() {
    return this.folder.name === 'archive' || this.folder.name === 'all';
  }

  createUndoTask() {
    const task = super.createUndoTask();
    const { folder, previousFolder } = task;
    task.folder = previousFolder;
    task.previousFolder = folder;
    return task;
  }
}
