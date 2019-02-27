import utf7 from 'utf7';
import Task from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';

export default class SyncbackCategoryTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    path: Attributes.String({
      modelKey: 'path',
    }),
    existingPath: Attributes.String({
      modelKey: 'existingPath',
    }),
    created: Attributes.Object({
      modelKey: 'created',
    }),
  });

  path: string;
  existingPath: string;
  created: object;

  static forCreating({ name, accountId }: { name: string; accountId: string }) {
    return new SyncbackCategoryTask({
      path: utf7.imap.encode(name),
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
      path: utf7.imap.encode(newName),
      accountId: accountId,
    });
  }

  label() {
    return this.existingPath
      ? localized(`Renaming %@`, utf7.imap.decode(this.existingPath))
      : localized(`Creating %@`, utf7.imap.decode(this.path));
  }
}
