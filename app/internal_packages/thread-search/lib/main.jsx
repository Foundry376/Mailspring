import { React, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import TitleSearchBar from './title-search-bar';
import ThreadSearchBar from './thread-search-bar';

export function activate() {
  ComponentRegistry.register(TitleSearchBar, {
    location: WorkspaceStore.Location.ThreadList.Toolbar,
    role: 'Search-Bar'
  });
  ComponentRegistry.register(ThreadSearchBar, {
    locations: [
      WorkspaceStore.Location.MessageList.Toolbar,
      WorkspaceStore.Location.ThreadList.Toolbar
    ],
  });
}

export function deactivate() {
  ComponentRegistry.unregister(TitleSearchBar);
  ComponentRegistry.unregister(ThreadSearchBar);
}
