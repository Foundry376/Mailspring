import Task from './task';
import Attributes from '../attributes';

export default class ExpungeThreadsTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    source: Attributes.String({
      modelKey: 'source',
    })
  });

  constructor(data = {}) {
    data.canBeUndone = true;
    super(data);
    this.threadIds = data.threadIds || [];
    this.accountId = data.accountId || '';
    this.source = data.source || '';
  }

  label() {
    return 'Expunging thread from mailbox';
  }

  description() {
    if (this.taskDescription) {
      return this.taskDescription;
    }

    if (this.threadIds.length > 1) {
      return `Expunged ${this.threadIds.length} threads`;
    }
    return `Expunged thread`;
  }
}