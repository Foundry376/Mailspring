import { ComponentRegistry } from 'mailspring-exports';

import ImportanceComposerDropdown from './importance-composer-dropdown';

export function activate() {
  ComponentRegistry.register(ImportanceComposerDropdown, {
    role: 'Composer:FromFieldComponents',
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ImportanceComposerDropdown);
}

export function serialize() {
  return {};
}
