import React, { Component } from 'react';
import ThreadSearchBar from './thread-search-bar';
import { HasTutorialTip } from 'mailspring-component-kit';
import SearchStore from './search-store';
import { ListensToFluxStore } from 'mailspring-component-kit';
import { FocusedPerspectiveStore } from 'mailspring-exports';

const ThreadSearchBarWithTip = HasTutorialTip(ThreadSearchBar, {
  title: 'Search with ease',
  instructions: (
    <span>
      Combine your search queries with Gmail-style terms like <strong>in: folder</strong> and{' '}
      <strong>since: "last month"</strong> to find anything in your mailbox.
    </span>
  ),
});

class TitleSearchBar extends Component {
  static displayName = 'TitleSearchBar';

  render() {
    const current = FocusedPerspectiveStore.current();
    let title = '';
    if (current && current.threadTitleName) {
      title = current.threadTitleName;
    } else if (current && current.displayName) {
      title = current.displayName;
    } else if (current) {
      title = current.name;
    }
    return (
      <div className="title-search-bar">
        <div className='thread-title'>
          <h1>{title}</h1>
        </div>
      </div>
    );
  }
}


export default ListensToFluxStore(TitleSearchBar, {
  stores: [SearchStore, FocusedPerspectiveStore],
  getStateFromStores() {
    return {
      query: SearchStore.query(),
      isSearching: SearchStore.isSearching(),
      perspective: FocusedPerspectiveStore.current(),
    };
  },
});
