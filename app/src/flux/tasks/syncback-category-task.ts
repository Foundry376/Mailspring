import { imapUtf7 } from '../../utils/imap-utf7';
import { Task } from './task';
import * as Attributes from '../attributes';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';

export class SyncbackCategoryTask extends Task {
  static attributes = {
    ...Task.attributes,

    path: Attributes.String({
      modelKey: 'path',
    }),
    existingPath: Attributes.String({
      modelKey: 'existingPath',
    }),
    created: Attributes.Obj({
      modelKey: 'created',
    }),
  };

  path: string;
  existingPath: string;
  created: any;

  static forCreating({ name, accountId }: { name: string; accountId: string }) {
    return new SyncbackCategoryTask({
      path: imapUtf7.encode(String(name)),
      accountId: accountId,
    });
  }

  static forRenaming({
    path,
    accountId,
    newName,
  }: {
    path: string;
    accountId: string;
    newName: string;
  }) {
    return new SyncbackCategoryTask({
      existingPath: path,
      path: imapUtf7.encode(String(newName)),
      accountId: accountId,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackCategoryTask.attributes> = {}) {
    super(data);
  }

  label() {
    return this.existingPath
      ? localized(`Renaming %@`, imapUtf7.decode(String(this.existingPath)))
      : localized(`Creating %@`, imapUtf7.decode(String(this.path)));
  }
}
