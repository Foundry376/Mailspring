import { Task } from './task';
import { Folder } from '../models/folder';
import Attributes from '../attributes';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';

export class ExpungeAllInFolderTask extends Task {
  static attributes = {
    ...Task.attributes,

    folder: Attributes.Object({
      modelKey: 'folder',
      itemClass: Folder,
    }),
  };

  folder: Folder;

  constructor(data: AttributeValues<typeof ExpungeAllInFolderTask.attributes> = {}) {
    super(data);
  }

  label() {
    return localized(
      `Deleting all messages in %@`,
      this.folder ? this.folder.displayName : 'unknown'
    );
  }
}
