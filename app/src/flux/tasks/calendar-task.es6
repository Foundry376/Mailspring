import Task from './task';
import Attributes from '../attributes';

export default class CalendarTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageId: Attributes.String({
      modelKey: 'messageId',
    }),
    targetStatus: Attributes.Number({
      modelKey: 'targetStatus',
    }),
    draft: Attributes.Object({
      modelKey: 'draft',
    }),
  });
  constructor({ accountId, messageId, draft, ...rest } = {}) {
    super(rest);
    this.accountId = accountId || '';
    this.draft = draft;
    this.messageId = messageId;
  }

  get messageId() {
    return this._messageId;
  }

  set messageId(value) {
    this._messageId = value;
  }

  label() {
    return `Calendar event`;
  }
}
