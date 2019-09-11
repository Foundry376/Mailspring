import { WorkspaceStore, ComponentRegistry, Actions } from 'mailspring-exports';
import OutboxList from './outbox-list';
import OutboxListToolbar from './outbox-list-toolbar';
import { OutboxDeleteButton, ReSendButton } from './outbox-toolbar-buttons';

export function activate() {
  // WorkspaceStore.defineSheet('Outbox', { root: true }, { split: ['RootSidebar', 'Outbox', 'OutboxMessage'] });
  if (
    AppEnv.savedState.perspective &&
    AppEnv.savedState.perspective.type === 'OutboxMailboxPerspective'
  ) {
    Actions.selectRootSheet(WorkspaceStore.Sheet.Outbox);
  }

  ComponentRegistry.register(OutboxList, { location: WorkspaceStore.Location.Outbox });
  ComponentRegistry.register(OutboxListToolbar, {
    location: WorkspaceStore.Location.Outbox.Toolbar,
    role: 'OutboxListToolbar',
  });
  ComponentRegistry.register(OutboxDeleteButton, { role: 'OutboxActionsToolbarButton' });
  ComponentRegistry.register(ReSendButton, { role: 'OutboxActionsToolbarButton' });
}

export function deactivate() {
  ComponentRegistry.unregister(OutboxList);
  ComponentRegistry.unregister(OutboxListToolbar);
  ComponentRegistry.unregister(ReSendButton);
  ComponentRegistry.unregister(OutboxDeleteButton);
}
