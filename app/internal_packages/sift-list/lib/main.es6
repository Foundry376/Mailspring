import { WorkspaceStore, ComponentRegistry, Actions } from 'mailspring-exports';
import SiftList from './sift-list';
import SiftListToolbar from './sift-list-toolbar';
import { SiftButton } from './sift-list-toolbar-buttons';

export function activate() {
  if (
    AppEnv.savedState.perspective &&
    AppEnv.savedState.perspective.type === 'SiftMailboxPerspective'
  ) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Sift);
  }

  ComponentRegistry.register(SiftList, { location: WorkspaceStore.Location.SiftList });
  ComponentRegistry.register(SiftListToolbar, {
    location: WorkspaceStore.Location.SiftList.Toolbar,
    role: 'SiftListToolbar',
  });
  ComponentRegistry.register(SiftButton, { role: 'SiftListActionsToolbarButton' });
}

export function deactivate() {
  ComponentRegistry.unregister(SiftList);
  ComponentRegistry.unregister(SiftListToolbar);
  ComponentRegistry.unregister(SiftButton);
}
