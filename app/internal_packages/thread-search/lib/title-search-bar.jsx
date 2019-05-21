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
    let label = '';
    if (current.unread || current.starred || current.drafts) {
      label = current.name;
    }
    else if (current && current._categories && current._categories.length && current._categories[0].displayName) {
      label = current._categories[0].displayName
    } else {
      current && (current.displayName ? current.displayName : current.name);
    }
    return (
      <div className="title-search-bar">
        <div className='thread-title'>
          <h1>{label}</h1>
        </div>
      </div>
    )
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
