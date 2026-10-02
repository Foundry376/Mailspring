import React from 'react';
import {
  localized,
  AccountStore,
  TaskFactory,
  MailboxPerspective,
  Actions,
} from 'mailspring-exports';
import SearchQuerySubscription from './search-query-subscription';

class SearchMailboxPerspective extends MailboxPerspective {
  searchQuery: string;
  sourcePerspective: MailboxPerspective;
  name: string;

  constructor(sourcePerspective, searchQuery: string) {
    super(sourcePerspective.accountIds);
    if (typeof searchQuery !== 'string') {
      throw new Error('SearchMailboxPerspective: Expected a `string` search query');
    }

    this.searchQuery = searchQuery;

    if (sourcePerspective instanceof SearchMailboxPerspective) {
      this.sourcePerspective = sourcePerspective.sourcePerspective;
    } else {
      this.sourcePerspective = sourcePerspective;
    }

    this.name = `Searching ${this.sourcePerspective.name}`;
  }

  emptyMessage() {
    const inTrash = this.isSearchingTrash();

    return (
      <span>
        {localized('No search results')}
        {!inTrash && (
          <div>
            <a
              className="btn"
              style={{ fontWeight: 'normal' }}
              onClick={() =>
                Actions.searchQuerySubmitted(`${this.searchQuery} (in:trash OR in:spam)`)
              }
            >
              {localized('Search messages in trash and spam')}
            </a>
          </div>
        )}
      </span>
    );
  }

  isSearchingTrash() {
    return /in: ?['"]?(trash|spam)/gi.test(this.searchQuery);
  }

  isEqual(other) {
    return super.isEqual(other) && other.searchQuery === this.searchQuery;
  }

  threads() {
    // If your query doesn't explicitly ask for results in trash or in spam, we exclude
    // them to increase the quality of results, and a button in the empty state (above)
    // allows you to switch to showing trash results.
    let finalQuery = this.searchQuery.trim();
    if (!this.isSearchingTrash()) {
      finalQuery = `(${finalQuery}) NOT (in:trash OR in:spam)`;
    }

    return new SearchQuerySubscription(finalQuery, this.accountIds);
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  // Search results span every folder, so "remove" takes the account's usual archive or
  // trash action without scoping it to a folder: the engine moves every copy outside Sent
  // and Drafts. On Gmail the archive destination is the All Mail folder, where the message
  // already is, so archiving has to go through TaskFactory's label removal instead.
  tasksForRemovingItems(threads, source = 'Dragged out of list') {
    return TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const dest = AccountStore.accountForId(accountId)?.preferredRemovalDestination();
      if (!dest) {
        return [];
      }
      if (dest.role === 'trash') {
        return TaskFactory.tasksForMovingToTrash({ threads: accountThreads, source });
      }
      return TaskFactory.tasksForArchiving({ threads: accountThreads, source });
    });
  }
}

export default SearchMailboxPerspective;
