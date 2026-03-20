import { Task } from './task';
import { Folder } from '../models/folder';
import { Thread } from '../models/thread';
import * as Attributes from '../attributes';
import { AttributeValues } from '../models/model';

// Public: A task that moves or copies threads from one account to another.
// The task is intercepted by CrossAccountMailStore (JS-side) before being
// forwarded to the sync engine. CrossAccountMailStore fetches the RFC2822
// source messages via GetMessageRFC2822Task, then performs an IMAP APPEND
// to the target folder on the target account.
// If `deleteFromSource` is true, the source threads are trashed on the
// source account after the copy completes.
export class CrossAccountMoveFolderTask extends Task {
  static attributes = {
    ...Task.attributes,

    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    sourceAccountId: Attributes.String({
      modelKey: 'sourceAccountId',
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

  threadIds: string[];
  sourceAccountId: string;
  targetFolder: Folder;
  targetAccountId: string;
  deleteFromSource: boolean;

  constructor(
    data: AttributeValues<typeof CrossAccountMoveFolderTask.attributes> & {
      threads?: Thread[];
    } = {}
  ) {
    super(data);
    if (data.threads && data.threads.length > 0 && !data.threadIds) {
      this.threadIds = data.threads.map(t => t.id);
      if (!data.sourceAccountId) {
        this.sourceAccountId = data.threads[0].accountId;
      }
    }
    if (data.targetAccountId) {
      this.accountId = data.targetAccountId;
    }
  }

  willBeQueued() {
    if (!this.threadIds || this.threadIds.length === 0) {
      throw new Error('CrossAccountMoveFolderTask: requires at least one thread ID.');
    }
    if (!this.sourceAccountId) {
      throw new Error('CrossAccountMoveFolderTask: requires sourceAccountId.');
    }
    if (!this.targetFolder) {
      throw new Error('CrossAccountMoveFolderTask: requires a targetFolder.');
    }
    if (!this.targetAccountId) {
      throw new Error('CrossAccountMoveFolderTask: requires targetAccountId.');
    }
    if (this.sourceAccountId === this.targetAccountId) {
      throw new Error(
        'CrossAccountMoveFolderTask: sourceAccountId and targetAccountId must differ.'
      );
    }
  }

  label() {
    const count = this.threadIds ? this.threadIds.length : 0;
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
