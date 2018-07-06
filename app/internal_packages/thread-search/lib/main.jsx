import { React, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';

import ThreadSearchBar from './thread-search-bar';

const ThreadSearchBarWithTip = HasTutorialTip(ThreadSearchBar, {
  title: 'Search with ease',
  instructions: (
    <span>
      Combine your search queries with Gmail-style terms like <strong>in: folder</strong> and{' '}
      <strong>since: "last month"</strong> to find anything in your mailbox.
    </span>
  ),
});

export function activate() {
  ComponentRegistry.register(ThreadSearchBarWithTip, {
    location: WorkspaceStore.Location.ThreadList.Toolbar,
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadSearchBarWithTip);
}
