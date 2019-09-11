import {
  ComponentRegistry,
  WorkspaceStore,
} from 'mailspring-exports';
import OutboxMessage from './outbox-message';
import { OutboxMessageButtons } from './outbox-toolbar-buttons';

export function activate() {
  if (AppEnv.isMainWindow()) {
    // Register Message List Actions we provide globally
    ComponentRegistry.register(OutboxMessage, {
      location: WorkspaceStore.Location.OutboxMessage,
    });
    ComponentRegistry.register(OutboxMessageButtons, {
      role: 'OutboxMessageToolbar',
    });
  }
}

export function deactivate() {
  ComponentRegistry.unregister(OutboxMessage);
  ComponentRegistry.unregister(OutboxMessageButtons);
}
