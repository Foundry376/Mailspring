import { React, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import TitleSearchBar from './title-search-bar';
import ThreadSearchBar from './thread-search-bar';

export function activate() {
  ComponentRegistry.register(TitleSearchBar, {
    location: WorkspaceStore.Location.ThreadList.Toolbar,
    role: 'Search-Bar'
  });
  ComponentRegistry.register(ThreadSearchBar, {
    location: WorkspaceStore.Location.QuickSidebar.Toolbar,
    role: 'Search-Bar'
  });
}

export function deactivate() {
  ComponentRegistry.unregister(TitleSearchBar);
  ComponentRegistry.unregister(ThreadSearchBar);
}
