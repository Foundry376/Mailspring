import {
  localized,
  Actions,
  PreferencesUIStore,
  ComponentRegistry,
  ExtensionRegistry,
} from 'mailspring-exports';
import { GrammarCheckToggle } from './grammar-check-toggle';
import GrammarCheckComposerExtension from './grammar-check-extension';
import { GrammarCheckStore } from './grammar-check-store';
import {
  setGrammarCheckStore,
  clearGrammarCheckStore,
  cleanupDraft,
} from '../../../src/components/composer-editor/grammar-check-plugins';

function _onDraftClosed(headerMessageId: string) {
  GrammarCheckStore.clearDraft(headerMessageId);
  cleanupDraft(headerMessageId);
}

export function activate(state = {}) {
  this.state = state;

  GrammarCheckStore.activate();
  setGrammarCheckStore(GrammarCheckStore);

  this.preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'Grammar',
    displayName: localized('Grammar'),
    componentClassFn: () => require('./preferences-grammar').default,
  });

  this._actionDisposables = [
    Actions.sendDraft.listen((headerMessageId: string) => _onDraftClosed(headerMessageId)),
    Actions.destroyDraft.listen((draft: any) => {
      const id = typeof draft === 'string' ? draft : draft.headerMessageId;
      _onDraftClosed(id);
    }),
  ];

  ComponentRegistry.register(GrammarCheckToggle, { role: 'Composer:ActionButton' });
  PreferencesUIStore.registerPreferencesTab(this.preferencesTab);
  ExtensionRegistry.Composer.register(GrammarCheckComposerExtension);
}

export function deactivate() {
  clearGrammarCheckStore();

  if (this._actionDisposables) {
    for (const unsub of this._actionDisposables) unsub();
    this._actionDisposables = null;
  }

  GrammarCheckStore.deactivate();
  ComponentRegistry.unregister(GrammarCheckToggle);
  PreferencesUIStore.unregisterPreferencesTab(this.preferencesTab.tabId);
  ExtensionRegistry.Composer.unregister(GrammarCheckComposerExtension);
}

export function serialize() {
  return this.state;
}
