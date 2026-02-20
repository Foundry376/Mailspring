import { MailspringAPIRequest } from 'mailspring-exports';

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

export interface LanguageToolMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  context: {
    text: string;
    offset: number;
    length: number;
  };
  sentence: string;
  rule: {
    id: string;
    subId?: string;
    description: string;
    issueType: string;
    category: {
      id: string;
      name: string;
    };
    urls?: Array<{ value: string }>;
  };
}

export interface LanguageToolResponse {
  software: {
    name: string;
    version: string;
    buildDate: string;
    apiVersion: number;
    status: string;
    premium: boolean;
  };
  language: {
    name: string;
    code: string;
    detectedLanguage: {
      name: string;
      code: string;
      confidence?: number;
    };
  };
  matches: LanguageToolMatch[];
}

export class UsageExceededError extends Error {
  constructor(message?: string) {
    super(message || 'Grammar check usage limit exceeded');
    this.name = 'UsageExceededError';
  }
}

export interface GrammarCheckBackend {
  check(text: string, messageId: string, language?: string): Promise<GrammarError[]>;
  isAvailable(): boolean;
  name: string;
}

export class LanguageToolBackend implements GrammarCheckBackend {
  name = 'LanguageTool';
  private language: string;
  private disabledRules: string[] = [];

  constructor() {
    this._readConfig();
  }

  private _readConfig() {
    this.language = (AppEnv.config.get('core.composing.grammarCheckLanguage') as string) || 'auto';

    const disabledRulesStr =
      (AppEnv.config.get('core.composing.grammarCheckDisabledRules') as string) || '';
    this.disabledRules = disabledRulesStr
      ? disabledRulesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }

  refreshConfig() {
    this._readConfig();
  }

  addDisabledRule(ruleId: string) {
    if (!this.disabledRules.includes(ruleId)) {
      this.disabledRules.push(ruleId);
      AppEnv.config.set('core.composing.grammarCheckDisabledRules', this.disabledRules.join(','));
    }
  }

  isAvailable(): boolean {
    return true;
  }

  async check(text: string, messageId: string, language?: string): Promise<GrammarError[]> {
    this._readConfig();

    let data: LanguageToolResponse;
    try {
      data = await MailspringAPIRequest.makeRequest({
        server: 'identity',
        method: 'POST',
        path: '/api/grammar/check',
        json: true,
        body: {
          messageId,
          text,
          language: language || this.language,
        },
      });
    } catch (err) {
      // 400 = quota reached ("Quota Reached")
      if (err.statusCode === 400) {
        throw new UsageExceededError();
      }
      // 429 = rate limited — surface as a transient error, caller will retry on next dirty check
      if (err.statusCode === 429) {
        throw new Error('Grammar check rate limit reached, please try again shortly.');
      }
      // 502 = LanguageTool backend unavailable
      if (err.statusCode === 502) {
        throw new Error('Grammar check service is temporarily unavailable.');
      }
      throw err;
    }

    const filtered = data.matches.filter((match) => match.rule.issueType !== 'misspelling');
    console.log(
      `[grammar] ${data.matches.length} matches from API, ${filtered.length} after misspelling filter:`,
      filtered.map(m => `${m.rule.id}(offset=${m.offset},len=${m.length})`)
    );
    return filtered.map((match) => ({
        offset: match.offset,
        length: match.length,
        message: match.message,
        shortMessage: match.shortMessage || '',
        replacements: match.replacements.map((r) => r.value),
        ruleId: match.rule.id,
        ruleDescription: match.rule.description,
        category: match.rule.category.id,
        categoryName: match.rule.category.name,
        issueType: match.rule.issueType,
        sentence: match.sentence,
        contextText: match.context.text,
        contextOffset: match.context.offset,
        contextLength: match.context.length,
      }));
  }
}
