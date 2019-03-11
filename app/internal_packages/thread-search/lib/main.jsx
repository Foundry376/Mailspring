import { React, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import TitleSearchBar from './title-search-bar';

export function activate() {
  ComponentRegistry.register(TitleSearchBar, {
    location: WorkspaceStore.Location.ThreadList.Toolbar,
    role: 'Search-Bar'
  });
}

export function deactivate() {
  ComponentRegistry.unregister(TitleSearchBar);
}
