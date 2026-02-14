import React from 'react';
import {
  localized,
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

  tasksForRemovingItems(threads, source?: string) {
    return TaskFactory.tasksForMovingToTrash({
      threads,
      source: source || 'Keyboard Shortcut',
    });
  }
}

export default SearchMailboxPerspective;
