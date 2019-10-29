import SiftTask from './sift-task';
import Attributes from '../attributes';

export default class SiftUpdateAccountTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    account: Attributes.Object({
      modelKey: 'account',
    }),
  });
  constructor({ account = {}, ...rest } = {}) {
    super(rest);
    this.account = account;
  }

  label() {
    return `Sift remove account`;
  }
}
