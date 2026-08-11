import React from 'react';
import { localized } from 'mailspring-exports';
import {
  clearTranslationCache,
  getLMStudioSettings,
  LMStudioConfigKeys,
  testLMStudioConnection,
} from './service';

interface State {
  url: string;
  model: string;
  apiKey: string;
  targetLanguage: string;
  automatic: string;
  disabled: string;
  models: string[];
  status: string;
  error: boolean;
}

export default class PreferencesLMStudio extends React.Component<Record<string, unknown>, State> {
  static displayName = 'PreferencesLMStudio';

  state: State = {
    ...getLMStudioSettings(),
    automatic: (AppEnv.config.get('core.translation.automatic') || []).join(', '),
    disabled: (AppEnv.config.get('core.translation.disabled') || []).join(', '),
    models: [],
    status: '',
    error: false,
  };

  _set = (key: 'url' | 'model' | 'apiKey' | 'targetLanguage', value: string) => {
    const configKey = LMStudioConfigKeys[key];
    AppEnv.config.set(configKey, value);
    this.setState({ [key]: value } as Pick<State, typeof key>);
  };

  _test = async () => {
    this.setState({ status: localized('Connecting…'), error: false });
    try {
      const models = await testLMStudioConnection();
      this.setState({
        models,
        status: localized('Connected. %@ models available.', models.length),
        error: false,
      });
      if (!this.state.model && models.length > 0) this._set('model', models[0]);
    } catch (err) {
      this.setState({ status: err.toString(), error: true });
    }
  };

  _clearCache = () => {
    clearTranslationCache();
    this.setState({ status: localized('Translation cache cleared.'), error: false });
  };

  _saveLanguagePreferences = () => {
    const parse = (value: string) =>
      value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    AppEnv.config.set('core.translation.automatic', parse(this.state.automatic));
    AppEnv.config.set('core.translation.disabled', parse(this.state.disabled));
    this.setState({ status: localized('Translation settings saved.'), error: false });
  };

  render() {
    const { url, model, apiKey, targetLanguage, automatic, disabled, models, status, error } =
      this.state;
    return (
      <div className="container-general" style={{ maxWidth: 720 }}>
        <h6>LM Studio</h6>
        <p>
          {localized(
            'Translate messages locally using an OpenAI-compatible LM Studio server. Email text is sent only to the configured server.'
          )}
        </p>
        <label htmlFor="translation-lmstudio-url">{localized('Server URL')}</label>
        <input
          id="translation-lmstudio-url"
          type="text"
          value={url}
          onChange={(e) => this._set('url', e.target.value)}
          placeholder="http://127.0.0.1:1234/v1"
        />
        <label htmlFor="translation-lmstudio-model">{localized('Translation model')}</label>
        <input
          id="translation-lmstudio-model"
          type="text"
          value={model}
          onChange={(e) => this._set('model', e.target.value)}
          list="translation-lmstudio-models"
          placeholder={localized('Load a model in LM Studio, then test the connection')}
        />
        <datalist id="translation-lmstudio-models">
          {models.map((item) => (
            <option value={item} key={item} />
          ))}
        </datalist>
        <label htmlFor="translation-lmstudio-key">{localized('API key (optional)')}</label>
        <input
          id="translation-lmstudio-key"
          type="password"
          value={apiKey}
          onChange={(e) => this._set('apiKey', e.target.value)}
        />
        <label htmlFor="translation-lmstudio-target">{localized('Target language')}</label>
        <input
          id="translation-lmstudio-target"
          type="text"
          value={targetLanguage}
          onChange={(e) => this._set('targetLanguage', e.target.value.trim().toLowerCase())}
          placeholder="en"
        />
        <h6 style={{ marginTop: 24 }}>{localized('Automatic translation')}</h6>
        <label htmlFor="translation-always-languages">
          {localized('Always translate messages from these languages')}
        </label>
        <input
          id="translation-always-languages"
          type="text"
          value={automatic}
          onChange={(e) => this.setState({ automatic: e.target.value })}
          placeholder="de, fr"
        />
        <label htmlFor="translation-never-languages">
          {localized('Never suggest translation for these languages')}
        </label>
        <input
          id="translation-never-languages"
          type="text"
          value={disabled}
          onChange={(e) => this.setState({ disabled: e.target.value })}
          placeholder="en"
        />
        <button className="btn" onClick={this._saveLanguagePreferences}>
          {localized('Save translation settings')}
        </button>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={this._test}>
            {localized('Test connection')}
          </button>
          {status && (
            <span style={{ marginLeft: 12, color: error ? '#c0392b' : undefined }}>{status}</span>
          )}
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="btn" onClick={this._clearCache}>
            {localized('Clear translation cache')}
          </button>
        </div>
      </div>
    );
  }
}
