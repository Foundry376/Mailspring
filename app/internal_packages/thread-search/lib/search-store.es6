import MailspringStore from 'mailspring-store';
import { Actions, AccountStore, FocusedPerspectiveStore } from 'mailspring-exports';
import _ from 'underscore';
import SearchMailboxPerspective from './search-mailbox-perspective';

// Stores should closely match the needs of a particular part of the front end.
// For example, we might create a "MessageStore" that observes this store
// for changes in selectedThread, "DatabaseStore" for changes to the underlying database,
// and vends up the array used for that view.

class SearchStore extends MailspringStore {
  constructor() {
    super();

    this._searchQuery = FocusedPerspectiveStore.current().searchQuery || '';
    this._isSearching = false;

    this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
    this.listenTo(Actions.searchQuerySubmitted, this._onQuerySubmitted);
    this.listenTo(Actions.searchQueryChanged, this._onQueryChanged);
    this.listenTo(Actions.searchCompleted, this._onSearchCompleted);
  }

  query() {
    return this._searchQuery;
  }

  queryPopulated() {
    return this._searchQuery && this._searchQuery.trim().length > 0;
  }

  isSearching() {
    return this._isSearching;
  }

  _onSearchCompleted = () => {
    this._isSearching = false;
    this.trigger();
  };

  _onPerspectiveChanged = () => {
    this._searchQuery = FocusedPerspectiveStore.current().searchQuery || '';
    this.trigger();
  };

  _onQueryChanged = query => {
    this._searchQuery = query;
    this.trigger();
    this._processAndSubmitQuery();
  };

  _processAndSubmitQuery = _.throttle(() => {
    const current = FocusedPerspectiveStore.current();

    if (this.queryPopulated()) {
      this._isSearching = true;
      if (this._perspectiveBeforeSearch == null) {
        this._perspectiveBeforeSearch = current;
      }
      const next = new SearchMailboxPerspective(current, this._searchQuery.trim());
      Actions.focusMailboxPerspective(next);
    } else if (current instanceof SearchMailboxPerspective) {
      if (this._perspectiveBeforeSearch) {
        Actions.focusMailboxPerspective(this._perspectiveBeforeSearch);
        this._perspectiveBeforeSearch = null;
      } else {
        Actions.focusDefaultMailboxPerspectiveForAccounts(AccountStore.accounts());
      }
    }
  }, 500);

  _onQuerySubmitted = query => {
    this._searchQuery = query;
    this.trigger();
    this._processAndSubmitQuery();
  };
}

export default new SearchStore();
