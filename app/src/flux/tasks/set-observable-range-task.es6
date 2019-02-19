import Task from './task';
import Attributes from '../attributes';
export default class SetObservableRangeTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
    conditionRelation: Attributes.String({
      modelKey: 'conditionRelation',
    }),
  });
  constructor({
    threadIds = [],
    messageIds = [],
    conditionRelation = 'or',
    accountId,
    ...rest
  } = {}) {
    super(rest);
    this.threadIds = threadIds;
    this.messageIds = messageIds;
    this.accountId = accountId;
    this.conditionRelation = conditionRelation;
  }
}
