const { ComponentRegistry } = require('mailspring-exports');
import EventHeader from './event-header';

export function activate() {
  ComponentRegistry.register(EventHeader, { role: 'message:BodyHeader' });
}

export function deactivate() {
  ComponentRegistry.unregister(EventHeader);
}
