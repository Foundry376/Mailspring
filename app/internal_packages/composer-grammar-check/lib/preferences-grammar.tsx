import React from 'react';
import { localized } from 'mailspring-exports';

interface PreferencesGrammarState {
  enabled: boolean;
  serverUrl: string;
  language: string;
  level: string;
  apiKey: string;
  warnOnSend: boolean;
  disabledRules: string;
  disabledCategories: string;
  preferredVariants: string;
  motherTongue: string;
}

const LANGUAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'English (US)', value: 'en-US' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'English (Australian)', value: 'en-AU' },
  { label: 'English (Canadian)', value: 'en-CA' },
  { label: 'German (Germany)', value: 'de-DE' },
  { label: 'German (Austria)', value: 'de-AT' },
  { label: 'German (Swiss)', value: 'de-CH' },
  { label: 'French', value: 'fr' },
  { label: 'Spanish', value: 'es' },
  { label: 'Portuguese (Brazil)', value: 'pt-BR' },
  { label: 'Portuguese (Portugal)', value: 'pt-PT' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Italian', value: 'it' },
  { label: 'Polish', value: 'pl' },
  { label: 'Russian', value: 'ru' },
  { label: 'Ukrainian', value: 'uk' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Catalan', value: 'ca' },
  { label: 'Danish', value: 'da' },
  { label: 'Greek', value: 'el' },
  { label: 'Persian', value: 'fa' },
  { label: 'Finnish', value: 'fi' },
  { label: 'Irish', value: 'ga' },
  { label: 'Galician', value: 'gl' },
  { label: 'Norwegian (Bokmal)', value: 'nb' },
  { label: 'Norwegian (Nynorsk)', value: 'nn' },
  { label: 'Romanian', value: 'ro' },
  { label: 'Slovak', value: 'sk' },
  { label: 'Slovenian', value: 'sl' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Tamil', value: 'ta' },
  { label: 'Tagalog', value: 'tl' },
];

const LEVEL_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Default', value: 'default' },
  { label: 'Picky (stricter checks for formal writing)', value: 'picky' },
];

export default class PreferencesGrammar extends React.Component<
  Record<string, never>,
  PreferencesGrammarState
> {
  static displayName = 'PreferencesGrammar';

  private _disposables: Array<{ dispose: () => void }> = [];

  constructor(props: Record<string, never>) {
    super(props);
    this.state = this._getStateFromConfig();
  }

  componentDidMount() {
    this._disposables.push(
      AppEnv.config.onDidChange('core.composing.grammarCheck', () => {
        this.setState(this._getStateFromConfig());
      })
    );
  }

  componentWillUnmount() {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }

  private _getStateFromConfig(): PreferencesGrammarState {
    return {
      enabled: !!AppEnv.config.get('core.composing.grammarCheck'),
      serverUrl:
        (AppEnv.config.get('core.composing.grammarCheckServerUrl') as string) ||
        'http://localhost:8010',
      language: (AppEnv.config.get('core.composing.grammarCheckLanguage') as string) || 'auto',
      level: (AppEnv.config.get('core.composing.grammarCheckLevel') as string) || 'default',
      apiKey: (AppEnv.config.get('core.composing.grammarCheckApiKey') as string) || '',
      warnOnSend: AppEnv.config.get('core.composing.grammarCheckWarnOnSend') !== false,
      disabledRules:
        (AppEnv.config.get('core.composing.grammarCheckDisabledRules') as string) || '',
      disabledCategories:
        (AppEnv.config.get('core.composing.grammarCheckDisabledCategories') as string) || '',
      preferredVariants:
        (AppEnv.config.get('core.composing.grammarCheckPreferredVariants') as string) || '',
      motherTongue: (AppEnv.config.get('core.composing.grammarCheckMotherTongue') as string) || '',
    };
  }

  private _setConfig(key: string, value: string | boolean) {
    AppEnv.config.set(key, value);
    this.setState(this._getStateFromConfig());
  }

  render() {
    return (
      <div className="container-grammar-check">
        <section>
          <h6>{localized('Grammar Check')}</h6>

          <div className="item">
            <label htmlFor="grammar-enabled">
              <input
                id="grammar-enabled"
                type="checkbox"
                checked={this.state.enabled}
                onChange={(e) => this._setConfig('core.composing.grammarCheck', e.target.checked)}
              />
              {localized('Enable grammar checking')}
            </label>
          </div>

          <div className="item">
            <label htmlFor="grammar-server-url">{localized('Server URL')}</label>
            <input
              id="grammar-server-url"
              type="text"
              className="input-grammar-url"
              placeholder="http://localhost:8010"
              value={this.state.serverUrl}
              onChange={(e) =>
                this._setConfig('core.composing.grammarCheckServerUrl', e.target.value)
              }
            />
          </div>

          <div className="item">
            <label htmlFor="grammar-language">{localized('Language')}</label>
            <select
              id="grammar-language"
              value={this.state.language}
              onChange={(e) =>
                this._setConfig('core.composing.grammarCheckLanguage', e.target.value)
              }
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="item">
            <label htmlFor="grammar-level">{localized('Strictness Level')}</label>
            <select
              id="grammar-level"
              value={this.state.level}
              onChange={(e) => this._setConfig('core.composing.grammarCheckLevel', e.target.value)}
            >
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="item">
            <label htmlFor="grammar-api-key">
              {localized('API Key (optional, for premium/cloud)')}
            </label>
            <input
              id="grammar-api-key"
              type="password"
              className="input-grammar-api-key"
              placeholder={localized('Leave empty for self-hosted')}
              value={this.state.apiKey}
              onChange={(e) => this._setConfig('core.composing.grammarCheckApiKey', e.target.value)}
            />
          </div>

          <div className="item">
            <label htmlFor="grammar-warn-on-send">
              <input
                id="grammar-warn-on-send"
                type="checkbox"
                checked={this.state.warnOnSend}
                onChange={(e) =>
                  this._setConfig('core.composing.grammarCheckWarnOnSend', e.target.checked)
                }
              />
              {localized('Warn before sending with uncorrected grammar issues')}
            </label>
          </div>

          <div className="grammar-privacy-notice">
            <p>
              <em>
                {localized(
                  'When grammar checking is enabled, paragraph text is sent to the configured LanguageTool server for analysis. Use a self-hosted server (e.g., Docker) to keep text on your machine.'
                )}
              </em>
            </p>
          </div>
        </section>
      </div>
    );
  }
}
