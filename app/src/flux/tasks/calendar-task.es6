import Task from './task';
import Attributes from '../attributes';
import Message from '../models/message';

export default class CalendarTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    replyToMessageId: Attributes.String({
      modelKey: 'replyToMessageId',
    }),
    targetStatus: Attributes.Number({
      modelKey: 'targetStatus',
    }),
    draft: Attributes.Object({
      modelKey: 'draft',
      itemClass: Message
    }),
  });
  constructor({ accountId, messageId, draft, targetStatus, ...rest } = {}) {
    super(rest);
    this.accountId = accountId || '';
    this.draft = draft;
    this.replyToMessageId = messageId;
    this.targetStatus = targetStatus;
  }

  label() {
    return `Calendar event`;
  }
}
