import _ from 'underscore';
import {
  Actions,
  Thread,
  DatabaseStore,
  CategoryStore,
  SearchQueryParser,
  ComponentRegistry,
  MutableQuerySubscription,
  IMAPSearchQueryBackend,
  IMAPSearchTask,
} from 'mailspring-exports';

class SearchQuerySubscription extends MutableQuerySubscription {
  constructor(searchQuery, accountIds) {
    super(null, { emitResultSet: true });
    this._searchQuery = searchQuery;
    this._accountIds = accountIds;

    this._connections = [];
    this._extDisposables = [];
    this._searching = false;

    _.defer(() => this.performSearch());
  }

  replaceRange = () => {
    // TODO
  };

  performSearch() {
    this._searching = true;
    this.performLocalSearch();
    this.performExtensionSearch();
  }

  performLocalSearch() {
    let dbQuery = DatabaseStore.findAll(Thread);
    if (this._accountIds.length === 1) {
      dbQuery = dbQuery.where({ accountId: this._accountIds[0] });
    }
    let parsedQuery = null;
    try {
      parsedQuery = SearchQueryParser.parse(this._searchQuery);
      dbQuery = dbQuery.structuredSearch(parsedQuery);
    } catch (e) {
      console.info('Failed to parse local search query, falling back to generic query', e);
      dbQuery = dbQuery.search(this._searchQuery);
    }
    dbQuery = dbQuery
      .background()
      .where({state: 0})
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(1000);
    this._performRemoteSearch({accountIds: this._accountIds, parsedQuery, searchQuery: this._searchQuery});
    this.replaceQuery(dbQuery);
  }

  _performRemoteSearch = ({ accountIds, parsedQuery = null, searchQuery = '' } = {}) => {
      let queryJSON = '{}';
      let genericText = '';
      if (parsedQuery) {
        queryJSON = JSON.stringify(parsedQuery);
        genericText = IMAPSearchQueryBackend.folderNamesForQuery(parsedQuery);
      } else {
        genericText = searchQuery;
      }
      const tasks = [];
      accountIds.forEach( accountId => {
        const all = CategoryStore.getCategoryByRole(accountId, 'inbox');
        if (all) {
          tasks.push(
            new IMAPSearchTask({
              accountId,
              fullTextSearch: genericText,
              paths: [all],
              query: queryJSON,
            })
          );
        }
      });
      Actions.remoteSearch(tasks);
    };

  _createResultAndTrigger() {
    super._createResultAndTrigger();
    if (this._searching) {
      this._searching = false;
      Actions.searchCompleted();
    }
  }

  _addThreadIdsToSearch(ids = []) {
    const currentResults = this._set && this._set.ids().length > 0;
    let searchIds = ids;
    if (currentResults) {
      const currentResultIds = this._set.ids();
      searchIds = _.uniq(currentResultIds.concat(ids));
    }
    const dbQuery = DatabaseStore.findAll(Thread)
      .where({ id: searchIds, state: 0 })
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending());
    this.replaceQuery(dbQuery);
  }

  performRemoteSearch() {
    // TODO: Perform IMAP search here.
    //
    // This is temporarily disabled because we support Gmail's
    // advanced syntax locally (eg: in: inbox, is:unread), and
    // search message bodies, so local search is pretty much
    // good enough for v1. Come back and implement this soon!
    //
  }

  performExtensionSearch() {
    const searchExtensions = ComponentRegistry.findComponentsMatching({
      role: 'SearchBarResults',
    });

    this._extDisposables = searchExtensions.map(ext => {
      return ext.observeThreadIdsForQuery(this._searchQuery).subscribe((ids = []) => {
        const allIds = _.compact(_.flatten(ids));
        if (allIds.length === 0) return;
        this._addThreadIdsToSearch(allIds);
      });
    });
  }

  onLastCallbackRemoved() {
    this._connections.forEach(conn => conn.end());
    this._extDisposables.forEach(disposable => disposable.dispose());
  }
}

export default SearchQuerySubscription;
