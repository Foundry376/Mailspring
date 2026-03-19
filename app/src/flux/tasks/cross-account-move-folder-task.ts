import { Task } from './task';
import { Folder } from '../models/folder';
import { Thread } from '../models/thread';
import * as Attributes from '../attributes';
import { AttributeValues } from '../models/model';

// Public: A task that moves or copies threads from one account to another.
// This task is dispatched to the TARGET account's sync process, which is
// responsible for appending the messages to the target folder via IMAP.
// If `deleteFromSource` is true, the source threads will be moved to trash
// on the source account after the copy completes.
//
// NOTE: Sync engine support for this task type must be added separately.
// Until then, the task will be queued and the sync engine will handle it
// once the corresponding C++ implementation is available.
export class CrossAccountMoveFolderTask extends Task {
  static attributes = {
    ...Task.attributes,

    threads: Attributes.Collection({
      modelKey: 'threads',
      itemClass: Thread,
    }),
    targetFolder: Attributes.Obj({
      modelKey: 'targetFolder',
      itemClass: Folder,
    }),
    targetAccountId: Attributes.String({
      modelKey: 'targetAccountId',
    }),
    deleteFromSource: Attributes.Boolean({
      modelKey: 'deleteFromSource',
    }),
  };

  threads: Thread[];
  targetFolder: Folder;
  targetAccountId: string;
  deleteFromSource: boolean;

  constructor(
    data: AttributeValues<typeof CrossAccountMoveFolderTask.attributes> & {
      threads?: Thread[];
    } = {}
  ) {
    super(data);
  }

  get accountId() {
    return this.targetAccountId;
  }

  label() {
    const count = this.threads ? this.threads.length : 0;
    const dest = this.targetFolder ? this.targetFolder.displayName : 'folder';
    if (this.deleteFromSource) {
      return `Moving ${count} thread(s) to ${dest} in another account`;
    }
    return `Copying ${count} thread(s) to ${dest} in another account`;
  }

  description() {
    return this.label();
  }
}
