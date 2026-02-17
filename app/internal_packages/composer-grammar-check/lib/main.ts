import {
  localized,
  PreferencesUIStore,
  ComponentRegistry,
  ExtensionRegistry,
} from 'mailspring-exports';
import { GrammarCheckToggle } from './grammar-check-toggle';
import GrammarCheckComposerExtension from './grammar-check-extension';
import { GrammarCheckStore } from './grammar-check-store';

export function activate(state = {}) {
  this.state = state;

  GrammarCheckStore.activate();

  this.preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'Grammar',
    displayName: localized('Grammar'),
    componentClassFn: () => require('./preferences-grammar').default,
  });

  ComponentRegistry.register(GrammarCheckToggle, { role: 'Composer:ActionButton' });
  PreferencesUIStore.registerPreferencesTab(this.preferencesTab);
  ExtensionRegistry.Composer.register(GrammarCheckComposerExtension);
}

export function deactivate() {
  GrammarCheckStore.deactivate();
  ComponentRegistry.unregister(GrammarCheckToggle);
  PreferencesUIStore.unregisterPreferencesTab(this.preferencesTab.tabId);
  ExtensionRegistry.Composer.unregister(GrammarCheckComposerExtension);
}

export function serialize() {
  return this.state;
}
