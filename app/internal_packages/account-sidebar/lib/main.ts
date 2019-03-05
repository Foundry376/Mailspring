import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import AccountSidebar from './components/account-sidebar';

export function activate(state) {
  ComponentRegistry.register(AccountSidebar, { location: WorkspaceStore.Location.RootSidebar });
}

export function deactivate(state) {
  ComponentRegistry.unregister(AccountSidebar);
}
