import { imapUtf7 } from '../../utils/imap-utf7';
import { Task } from './task';
import * as Attributes from '../attributes';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';
import { LocalizedErrorStrings } from '../../mailsync-process';

export class DestroyCategoryTask extends Task {
  static attributes = {
    ...Task.attributes,

    path: Attributes.String({
      modelKey: 'path',
    }),
  };

  path: string;

  constructor(data: AttributeValues<typeof DestroyCategoryTask.attributes> = {}) {
    super(data);
  }

  label() {
    return localized(`Deleting %@`, imapUtf7.decode(this.path));
  }

  // The engine leaves the folder's rows alone when a delete fails, so the folder stays in the
  // sidebar. Without this the delete just appears to do nothing.
  onError({ key, debuginfo }: { key: string; debuginfo: string }) {
    const name = imapUtf7.decode(this.path);
    let message: string;
    if (key === 'folder-has-role-children') {
      message = localized(
        'Nothing was deleted, because a folder inside %@ is one Mailspring uses for your mail, such as Sent, Trash or Snoozed. Move it out of %@ or choose a different folder in Preferences > Folders, then try again.',
        name,
        name
      );
    } else if (key === 'ErrorDelete') {
      message = localized('The mail server would not delete %@.', name);
      // Subfolders are deleted before their parent, so a refusal partway leaves some gone.
      if (/ - child /.test(debuginfo || '')) {
        message += ' ' + localized('Some of its subfolders may already have been deleted.');
      }
    } else if (LocalizedErrorStrings[key]) {
      message = LocalizedErrorStrings[key];
    } else {
      message = `${localized('An unknown error has occurred')}: ${key}`;
    }
    AppEnv.showErrorDialog(
      { title: localized('Unable to delete %@', name), message },
      { detail: debuginfo }
    );
  }
}
