import { Task } from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';

export class DestroyDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
  });

  messageIds: string[];

  label() {
    return localized('Deleting draft');
  }
}
