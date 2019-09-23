import Task from './task';
import Attributes from '../attributes';

export default class ChangeDraftToFailingTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    headerMessageIds: Attributes.Collection({
      modelKey: 'headerMessageIds',
    })
  });

  constructor({ messages = [], ...rest } = {}) {
    super(rest);
    this.headerMessageIds = [];
    if (messages) {
      this.messages = messages;
      if (Array.isArray(messages)) {
        this.headerMessageIds = this.headerMessageIds.concat(
          ...messages.map(msg => {
            return msg.headerMessageId;
          })
        );
      } else {
        this.headerMessageIds.push(messages.headerMessageId);
      }
    }
    if (this.canBeUndone) {
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
