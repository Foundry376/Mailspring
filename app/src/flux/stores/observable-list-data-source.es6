import { ListTabular } from 'mailspring-component-kit';
import Actions from '../actions';
import SetObservableRangeTask from '../models/set-observable-range-task';
import Message from '../models/message';

/**
 This class takes an observable which vends QueryResultSets and adapts it so that
 you can make it the data source of a MultiselectList.

 When the MultiselectList is refactored to take an Observable, this class should
 go away!
 */
export default class ObservableListDataSource extends ListTabular.DataSource {
  constructor(resultSetObservable, setRetainedRange) {
    super();
    this._$resultSetObservable = resultSetObservable;
    this._setRetainedRange = setRetainedRange;
    this._countEstimate = -1;
    this._resultSet = null;
    this._resultDesiredLast = null;

    // Wait until a retained range is set before subscribing to result sets
  }

  _attach = () => {
    this._subscription = this._$resultSetObservable.subscribe(nextResultSet => {
      if (nextResultSet.range().end === this._resultDesiredLast) {
        this._countEstimate = Math.max(this._countEstimate, nextResultSet.range().end);
      } else {
        this._countEstimate = nextResultSet.range().end;
      }

      const previousResultSet = this._resultSet;
      this._resultSet = nextResultSet;

      // If the result set is derived from a query, remove any items in the selection
      // that do not match the query. This ensures that items "removed from the view"
      // are removed from the selection.
      const query = nextResultSet.query();
      if (query) {
        this.selection.removeItemsNotMatching(query.matchers());
      }

      this.trigger({ previous: previousResultSet, next: nextResultSet });
    });
  };

  setRetainedRange({ start, end }) {
    this._resultDesiredLast = end;
    this._setRetainedRange({ start, end });
    if (!this._subscription) {
      this._attach();
    }
  }

  // Retrieving Data

  count() {
    return this._countEstimate;
  }

  loaded() {
    return this._resultSet !== null;
  }

  empty = () => {
    return !this._resultSet || this._resultSet.empty();
  };

  get = offset => {
    if (!this._resultSet) {
      return null;
    }
    return this._resultSet.modelAtOffset(offset);
  };

  getById(id) {
    if (!this._resultSet) {
      return null;
    }
    return this._resultSet.modelWithId(id);
  }

  indexOfId(id) {
    if (!this._resultSet || !id) {
      return -1;
    }
    return this._resultSet.offsetOfId(id);
  }

  itemsCurrentlyInViewMatching(matchFn) {
    if (!this._resultSet) {
      return [];
    }
    return this._resultSet.models().filter(matchFn);
  }

  cleanup() {
    if (this._subscription) {
      this._subscription.dispose();
    }
    return super.cleanup();
  }

  setObservableRangeTask = ({ items }) => {
    let accounts = {};
    let idKey = 'id';
    let isItemsThread = true;
    let missingBodyMessages = [];
    if (items[Object.keys(items)[0]] instanceof Message) {
      idKey = 'threadId';
      isItemsThread = false;
    }
    Object.values(items).forEach(item => {
      if (!item) {
        return;
      }
      let idType = 'threadIds';
      let tmpId = idKey;
      if (item instanceof Message && item.draft) {
        idType = 'messageIds';
        tmpId = 'id';
      }
      if (accounts[item.accountId]) {
        accounts[item.accountId][idType][item[tmpId]] = 1;
      } else {
        accounts[item.accountId] = { messageIds: {}, threadIds: {} };
        const tmp = {};
        tmp[item[tmpId]] = 1;
        accounts[item.accountId][idType] = tmp;
      }
      if (isItemsThread) {
        if (item.__messages) {
          item.__messages.forEach(message => {
            if (message.snippet.length === 0) {
              missingBodyMessages.push(message);
            }
          });
        } else {
          console.warn('thread missing __messages, bodies not pre fetched');
        }
      } else {
        if (item.snippet.length === 0) {
          missingBodyMessages.push(item);
        }
      }
    });
    if (missingBodyMessages.length > 0) {
      Actions.fetchBodies({ messages: missingBodyMessages, source: 'thread' });
    }
    Object.keys(accounts).forEach(account => {
      const threadIds = Object.keys(accounts[account].threadIds);
      const messageIds = Object.keys(accounts[account].messageIds);
      Actions.setObservableRange(
        account,
        new SetObservableRangeTask({
          accountId: account,
          threadIds: threadIds,
          messageIds: messageIds,
        }),
      );
    });
  };
}
