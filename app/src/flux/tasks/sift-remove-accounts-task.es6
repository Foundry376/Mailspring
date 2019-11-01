import SiftTask from './sift-task';
import Attributes from '../attributes';

export default class SiftRemoveAccountsTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    accountIds: Attributes.Collection({
      modelKey: 'accountIds',
    }),
  });
  constructor({ accounts = [], accountIds = [], ...rest } = {}) {
    super(rest);
    if (Array.isArray(accountIds) && accountIds.length > 0) {
      this.accountIds = accountIds;
    } else if (Array.isArray(accounts) && accounts.length > 0) {
      this.accountIds = accounts.map(acct => acct.id);
    } else {
      this.accountIds = [];
    }
  }

  label() {
    return `Sift remove account`;
  }
}
