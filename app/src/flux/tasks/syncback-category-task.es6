import utf7 from 'utf7';
import Task from './task';
import Attributes from '../attributes';

export default class SyncbackCategoryTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    path: Attributes.String({
      modelKey: 'path',
    }),
    bgColor: Attributes.String({
      modelKey: 'bgColor',
    }),
    existingPath: Attributes.String({
      modelKey: 'existingPath',
    }),
    created: Attributes.Object({
      modelKey: 'created',
    }),
  });

  static forCreating({ name, accountId, bgColor = 0 }) {
    return new SyncbackCategoryTask({
      path: utf7.imap.encode(name),
      bgColor: bgColor,
      accountId: accountId,
    });
  }

  static forRenaming({ path, accountId, newName }) {
    return new SyncbackCategoryTask({
      existingPath: path,
      path: utf7.imap.encode(newName),
      accountId: accountId,
    });
  }

  label() {
    return this.existingPath
      ? `Renaming ${utf7.imap.decode(this.existingPath)}`
      : `Creating ${utf7.imap.decode(this.path)}`;
  }
}
