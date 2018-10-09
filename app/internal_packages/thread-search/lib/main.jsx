import {
  localizedReactFragment,
  localized,
  React,
  ComponentRegistry,
  WorkspaceStore,
} from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';

import ThreadSearchBar from './thread-search-bar';

const ThreadSearchBarWithTip = HasTutorialTip(ThreadSearchBar, {
  title: localized('Search with ease'),
  instructions: (
    <span>
      {localizedReactFragment(
        `Combine your search queries with Gmail-style terms like %@ and %@ to find anything in your mailbox.`,
        <strong>in: folder</strong>,
        <strong>since: "last month"</strong>
      )}
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
