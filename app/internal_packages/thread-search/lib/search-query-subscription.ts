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

type SyncProcess = ReturnType<typeof AppEnv.mailsyncBridge.clients>[string];

class SearchQuerySubscription extends MutableQuerySubscription<Thread> {
  _searchQuery: string;
  _accountIds: string[];
  _connections = [];
  _extDisposables = [];
  _searching = false;
  _haveLocalResults = false;
  _parsedQuery = null;
  // searchId -> the account and the sync process the request went to
  _remoteSearches = new Map<string, { accountId: string; client: SyncProcess }>();
  _remoteThreadIds = new Set<string>();
  _remoteUnlisteners: (() => void)[] = [];

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
    this._remoteUnlisteners = [
      Actions.remoteSearchResultReceived.listen(this._onRemoteSearchResult),
      Actions.mailsyncProcessExited.listen(this._onSyncProcessExited),
    ];
    for (const accountId of this._accountIds) {
      const account = AccountStore.accountForId(accountId);
      // sendMessageToAccount shows the "unable to sync" dialog for an account whose sync
      // process is not running; a search is silent about it and skips the account.
      const client = this.runningSyncProcess(accountId);
      if (!account || !client) {
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
      this._remoteSearches.set(searchId, { accountId, client });
      AppEnv.mailsyncBridge.sendMessageToAccount(accountId, {
        type: 'search-remote',
        searchId,
        ...request,
      });
    }
  }

  runningSyncProcess(accountId: string): SyncProcess | null {
    const client = AppEnv.mailsyncBridge.clients()[accountId];
    return client && client.spawned ? client : null;
  }

  _onRemoteSearchResult = (result: {
    id: string;
    done: boolean;
    threadIds?: string[];
    error?: string;
  }) => {
    if (!this._remoteSearches.has(result.id)) {
      return;
    }
    if (result.done) {
      this._remoteSearches.delete(result.id);
      this._completeWhenAnswered();
    }
    const added = (result.threadIds || []).filter((id) => !this._remoteThreadIds.has(id));
    if (added.length === 0) {
      return;
    }
    added.forEach((id) => this._remoteThreadIds.add(id));
    this.performLocalSearch();
  };

  // A process that exited answers none of the searches it was sent, or the searching
  // indicator would stay on. Matched by process: a replaced one may exit after its successor
  // has been sent a search.
  _onSyncProcessExited = (client: SyncProcess) => {
    for (const [searchId, sent] of this._remoteSearches) {
      if (sent.client === client) {
        this._remoteSearches.delete(searchId);
      }
    }
    this._completeWhenAnswered();
  };

  _createResultAndTrigger() {
    super._createResultAndTrigger();
    this._haveLocalResults = true;
    this._completeWhenAnswered();
  }

  // The searching indicator stays on until the local results are in and every server
  // asked has answered: a server can take 10 s or more (Yahoo, live 2026-10-25), and its
  // matches join the list when they arrive.
  _completeWhenAnswered() {
    if (this._searching && this._haveLocalResults && this._remoteSearches.size === 0) {
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
    this._remoteUnlisteners.forEach((unlisten) => unlisten());
    this._remoteUnlisteners = [];
    for (const [searchId, { accountId }] of this._remoteSearches) {
      if (!this.runningSyncProcess(accountId)) {
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
