import { Task } from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';

export class DestroyDraftTask extends Task {
  static attributes = {
    ...Task.attributes,

    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
  };

  messageIds: string[];

  constructor(data: AttributeValues<typeof DestroyDraftTask.attributes> = {}) {
    super(data);
  }

  label() {
    return localized('Deleting draft');
  }
}
