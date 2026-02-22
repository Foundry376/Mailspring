import MailspringStore from 'mailspring-store';
import { AccountStore } from 'mailspring-exports';
import { Disposable } from 'event-kit';
import SavedSearchMailboxPerspective from './saved-search-mailbox-perspective';

const CONFIG_KEY = 'core.savedSearches';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  accountIds: string[];
}

class SavedSearchStore extends MailspringStore {
  _savedSearches: SavedSearch[] = [];
  _configSubscription: Disposable;

  constructor() {
    super();
    this._loadFromConfig();
    this._configSubscription = AppEnv.config.onDidChange(CONFIG_KEY, () => {
      this._loadFromConfig();
      this.trigger();
    });
  }

  _loadFromConfig() {
    const raw = AppEnv.config.get(CONFIG_KEY);
    this._savedSearches = Array.isArray(raw) ? raw : [];
  }

  savedSearches(): SavedSearch[] {
    return this._savedSearches;
  }

  savedSearchesForAccountIds(accountIds: string[]): SavedSearch[] {
    const idSet = new Set(accountIds);
    return this._savedSearches.filter((s) => s.accountIds.some((id) => idSet.has(id)));
  }

  hasSavedSearch(query: string, accountIds: string[]): boolean {
    const sortedIds = [...accountIds].sort().join(',');
    return this._savedSearches.some(
      (s) => s.query === query && [...s.accountIds].sort().join(',') === sortedIds
    );
  }

  findByQueryAndAccounts(query: string, accountIds: string[]): SavedSearch | undefined {
    const sortedIds = [...accountIds].sort().join(',');
    return this._savedSearches.find(
      (s) => s.query === query && [...s.accountIds].sort().join(',') === sortedIds
    );
  }

  addSavedSearch(query: string, accountIds: string[]): SavedSearch {
    const validAccountIds = accountIds.filter((id) => AccountStore.accountForId(id));
    const name = this._nameFromQuery(query);
    const savedSearch: SavedSearch = {
      id: generateId(),
      name,
      query,
      accountIds: validAccountIds,
    };
    const updated = [...this._savedSearches, savedSearch];
    AppEnv.config.set(CONFIG_KEY, updated);
    return savedSearch;
  }

  removeSavedSearch(id: string) {
    const updated = this._savedSearches.filter((s) => s.id !== id);
    AppEnv.config.set(CONFIG_KEY, updated);
  }

  renameSavedSearch(id: string, newName: string) {
    const updated = this._savedSearches.map((s) => (s.id === id ? { ...s, name: newName } : s));
    AppEnv.config.set(CONFIG_KEY, updated);
  }

  perspectiveForSearch(savedSearch: SavedSearch): SavedSearchMailboxPerspective {
    const validAccountIds = savedSearch.accountIds.filter((id) => AccountStore.accountForId(id));
    if (validAccountIds.length === 0) {
      return null;
    }
    return new SavedSearchMailboxPerspective(
      validAccountIds,
      savedSearch.query,
      savedSearch.name,
      savedSearch.id
    );
  }

  _nameFromQuery(query: string): string {
    let name = query.trim();
    if (name.length > 40) {
      name = name.substring(0, 37) + '...';
    }
    return name;
  }
}

function generateId(): string {
  return `saved-search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default new SavedSearchStore();
