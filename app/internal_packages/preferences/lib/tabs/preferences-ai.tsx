import React from 'react';
import { AIStore, LocalModelStore, localized } from 'mailspring-exports';
import { LocalModelSettings } from 'mailspring-component-kit';

function useStoreVersion(...stores: { listen: (cb: () => void) => () => void }[]) {
  const [, setVersion] = React.useState(0);
  React.useEffect(() => {
    const unlisteners = stores.map((s) => s.listen(() => setVersion((v) => v + 1)));
    return () => unlisteners.forEach((u) => u());
  }, []);
}

function FeatureList() {
  const features = AIStore.features();
  if (features.length === 0) return null;
  const enabled = AIStore.isEnabled();

  return (
    <section>
      <h6>{localized('AI in Mail')}</h6>
      <div className="item">
        <input
          type="checkbox"
          id="ai-enabled"
          checked={enabled}
          onChange={(e) => AIStore.setEnabled(e.target.checked)}
        />
        <label htmlFor="ai-enabled">{localized('Turn on AI features')}</label>
      </div>
      <p>
        {localized(
          'AI features in your mailbox are off until you turn them on here. Views use on-device AI on their own, whether or not this is on.'
        )}
      </p>
      <div className="ai-features">
        {features.map((f) => (
          <div className="item" key={f.id}>
            <input
              type="checkbox"
              id={`ai-feature-${f.id}`}
              disabled={!enabled}
              checked={enabled && AIStore.isFeatureEnabled(f.id)}
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
 * Preferences > AI: the on-device model, and the opt-in for AI features in the mailbox.
 * Opening this tab checks which model is available but never starts a download; turning AI
 * features on, or the Download button, does.
 */
export default function PreferencesAI() {
  useStoreVersion(AIStore, LocalModelStore);
  const status = LocalModelStore.status();

  return (
    <div className="container-ai">
      <section>
        <h6>{localized('On-device AI')}</h6>
        {status ? (
          <>
            <div className="ai-model-name">
              {status.state.kind === 'disabled' ? localized('Turned off') : status.state.label}
            </div>
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
      <FeatureList />
    </div>
  );
}
