import React from 'react';
import { shell } from 'electron';
import classnames from 'classnames';
import { AIStore, LocalModelStore, localized } from 'mailspring-exports';
import { AIEnabledSwitch, LocalModelSettings } from 'mailspring-component-kit';

function useStoreVersion(...stores: { listen: (cb: () => void) => () => void }[]) {
  const [, setVersion] = React.useState(0);
  React.useEffect(() => {
    const unlisteners = stores.map((s) => s.listen(() => setVersion((v) => v + 1)));
    return () => unlisteners.forEach((u) => u());
  }, []);
}

function LocalModelSection() {
  const status = LocalModelStore.status();
  return (
    <section>
      <h6>{localized('Model')}</h6>
      {status ? (
        <>
          <div className="ai-model-name">{status.state.label}</div>
          <LocalModelSettings
            status={status}
            intro={
              <p className="local-model-intro">
                {localized(
                  "Mailspring runs AI on this computer: Apple Intelligence on Macs that have it, or a small model it downloads. Your mail isn't sent anywhere."
                )}
              </p>
            }
          />
        </>
      ) : (
        <p>{localized('Checking…')}</p>
      )}
    </section>
  );
}

const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys';
const OPENROUTER_PRIVACY_URL = 'https://openrouter.ai/settings/privacy';

/** Suggestions only; any OpenRouter model that supports structured outputs works. */
const SUGGESTED_MODELS = [
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];

function BackendChoice() {
  const selected = AIStore.backend().id;
  const option = (id: string, title: string, detail: string, remote: boolean) => (
    <button
      className={classnames('ai-backend', { selected: selected === id })}
      role="radio"
      aria-checked={selected === id}
      onClick={() => AIStore.setBackend(id)}
    >
      <div className="ai-backend-title">
        <span className="ai-backend-radio" />
        {title}
        {remote && <span className="ai-backend-remote">{localized('Remote')}</span>}
      </div>
      <div className="ai-backend-detail">{detail}</div>
    </button>
  );
  return (
    <section className="ai-backends" role="radiogroup">
      {option(
        'local',
        localized('On this computer'),
        localized(
          'Private: your mail never leaves this computer. Summarizes mail and pulls out details.'
        ),
        false
      )}
      {option(
        'openrouter',
        'OpenRouter',
        localized(
          'Sends the text of your mail to OpenRouter, using your own key. Larger models can also write and rewrite.'
        ),
        true
      )}
    </section>
  );
}

function OpenRouterKey() {
  const [draft, setDraft] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const describe = (info: { label?: string; usage?: number; limit?: number | null }) =>
    info.limit != null
      ? localized(
          'Key “%@” works: $%@ of $%@ used.',
          info.label || '',
          (info.usage || 0).toFixed(2),
          info.limit.toFixed(2)
        )
      : localized('Key “%@” works: $%@ used.', info.label || '', (info.usage || 0).toFixed(2));

  const onSave = async () => {
    setChecking(true);
    const result = await LocalModelStore.openRouterKeyInfo(draft.trim());
    setChecking(false);
    if (result.error) {
      setMessage(localized('OpenRouter didn’t accept this key: %@', result.error));
      return;
    }
    await AIStore.setOpenRouterKey(draft.trim());
    setDraft('');
    setMessage(describe(result.info || {}));
  };

  if (AIStore.hasOpenRouterKey()) {
    return (
      <div className="ai-openrouter-key">
        <span>{localized('API key saved in your system keychain.')}</span>
        <button
          className="btn btn-small"
          onClick={() => {
            setMessage(null);
            AIStore.setOpenRouterKey(null);
          }}
        >
          {localized('Remove Key')}
        </button>
        {message && <p className="ai-openrouter-message">{message}</p>}
      </div>
    );
  }
  return (
    <div className="ai-openrouter-key">
      <input
        type="password"
        placeholder="sk-or-…"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && draft.trim() && onSave()}
      />
      <button className="btn btn-small" disabled={!draft.trim() || checking} onClick={onSave}>
        {checking ? localized('Checking…') : localized('Save Key')}
      </button>
      <button className="local-model-link" onClick={() => shell.openExternal(OPENROUTER_KEYS_URL)}>
        {localized('Create a key on openrouter.ai')}
      </button>
      {message && <p className="ai-openrouter-message">{message}</p>}
    </div>
  );
}

function OpenRouterModel() {
  const [draft, setDraft] = React.useState(AIStore.openRouterModel());
  const commit = () => AIStore.setOpenRouterModel(draft);
  return (
    <div className="ai-openrouter-model">
      <input
        list="ai-openrouter-models"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <datalist id="ai-openrouter-models">
        {SUGGESTED_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </datalist>
      <p>
        {localized(
          'Any OpenRouter model id that supports structured outputs. Answers are saved per model, so after you switch, the new model reads your mail again.'
        )}
      </p>
    </div>
  );
}

function OpenRouterSection() {
  const remoteError = LocalModelStore.remoteError();
  return (
    <section>
      <h6>OpenRouter</h6>
      <div className="ai-remote-warning">
        <strong>{localized('Your mail leaves this computer.')}</strong>{' '}
        {localized(
          'OpenRouter and the provider serving the model you choose receive the text of every message AI reads, so Mailspring can’t keep it private. Choose a model whose provider you trust, and consider OpenRouter’s privacy settings, which can exclude providers that keep or train on prompts.'
        )}{' '}
        <button
          className="local-model-link"
          onClick={() => shell.openExternal(OPENROUTER_PRIVACY_URL)}
        >
          {localized('OpenRouter privacy settings')}
        </button>
      </div>
      <label className="ai-field-label">{localized('API key')}</label>
      <OpenRouterKey />
      <label className="ai-field-label">{localized('Model')}</label>
      <OpenRouterModel />
      {remoteError && (
        <p className="ai-openrouter-message">
          {localized('The last request to OpenRouter failed: %@', remoteError)}
        </p>
      )}
    </section>
  );
}

function FeatureList() {
  const features = AIStore.features();
  if (features.length === 0) return null;
  return (
    <section>
      <h6>{localized('AI in Mail')}</h6>
      <div className="ai-features">
        {features.map((f) => (
          <div className="item" key={f.id}>
            <input
              type="checkbox"
              id={`ai-feature-${f.id}`}
              checked={AIStore.isFeatureEnabled(f.id)}
              onChange={(e) => AIStore.setFeatureEnabled(f.id, e.target.checked)}
            />
            <label htmlFor={`ai-feature-${f.id}`}>{f.displayName}</label>
            <p>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Preferences > AI: the one switch for AI in Mailspring and in Views, then, once it's on, where
 * it runs (this computer or OpenRouter), that backend's settings, and the mailbox features.
 * Opening this tab checks which model is available but never starts a download; turning AI on
 * does.
 */
export default function PreferencesAI() {
  useStoreVersion(AIStore, LocalModelStore);
  const enabled = AIStore.isEnabled();
  const remote = AIStore.backend().remote;

  return (
    <div className="container-ai">
      <section>
        <AIEnabledSwitch />
        <p className="ai-enabled-detail">
          {enabled
            ? localized('AI is on in Mailspring and in Views.')
            : localized(
                'AI is off. Nothing is downloaded, and none of your mail is sent anywhere. Views that use AI show their other information.'
              )}
        </p>
      </section>
      {enabled && <BackendChoice />}
      {enabled && (remote ? <OpenRouterSection /> : <LocalModelSection />)}
      {enabled && <FeatureList />}
    </div>
  );
}
