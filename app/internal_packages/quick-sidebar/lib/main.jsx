import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import QuickSidebar from './quick-sidebar';

export function activate() {
  ComponentRegistry.register(QuickSidebar, {
    location: WorkspaceStore.Location.QuickSidebar
  });
}

export function deactivate() {
  ComponentRegistry.unregister(QuickSidebar);
}
