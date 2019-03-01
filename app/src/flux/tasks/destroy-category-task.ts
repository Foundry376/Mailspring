import utf7 from 'utf7';
import { Task } from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';

export class DestroyCategoryTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    path: Attributes.String({
      modelKey: 'path',
    }),
  });

  path: string;

  label() {
    return localized(`Deleting %@`, utf7.imap.decode(this.path));
  }
}
