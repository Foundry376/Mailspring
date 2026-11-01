import {
  localized,
  Actions,
  ComponentRegistry,
  GrammarCheckPluginAPI,
  HarperDictionary,
} from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';
import { GrammarCheckToggle } from './grammar-check-toggle';
import { GrammarCheckStore } from './grammar-check-store';

const {
  setGrammarCheckStore,
  clearGrammarCheckStore,
  cleanupDraft,
  clearAllGrammarDecorations,
  requestInitialCheckForAllDrafts,
} = GrammarCheckPluginAPI;

const GrammarCheckToggleWithTip = HasTutorialTip(GrammarCheckToggle, {
  title: localized('Check your grammar'),
  instructions: localized(
    'Check English grammar locally with Harper as you compose. Your text never leaves this device. No account or subscription is required.'
  ),
});

function _onDraftClosed(headerMessageId: string) {
  GrammarCheckStore.clearDraft(headerMessageId);
  cleanupDraft(headerMessageId);
}

export function activate(state = {}) {
  this.state = state;

  GrammarCheckStore.activate();
  setGrammarCheckStore(GrammarCheckStore);

  this._actionDisposables = [
    Actions.sendDraft.listen((headerMessageId: string) => _onDraftClosed(headerMessageId)),
    Actions.destroyDraft.listen((draft: any) => {
      const id = typeof draft === 'string' ? draft : draft.headerMessageId;
      _onDraftClosed(id);
    }),
  ];

  this._configDisposables = [
    AppEnv.config.onDidChange('core.composing.grammarCheck', ({ newValue }) => {
      if (!newValue) {
        clearAllGrammarDecorations();
      } else {
        requestInitialCheckForAllDrafts();
      }
    }),
    AppEnv.config.onDidChange('core.composing.grammarCheckLanguage', () => {
      requestInitialCheckForAllDrafts();
    }),
    AppEnv.config.onDidChange(HarperDictionary.configKey, () => {
      requestInitialCheckForAllDrafts();
    }),
  ];

  ComponentRegistry.register(GrammarCheckToggleWithTip, { role: 'Composer:ActionButton' });
}

export function deactivate() {
  // Remove any visible grammar underlines first, while the editor instances are
  // still reachable. The config-change listener handles the "feature toggled off"
  // path; this call covers the case where the package itself is deactivated while
  // the feature was still enabled.
  clearAllGrammarDecorations();

  // Disconnect the Slate plugin so no new decorations can be applied after this point.
  clearGrammarCheckStore();

  if (this._actionDisposables) {
    for (const unsub of this._actionDisposables) unsub();
    this._actionDisposables = null;
  }

  if (this._configDisposables) {
    for (const disposable of this._configDisposables) disposable.dispose();
    this._configDisposables = null;
  }

  GrammarCheckStore.deactivate();
  ComponentRegistry.unregister(GrammarCheckToggleWithTip);
}

export function serialize() {
  return this.state;
}
