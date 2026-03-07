import {
  localized,
  Actions,
  ComponentRegistry,
  GrammarCheckPluginAPI,
} from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';
import { GrammarCheckToggle } from './grammar-check-toggle';
import { GrammarCheckStore } from './grammar-check-store';

const { setGrammarCheckStore, clearGrammarCheckStore, cleanupDraft, clearAllGrammarDecorations } =
  GrammarCheckPluginAPI;

const GrammarCheckToggleWithTip = HasTutorialTip(GrammarCheckToggle, {
  title: localized('Check your grammar'),
  instructions: localized(
    "Enable grammar checking to find writing issues as you compose. Text is sent to Mailspring's LanguageTool service and is not stored."
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

  this._configDisposable = AppEnv.config.onDidChange(
    'core.composing.grammarCheck',
    ({ newValue }) => {
      if (!newValue) {
        clearAllGrammarDecorations();
      }
    }
  );

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

  if (this._configDisposable) {
    this._configDisposable.dispose();
    this._configDisposable = null;
  }

  GrammarCheckStore.deactivate();
  ComponentRegistry.unregister(GrammarCheckToggleWithTip);
}

export function serialize() {
  return this.state;
}
