import React from 'react';
import {
  localized,
  MailboxPerspective,
  AccountStore,
  TaskFactory,
  Folder,
  ChangeLabelsTask,
  ChangeFolderTask,
  CategoryStore,
} from 'mailspring-exports';
import SearchQuerySubscription from './search-query-subscription';

class SavedSearchMailboxPerspective extends MailboxPerspective {
  searchQuery: string;
  savedSearchId: string;

  constructor(
    accountIds: string[],
    searchQuery: string,
    savedSearchName: string,
    savedSearchId: string
  ) {
    super(accountIds);
    this.searchQuery = searchQuery;
    this.name = savedSearchName;
    this.iconName = 'searchloupe.png';
    this.savedSearchId = savedSearchId;
  }

  toJSON() {
    const json: any = super.toJSON();
    json.searchQuery = this.searchQuery;
    json.savedSearchName = this.name;
    json.savedSearchId = this.savedSearchId;
    return json;
  }

  isEqual(other) {
    return super.isEqual(other) && other.searchQuery === this.searchQuery;
  }

  threads() {
    let finalQuery = this.searchQuery.trim();
    if (!/in: ?['"]?(trash|spam)/gi.test(finalQuery)) {
      finalQuery = `(${finalQuery}) NOT (in:trash OR in:spam)`;
    }
    return new SearchQuerySubscription(finalQuery, this.accountIds);
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  emptyMessage() {
    return <span>{localized('No messages match this saved search')}</span>;
  }

  tasksForRemovingItems(threads, source?: string) {
    return TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const account = AccountStore.accountForId(accountId);
      if (!account) {
        return [];
      }
      const dest = account.preferredRemovalDestination();
      if (!dest) {
        return [];
      }
      if (dest instanceof Folder) {
        return new ChangeFolderTask({
          threads: accountThreads,
          source: 'Removed from saved search',
          folder: dest,
        });
      }
      if (dest.role === 'all') {
        return new ChangeLabelsTask({
          threads: accountThreads,
          source: 'Removed from saved search',
          labelsToRemove: [CategoryStore.getInboxCategory(accountId)],
        });
      }
      throw new Error('Unexpected destination returned from preferredRemovalDestination()');
    });
  }
}

export default SavedSearchMailboxPerspective;
