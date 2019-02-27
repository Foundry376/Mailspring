import Model from './model';
import Attributes from '../attributes';

export default class SetObservableRangeTask extends Model {
  static attributes = Object.assign({}, Model.attributes, {
    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
    accountId: Attributes.String({
      modelKey: 'accountId',
    }),
    type: Attributes.String({
      modelKey: 'type',
    }),
  });

  constructor({
                threadIds = [],
                messageIds = [],
                accountId,
                ...rest
              } = {}) {
    super(rest);
    this.threadIds = threadIds;
    this.messageIds = messageIds;
    this.accountId = accountId;
    this.type = 'observed-ids';
  }
  toJSON(){
    return {
      type: this.type,
      threadIds: this.threadIds,
      messageIds: this.messageIds
    };
  }
}
