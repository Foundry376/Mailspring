import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import DatabaseStore from './database-store';
import Thread from '../models/thread';
import ThreadCounts from '../models/thread-counts';
import ThreadCategory from '../models/thread-category';
import AccountStore from '../stores/account-store';
import CategoryStore from '../stores/category-store';

class ThreadCountsStore extends MailspringStore {
  constructor() {
    super();
    this._counts = {};

    if (AppEnv.isMainWindow()) {
      // For now, unread counts are only retrieved in the main window.
      this._onCountsChangedDebounced = _.throttle(this._onCountsChanged, 1000);
      DatabaseStore.listen(change => {
        if (
          change.objectClass === ThreadCounts.name ||
          change.objectClass === ThreadCategory.name ||
          change.objectClass === Thread.name
        ) {
          this._onCountsChangedDebounced();
        }
      });
      this._onCountsChangedDebounced();
    }
  }

  _onCountsChanged = () => {
    DatabaseStore._query('SELECT * FROM `ThreadCounts`').then(results => {
      const nextCounts = {};
      for (const { categoryId, unread, total } of results) {
        nextCounts[categoryId] = { unread, total };
      }
      if (_.isEqual(nextCounts, this._counts)) {
        return;
      }
      this._counts = nextCounts;
      this.trigger();
    });
  };

  unreadCountForCategoryId(catId) {
    if (this._counts[catId] === undefined) {
      return null;
    }
    return this._counts[catId]['unread'];
  }
  unreadCountForAccountId(accountId){
    const account = AccountStore.accountForId(accountId);
    if (!account) {
      return 0;
    }
    if (account.provider === 'gmail') {
      const category = CategoryStore.getAllMailCategory(accountId);
      if (!category) {
        return 0;
      }
      if(!this._counts[category.id]){
        return 0;
      }
      return this._counts[category.id]['unread'];
    } else {
      const categories = CategoryStore.categories(accountId);
      let sum = 0;
      categories.forEach(cat => {
        if (cat && !['spam', 'trash', 'draft'].includes(cat.role)) {
          if (this._counts[cat.id]) {
            sum += this._counts[cat.id]['unread'];
          }
        }
      });
      return sum;
    }
  }

  totalCountForCategoryId(catId) {
    if (this._counts[catId] === undefined) {
      return null;
    }
    return this._counts[catId]['total'];
  }
}

export default new ThreadCountsStore();
