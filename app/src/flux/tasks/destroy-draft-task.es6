import Task from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';

export default class DestroyDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
  });

  label() {
    return localized('Deleting draft');
  }
}
