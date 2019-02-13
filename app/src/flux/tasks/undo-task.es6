import Task from './task';
import Attributes from '../attributes';
export default class UndoTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    referenceTaskId: Attributes.String({
      modelKey: 'refTaskId',
      jsonKey: 'refTaskId',
    }),
  });
  constructor({ referenceTaskId, accountId, ...rest } = {}) {
    super(rest);
    this.referenceTaskId = referenceTaskId;
    this.accountId = accountId;
  }
}
