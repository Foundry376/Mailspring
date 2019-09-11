import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import AppMessageToast from './app-message-toast';

export function activate() {
  if (AppEnv.isMainWindow()) {
    console.log('app message toast activated');
    ComponentRegistry.register(AppMessageToast, {
      location: WorkspaceStore.Sheet.Global.Toolbar.Left,
    });
  }
}

export function deactivate() {
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.unregister(AppMessageToast);
  }
}
