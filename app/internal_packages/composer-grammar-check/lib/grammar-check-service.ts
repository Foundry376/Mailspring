import { checkWithHarper, stopHarper } from './harper-loader';

export interface GrammarError {
  offset: number;
  length: number;
  message: string;
  shortMessage: string;
  replacements: string[];
  ruleId: string;
  ruleDescription: string;
  category: string;
  categoryName: string;
  issueType: string;
  sentence: string;
  contextText: string;
  contextOffset: number;
  contextLength: number;
}

export class HarperBackend {
  name = 'Harper (local, English only)';

  dispose() {
    stopHarper();
  }

  addDisabledRule(ruleId: string) {
    const rules = this._rules('Disabled');
    rules.add(ruleId);
    AppEnv.config.set('core.composing.grammarCheckDisabledRules', [...rules].join(','));
  }

  private _rules(kind: 'Enabled' | 'Disabled'): Set<string> {
    const value = AppEnv.config.get(`core.composing.grammarCheck${kind}Rules`) as string;
    return new Set(
      (value || '')
        .split(',')
        .map((rule) => rule.trim())
        .filter(Boolean)
    );
  }

  async check(text: string, _messageId?: string, language?: string): Promise<GrammarError[]> {
    const requestedLanguage =
      language || (AppEnv.config.get('core.composing.grammarCheckLanguage') as string) || 'auto';
    const locale = requestedLanguage.toLowerCase().replace('_', '-');
    // "auto" means English detection, not multilingual grammar checking.
    if (locale !== 'auto' && locale !== 'en' && !locale.startsWith('en-')) return [];
    if (!text.trim()) return [];

    return checkWithHarper({
      text,
      locale,
      enabledRules: [...this._rules('Enabled')],
      disabledRules: [...this._rules('Disabled')],
    });
  }
}
