import { checkWithHarper, stopHarper } from './harper-loader';
import { HarperDictionary, HarperRules } from 'mailspring-exports';

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
    const disabled = HarperRules.disabled();
    disabled.add(ruleId);
    AppEnv.config.set(HarperRules.disabledKey, [...disabled].join(','));
  }

  async check(text: string, _messageId?: string, language?: string): Promise<GrammarError[]> {
    const requestedLanguage =
      language || (AppEnv.config.get('core.composing.grammarCheckLanguage') as string) || 'en-US';
    const locale = requestedLanguage.toLowerCase().replace('_', '-');
    // "auto" means English detection, not multilingual grammar checking.
    if (locale !== 'auto' && locale !== 'en' && !locale.startsWith('en-')) return [];
    if (!text.trim()) return [];

    return checkWithHarper({
      text,
      locale,
      preset: HarperRules.preset(),
      enabledRules: [...HarperRules.enabled()],
      disabledRules: [...HarperRules.disabled()],
      learnedWords: HarperDictionary.words(),
    });
  }
}
