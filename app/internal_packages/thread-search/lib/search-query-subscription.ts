import _ from 'underscore';
import {
  Actions,
  Thread,
  Utils,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  SearchQueryParser,
  ComponentRegistry,
  MutableQuerySubscription,
  RemoteSearchQueryBackend,
} from 'mailspring-exports';

class SearchQuerySubscription extends MutableQuerySubscription<Thread> {
  _searchQuery: string;
  _accountIds: string[];
  _connections = [];
  _extDisposables = [];
  _searching = false;
  _parsedQuery = null;
  _remoteSearches = new Map<string, string>();
  _remoteThreadIds = new Set<string>();
  _remoteUnlisten: () => void = null;

  constructor(searchQuery: string, accountIds: string[]) {
    super(null, { emitResultSet: true });
    this._searchQuery = searchQuery;
    this._accountIds = accountIds;

    _.defer(() => this.performSearch());
  }

  replaceRange = () => {
    // TODO
  };

  performSearch() {
    this._searching = true;
    let parsedQuery = null;
    try {
      parsedQuery = SearchQueryParser.parse(this._searchQuery);
    } catch (e) {
      console.info('Failed to parse local search query, falling back to generic query', e);
    }
    this._parsedQuery = parsedQuery;
    this.performLocalSearch();
    this.performRemoteSearch();
    this.performExtensionSearch();
  }

  performLocalSearch() {
    let dbQuery = DatabaseStore.findAll<Thread>(Thread);
    if (this._accountIds.length === 1) {
      dbQuery = dbQuery.where({ accountId: this._accountIds[0] });
    }
    if (this._parsedQuery) {
      dbQuery = dbQuery.structuredSearch(this._parsedQuery, [...this._remoteThreadIds]);
    } else {
      dbQuery = dbQuery.search(this._searchQuery);
    }
    dbQuery = dbQuery
      .background()
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(1000);

    this.replaceQuery(dbQuery);
  }

  // The local index holds message bodies only for recent mail, so the query also runs on
  // each account's server, whose matches join the local ones as they arrive.
  performRemoteSearch() {
    if (!this._parsedQuery || !AppEnv.mailsyncBridge) {
      return;
    }
    this._remoteUnlisten = Actions.remoteSearchResultReceived.listen(this._onRemoteSearchResult);
    for (const accountId of this._accountIds) {
      const account = AccountStore.accountForId(accountId);
      // sendMessageToAccount shows the "unable to sync" dialog for an account whose sync
      // process is not running; a search is silent about it and skips the account.
      if (!account || !this.hasSyncProcess(accountId)) {
        continue;
      }
      const request = RemoteSearchQueryBackend.compile(
        this._parsedQuery,
        account,
        CategoryStore.categories(accountId)
      );
      if (!request) {
        continue;
      }
      const searchId = Utils.generateTempId();
      this._remoteSearches.set(searchId, accountId);
      AppEnv.mailsyncBridge.sendMessageToAccount(accountId, {
        type: 'search-remote',
        searchId,
        ...request,
      });
    }
  }

  hasSyncProcess(accountId: string) {
    return !!AppEnv.mailsyncBridge.clients()[accountId];
  }

  _onRemoteSearchResult = (result: { id: string; done: boolean; threadIds?: string[] }) => {
    if (!this._remoteSearches.has(result.id)) {
      return;
    }
    if (result.done) {
      this._remoteSearches.delete(result.id);
    }
    const added = (result.threadIds || []).filter((id) => !this._remoteThreadIds.has(id));
    if (added.length === 0) {
      return;
    }
    added.forEach((id) => this._remoteThreadIds.add(id));
    this.performLocalSearch();
  };

  _createResultAndTrigger() {
    super._createResultAndTrigger();
    if (this._searching) {
      this._searching = false;
      Actions.searchCompleted();
    }
  }

  _addThreadIdsToSearch(ids: string[] = []) {
    const currentResults = this._set && this._set.ids().length > 0;
    let searchIds = ids;
    if (currentResults) {
      const currentResultIds = this._set.ids();
      searchIds = [...new Set(currentResultIds.concat(ids))];
    }
    const dbQuery = DatabaseStore.findAll<Thread>(Thread)
      .where({ id: searchIds })
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending());
    this.replaceQuery(dbQuery);
  }

  performExtensionSearch() {
    const searchExtensions = ComponentRegistry.findComponentsMatching({
      role: 'SearchBarResults',
    });

    this._extDisposables = searchExtensions.map((ext) => {
      return ext.observeThreadIdsForQuery(this._searchQuery).subscribe((ids = []) => {
        const allIds = ids.flat().filter(Boolean);
        if (allIds.length === 0) return;
        this._addThreadIdsToSearch(allIds);
      });
    });
  }

  onLastCallbackRemoved() {
    this._connections.forEach((conn) => conn.end());
    this._extDisposables.forEach((disposable) => disposable.dispose());
    if (this._remoteUnlisten) {
      this._remoteUnlisten();
    }
    for (const [searchId, accountId] of this._remoteSearches) {
      if (!this.hasSyncProcess(accountId)) {
        continue;
      }
      AppEnv.mailsyncBridge.sendMessageToAccount(accountId, {
        type: 'search-remote-cancel',
        searchId,
      });
    }
    this._remoteSearches.clear();
  }
}

export default SearchQuerySubscription;
