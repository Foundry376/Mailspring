import MailspringStore from 'mailspring-store';
import { GrammarError, LanguageToolBackend } from './grammar-check-service';

interface BlockCheckResult {
  text: string;
  errors: GrammarError[];
}

class _GrammarCheckStore extends MailspringStore {
  private _enabled: boolean = false;
  private _checking: Map<string, boolean> = new Map();
  private _errorsByDraft: Map<string, Map<string, BlockCheckResult>> = new Map();
  private _dismissedRules: Set<string> = new Set();
  private _dirtyBlocks: Map<string, Map<string, string>> = new Map();
  private _backend: LanguageToolBackend;
  private _abortControllers: Map<string, AbortController> = new Map();
  private _configDisposable: { dispose: () => void } | null = null;

  activate() {
    this._backend = new LanguageToolBackend();
    this._readConfig();

    this._configDisposable = AppEnv.config.onDidChange(
      'core.composing.grammarCheck',
      ({ newValue }) => {
        this._enabled = !!newValue;
        if (!this._enabled) {
          this._errorsByDraft.clear();
          this._dirtyBlocks.clear();
          this._checking.clear();
        }
        this.trigger();
      }
    );
  }

  deactivate() {
    if (this._configDisposable) {
      this._configDisposable.dispose();
      this._configDisposable = null;
    }
    this._errorsByDraft.clear();
    this._dirtyBlocks.clear();
    this._checking.clear();
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
  }

  private _readConfig() {
    this._enabled = !!AppEnv.config.get('core.composing.grammarCheck');

    const disabledRulesStr =
      (AppEnv.config.get('core.composing.grammarCheckDisabledRules') as string) || '';
    if (disabledRulesStr) {
      for (const rule of disabledRulesStr.split(',')) {
        const trimmed = rule.trim();
        if (trimmed) this._dismissedRules.add(trimmed);
      }
    }
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  warnOnSend(): boolean {
    return AppEnv.config.get('core.composing.grammarCheckWarnOnSend') !== false;
  }

  isChecking(draftId?: string): boolean {
    if (!draftId) {
      for (const val of this._checking.values()) {
        if (val) return true;
      }
      return false;
    }
    return this._checking.get(draftId) || false;
  }

  errorCount(draftId: string): number {
    const blockErrors = this._errorsByDraft.get(draftId);
    if (!blockErrors) return 0;
    let count = 0;
    for (const result of blockErrors.values()) {
      count += result.errors.length;
    }
    return count;
  }

  allErrorsForDraft(draftId: string): Map<string, BlockCheckResult> {
    return this._errorsByDraft.get(draftId) || new Map();
  }

  markDirty(draftId: string, blockKey: string, blockText: string) {
    if (!this._enabled) return;
    let draftDirty = this._dirtyBlocks.get(draftId);
    if (!draftDirty) {
      draftDirty = new Map();
      this._dirtyBlocks.set(draftId, draftDirty);
    }
    draftDirty.set(blockKey, blockText);
  }

  clearBlock(draftId: string, blockKey: string) {
    const draftErrors = this._errorsByDraft.get(draftId);
    if (draftErrors) {
      draftErrors.delete(blockKey);
      this.trigger();
    }
    const draftDirty = this._dirtyBlocks.get(draftId);
    if (draftDirty) {
      draftDirty.delete(blockKey);
    }
  }

  clearDraft(draftId: string) {
    this._errorsByDraft.delete(draftId);
    this._dirtyBlocks.delete(draftId);
    this._checking.delete(draftId);
    const controller = this._abortControllers.get(draftId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(draftId);
    }
    this.trigger();
  }

  dismissRule(ruleId: string) {
    this._dismissedRules.add(ruleId);
    this._backend.addDisabledRule(ruleId);

    // Remove errors with this ruleId from all drafts
    for (const [, blockErrors] of this._errorsByDraft) {
      for (const [blockKey, result] of blockErrors) {
        const filtered = result.errors.filter((e) => e.ruleId !== ruleId);
        if (filtered.length !== result.errors.length) {
          blockErrors.set(blockKey, { text: result.text, errors: filtered });
        }
      }
    }
    this.trigger();
  }

  async checkDirtyBlocks(draftId: string): Promise<void> {
    if (!this._enabled) return;

    const draftDirty = this._dirtyBlocks.get(draftId);
    if (!draftDirty || draftDirty.size === 0) return;

    // Take a snapshot of dirty blocks and clear
    const blocksToCheck = new Map(draftDirty);
    draftDirty.clear();

    // Cancel any in-flight request for this draft
    const existingController = this._abortControllers.get(draftId);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    this._abortControllers.set(draftId, controller);

    this._checking.set(draftId, true);
    this.trigger();

    let draftErrors = this._errorsByDraft.get(draftId);
    if (!draftErrors) {
      draftErrors = new Map();
      this._errorsByDraft.set(draftId, draftErrors);
    }

    try {
      this._backend.refreshConfig();

      for (const [blockKey, blockText] of blocksToCheck) {
        if (controller.signal.aborted) break;

        // Skip empty or whitespace-only blocks
        if (!blockText || !blockText.trim()) {
          draftErrors.delete(blockKey);
          continue;
        }

        try {
          const errors = await this._backend.check(blockText, undefined, controller.signal);

          // Staleness check: verify the block is still the same text
          const currentDirty = this._dirtyBlocks.get(draftId);
          if (currentDirty && currentDirty.has(blockKey)) {
            // Block was modified since we started checking - skip stale result
            continue;
          }

          // Filter out dismissed rules
          const filteredErrors = errors.filter((e) => !this._dismissedRules.has(e.ruleId));

          draftErrors.set(blockKey, { text: blockText, errors: filteredErrors });
        } catch (err) {
          if (err.name === 'AbortError') break;
          console.warn(`Grammar check failed for block ${blockKey}:`, err);
        }
      }
    } finally {
      this._checking.set(draftId, false);
      if (this._abortControllers.get(draftId) === controller) {
        this._abortControllers.delete(draftId);
      }
      this.trigger();
    }
  }
}

export const GrammarCheckStore = new _GrammarCheckStore();
