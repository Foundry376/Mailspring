import Task from './task';
import Attributes from '../attributes';

export default class TrashFromSenderTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    aid: Attributes.String({
      modelKey: 'aid',
    }),
    email: Attributes.String({
      modelKey: 'email',
    }),
  });
  constructor({ accountId, email, ...rest } = {}) {
    super(rest);
    this.aid = accountId;
    this.email = email;
  }

  label() {
    return `trash from sender`;
  }

  get accountId() {
    return this.aid;
  }

  onError(err) {
    // noop
  }

  onSuccess() {
    // noop
  }
}
