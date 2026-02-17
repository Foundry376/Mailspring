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

export interface GrammarCheckBackend {
  check(text: string, language?: string, signal?: AbortSignal): Promise<GrammarError[]>;
  isAvailable(): boolean;
  name: string;
}

export class LanguageToolBackend implements GrammarCheckBackend {
  name = 'LanguageTool';
  private serverUrl: string;
  private language: string;
  private level: string;
  private apiKey?: string;
  private disabledRules: string[] = [];
  private disabledCategories: string[] = [];
  private preferredVariants: string;
  private motherTongue: string;

  constructor() {
    this._readConfig();
  }

  private _readConfig() {
    this.serverUrl =
      (AppEnv.config.get('core.composing.grammarCheckServerUrl') as string) ||
      'http://localhost:8010';
    this.language = (AppEnv.config.get('core.composing.grammarCheckLanguage') as string) || 'auto';
    this.level = (AppEnv.config.get('core.composing.grammarCheckLevel') as string) || 'default';
    this.apiKey = (AppEnv.config.get('core.composing.grammarCheckApiKey') as string) || '';
    this.preferredVariants =
      (AppEnv.config.get('core.composing.grammarCheckPreferredVariants') as string) || '';
    this.motherTongue =
      (AppEnv.config.get('core.composing.grammarCheckMotherTongue') as string) || '';

    const disabledRulesStr =
      (AppEnv.config.get('core.composing.grammarCheckDisabledRules') as string) || '';
    this.disabledRules = disabledRulesStr
      ? disabledRulesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const disabledCatsStr =
      (AppEnv.config.get('core.composing.grammarCheckDisabledCategories') as string) || '';
    this.disabledCategories = disabledCatsStr
      ? disabledCatsStr
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
    return !!this.serverUrl;
  }

  async check(text: string, language?: string, signal?: AbortSignal): Promise<GrammarError[]> {
    this._readConfig();

    if (!this.isAvailable()) {
      return [];
    }

    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', language || this.language);

    if (this.level && this.level !== 'default') {
      params.append('level', this.level);
    }
    if (this.apiKey) {
      params.append('apiKey', this.apiKey);
    }
    if (this.preferredVariants) {
      params.append('preferredVariants', this.preferredVariants);
    }
    if (this.motherTongue) {
      params.append('motherTongue', this.motherTongue);
    }
    if (this.disabledRules.length > 0) {
      params.append('disabledRules', this.disabledRules.join(','));
    }
    if (this.disabledCategories.length > 0) {
      params.append('disabledCategories', this.disabledCategories.join(','));
    }

    const response = await fetch(`${this.serverUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal,
    });

    if (!response.ok) {
      throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`);
    }

    const data: LanguageToolResponse = await response.json();
    return data.matches.map((match) => ({
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
