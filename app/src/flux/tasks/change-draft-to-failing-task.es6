import Task from './task';
import Attributes from '../attributes';

export default class ChangeDraftToFailingTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    })
  });

  constructor({ messageIds = [], ...rest } = {}) {
    super(rest);
    this.messageIds = Array.isArray(messageIds) ? messageIds : [messageIds];
    if (this.canBeUndone ) {
      this.canBeUndone = false;
    }
  }

  label() {
    return 'Drafts set to failing';
  }
  description() {
    return this.label();
  }

  onError({ key, debuginfo, retryable }) {
    if (retryable) {
      console.warn(`Failing draft failed because ${debuginfo}`);
      return;
    }
  }
}
