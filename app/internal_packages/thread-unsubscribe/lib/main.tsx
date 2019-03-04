import { ComponentRegistry } from 'mailspring-exports';
import ThreadUnsubscribeButton from './thread-unsubscribe-button';

export function activate() {
  ComponentRegistry.register(ThreadUnsubscribeButton, {
    role: 'message:BodyHeader',
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadUnsubscribeButton);
}
