import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import AccountSidebar from './components/account-sidebar';
import { activateMboxExportRunner, deactivateMboxExportRunner } from './mbox-export-runner';

export function activate(state) {
  ComponentRegistry.register(AccountSidebar, { location: WorkspaceStore.Location.RootSidebar });
  activateMboxExportRunner();
}

export function deactivate(state) {
  ComponentRegistry.unregister(AccountSidebar);
  deactivateMboxExportRunner();
}
