import React from 'react';
import { insightStore } from '../stores/insight-store';
import { usageStore } from '../stores/usage-store';
import {
  apiKeySource,
  getSettings,
  MODELS,
  setApiKey,
  setSetting,
  type SiftSettings,
} from '../settings';
import { currentModel, describeError } from '../ai/client';
import { findModel, keyInfo } from '../ai/openrouter';
import { getApiKey } from '../settings';
import { SparkleIcon, useStores } from './helpers';

export function SiftPreferences() {
  useStores(usageStore);
  const [settings, setSettings] = React.useState<SiftSettings>(getSettings());
  const [keyInput, setKeyInput] = React.useState('');
  const [keySource, setKeySource] = React.useState<'keychain' | 'env' | null>(null);
  const [check, setCheck] = React.useState<{
    state: 'idle' | 'checking' | 'ok' | 'error';
    message?: string;
  }>({
    state: 'idle',
  });

  React.useEffect(() => {
    apiKeySource().then(setKeySource);
  }, []);

  const update = <K extends keyof SiftSettings>(key: K, value: SiftSettings[K]) => {
    setSetting(key, value);
    setSettings(getSettings());
  };

  const testConnection = async () => {
    setCheck({ state: 'checking' });
    try {
      const key = await getApiKey();
      if (!key) throw new Error('No API key saved yet.');
      const [info, model] = await Promise.all([keyInfo(key), findModel(currentModel())]);
      if (!model) throw new Error(`OpenRouter has no model called “${currentModel()}”.`);
      const credit =
        info.limit_remaining != null
          ? ` $${Number(info.limit_remaining).toFixed(2)} of credit left.`
          : '';
      setCheck({ state: 'ok', message: `Connected. Using ${model.name}.${credit}` });
      insightStore.resume();
    } catch (err) {
      setCheck({ state: 'error', message: describeError(err) });
    }
  };
  const isPreset = MODELS.some((m) => m.id === settings.model);

  const saveKey = async (value: string) => {
    await setApiKey(value);
    setKeyInput('');
    setKeySource(await apiKeySource());
    insightStore.resume();
    if (value.trim()) await testConnection();
    else setCheck({ state: 'idle' });
  };

  return (
    <div className="container-sift">
      <section>
        <h2>
          <SparkleIcon size={18} /> Sift
        </h2>
        <p className="sift-muted">
          Sift adds AI triage, thread briefs, drafting and “ask your inbox” to Mailspring, using any
          model on OpenRouter. Mail is sent to OpenRouter (and the model provider it routes to) only
          when Sift reads a thread or you ask it something; nothing goes to Mailspring's servers.
        </p>
      </section>

      <section>
        <h4>OpenRouter API key</h4>
        <p className="sift-muted">
          {keySource === 'keychain'
            ? 'A key is saved in Mailspring’s encrypted credential store.'
            : keySource === 'env'
              ? 'Using OPENROUTER_API_KEY from the environment.'
              : 'No key yet. Create one at openrouter.ai/keys, then paste it here.'}
        </p>
        <form
          className="sift-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyInput.trim()) saveKey(keyInput);
          }}
        >
          <input
            type="password"
            value={keyInput}
            placeholder={keySource ? '••••••••  (paste a new key to replace)' : 'sk-or-v1-…'}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!keyInput.trim()}>
            Save key
          </button>
          {keySource === 'keychain' && (
            <button type="button" className="btn" onClick={() => saveKey('')}>
              Remove
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={!keySource || check.state === 'checking'}
            onClick={testConnection}
          >
            {check.state === 'checking' ? 'Checking…' : 'Test connection'}
          </button>
        </form>
        {check.message && (
          <p className={check.state === 'ok' ? 'sift-ok' : 'sift-error'}>{check.message}</p>
        )}
      </section>

      <section>
        <h4>Model</h4>
        <select
          value={isPreset ? settings.model : 'custom'}
          onChange={(e) => update('model', e.target.value === 'custom' ? '' : e.target.value)}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}: {m.hint}
            </option>
          ))}
          <option value="custom">Another OpenRouter model…</option>
        </select>
        {!isPreset && (
          <div className="sift-row">
            <input
              type="text"
              defaultValue={settings.model}
              placeholder="vendor/model, e.g. qwen/qwen3-max"
              onBlur={(e) => e.target.value.trim() && update('model', e.target.value.trim())}
            />
          </div>
        )}
        <p className="sift-muted">
          Pick a model that supports tool calling and structured outputs on OpenRouter.
        </p>
      </section>

      <section>
        <h4>Triage</h4>
        <label className="sift-check">
          <input
            type="checkbox"
            checked={settings.autoTriage}
            onChange={(e) => update('autoTriage', e.target.checked)}
          />
          Automatically triage new inbox mail
        </label>
        <label className="sift-row">
          Look back
          <input
            type="number"
            min={1}
            max={90}
            value={settings.triageDays}
            onChange={(e) =>
              update('triageDays', Math.max(1, Math.min(90, Number(e.target.value) || 14)))
            }
            style={{ width: 64 }}
          />
          days
        </label>
        <div className="sift-row">
          <button className="btn" onClick={() => insightStore.clearAll()}>
            Clear Sift's cache and re-triage
          </button>
        </div>
      </section>

      <section>
        <h4>About you</h4>
        <p className="sift-muted">
          Helps Sift judge what matters. For example: “Head of Engineering at Lumen; customers and
          the CEO come first.”
        </p>
        <textarea
          rows={2}
          value={settings.aboutMe}
          onChange={(e) => update('aboutMe', e.target.value)}
        />
      </section>

      <section>
        <h4>Your writing style</h4>
        <p className="sift-muted">
          Used for drafts. For example: “Short and warm, no exclamation marks, sign off with ‘–
          Alex’.”
        </p>
        <textarea
          rows={2}
          value={settings.writingStyle}
          onChange={(e) => update('writingStyle', e.target.value)}
        />
      </section>

      <section>
        <h4>Privacy</h4>
        <p className="sift-muted">
          Threads involving these senders are never sent to the AI. Separate with commas; use
          @domain.com for a whole domain.
        </p>
        <textarea
          rows={2}
          value={settings.excludedSenders}
          placeholder="@mybank.example, doctor@clinic.example"
          onChange={(e) => update('excludedSenders', e.target.value)}
        />
      </section>

      <section>
        <h4>Usage this session</h4>
        <p className="sift-muted">{usageStore.summary()}</p>
      </section>
    </div>
  );
}
SiftPreferences.displayName = 'SiftPreferences';
