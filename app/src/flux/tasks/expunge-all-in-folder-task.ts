import Task from './task';
import Folder from '../models/folder';
import Attributes from '../attributes';
import { localized } from '../../intl';

export default class ExpungeAllInFolderTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    folder: Attributes.Object({
      modelKey: 'folder',
      itemClass: Folder,
    }),
  });

  label() {
    return localized(
      `Deleting all messages in %@`,
      this.folder ? this.folder.displayName : 'unknown'
    );
  }
}
