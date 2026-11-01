import { ComponentRegistry } from 'mailspring-exports';
import OpenTrackingIcon from './open-tracking-icon';
import OpenTrackingMessageStatus from './open-tracking-message-status';

export function activate() {
  ComponentRegistry.register(OpenTrackingIcon, { role: 'ThreadListIcon' });
  ComponentRegistry.register(OpenTrackingMessageStatus, { role: 'MessageHeaderStatus' });
}

export function serialize() {}

export function deactivate() {
  ComponentRegistry.unregister(OpenTrackingIcon);
  ComponentRegistry.unregister(OpenTrackingMessageStatus);
}
