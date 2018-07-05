import _ from 'underscore';
import {
  Actions,
  Thread,
  DatabaseStore,
  SearchQueryParser,
  ComponentRegistry,
  MutableQuerySubscription,
} from 'mailspring-exports';

class SearchQuerySubscription extends MutableQuerySubscription {
  constructor(searchQuery, accountIds) {
    super(null, { emitResultSet: true });
    this._searchQuery = searchQuery;
    this._accountIds = accountIds;

    this._connections = [];
    this._extDisposables = [];

    _.defer(() => this.performSearch());
  }

  replaceRange = () => {
    // TODO
  };

  performSearch() {
    this.performLocalSearch();
    this.performExtensionSearch();
  }

  performLocalSearch() {
    let dbQuery = DatabaseStore.findAll(Thread);
    if (this._accountIds.length === 1) {
      dbQuery = dbQuery.where({ accountId: this._accountIds[0] });
    }

    try {
      const parsedQuery = SearchQueryParser.parse(this._searchQuery);
      dbQuery = dbQuery.structuredSearch(parsedQuery);
    } catch (e) {
      console.info('Failed to parse local search query, falling back to generic query', e);
      dbQuery = dbQuery.search(this._searchQuery);
    }
    dbQuery = dbQuery
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(1000);

    console.log(dbQuery.sql());

    dbQuery.then(results => {
      Actions.searchCompleted();
      this.replaceQuery(dbQuery);
    });
  }

  _addThreadIdsToSearch(ids = []) {
    const currentResults = this._set && this._set.ids().length > 0;
    let searchIds = ids;
    if (currentResults) {
      const currentResultIds = this._set.ids();
      searchIds = _.uniq(currentResultIds.concat(ids));
    }
    const dbQuery = DatabaseStore.findAll(Thread)
      .where({ id: searchIds })
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
