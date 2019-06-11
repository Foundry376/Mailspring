import { Task } from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';

export class ChangeRoleMappingTask extends Task {
  static attributes = {
    ...Task.attributes,

    path: Attributes.String({
      modelKey: 'path',
    }),
    role: Attributes.String({
      modelKey: 'role',
    }),
  };

  path: string;
  role: string;

  constructor(data: AttributeValues<typeof ChangeRoleMappingTask.attributes> = {}) {
    super(data);
  }

  label() {
    return localized(`Changing folder mapping...`);
  }
}
