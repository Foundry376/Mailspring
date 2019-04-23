import Task from './task';
import Attributes from '../attributes';

export default class DeleteThreadsTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    source: Attributes.String({
      modelKey: 'source',
    }),
    canBeUndone: Attributes.Boolean({
      modelKey: 'canBeUndone',
    }),
  });

  constructor(data = {}) {
    data.canBeUndone = true;
    super(data);
    this.threadIds = data.threadIds || [];
    this.accountId = data.accountId || '';
    this.source = data.source || '';
    if (this.canBeUndone === undefined){
      this.canBeUndone = true;
    }
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