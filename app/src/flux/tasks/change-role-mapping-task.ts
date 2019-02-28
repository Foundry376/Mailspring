import Task from './task';
import Attributes from '../attributes';
import { localized } from '../../intl';

export default class ChangeRoleMappingTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    path: Attributes.String({
      modelKey: 'path',
    }),
    role: Attributes.String({
      modelKey: 'role',
    }),
  });

  path: string;
  role: string;

  label() {
    return localized(`Changing folder mapping...`);
  }
}
