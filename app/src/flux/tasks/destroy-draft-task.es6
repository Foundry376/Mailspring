import Task from './task';
import Attributes from '../attributes';
import Actions from '../actions';

export default class DestroyDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
    canBeUndone: Attributes.Boolean({
      modelKey: 'canBeUndone',
    })
  });

  constructor({ messageIds = [], ...rest } = {}) {
    super(rest);
    this.messageIds = Array.isArray(messageIds) ? messageIds : [messageIds];
    if (this.canBeUndone === undefined) {
      this.canBeUndone = true;
    }
  }

  label() {
    if (this.messageIds.length > 1) {
      return `Deleting ${this.messageIds.length} drafts`;
    }
    return 'Deleting draft';
  }
  description() {
    return this.label();
  }

  onSuccess() {
    Actions.destroyDraftSucceeded({
      messageIds: this.messageIds,
    });
  }

  onError({ key, debuginfo, retryable }) {
    if (retryable) {
      console.warn(`Destroying draft failed because ${debuginfo}`);
      return;
    }
    Actions.destroyDraftFailed({
      key, debuginfo,
      messageIds: this.messageIds,
    });
  }
}
