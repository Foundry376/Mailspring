import Task from './task';
import Attributes from '../attributes';

export default class ResendDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    })
  });

  constructor({ messageIds = [], ...rest } = {}) {
    super(rest);
    this.messageIds = Array.isArray(messageIds) ? messageIds : [messageIds];
    if (this.canBeUndone) {
      this.canBeUndone = false;
    }
  }

  label() {
    if (this.messageIds.length > 1) {
      return `Resending ${this.messageIds.length} drafts`;
    }
    return 'Resending draft';
  }
  description() {
    return this.label();
  }

  onError({ key, debuginfo, retryable }) {
    if (retryable) {
      console.warn(`Resending draft failed because ${debuginfo}`);
      return;
    }
  }
}
