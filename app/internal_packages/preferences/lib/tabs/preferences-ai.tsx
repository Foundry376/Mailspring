import React from 'react';
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
      <h6>{localized('On this computer')}</h6>
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
 * Preferences > AI: the one switch for AI in Mailspring and in Views, then, once it's on, the
 * model it runs on and the mailbox features. Opening this tab checks which model is available
 * but never starts a download; turning AI on does.
 */
export default function PreferencesAI() {
  useStoreVersion(AIStore, LocalModelStore);
  const enabled = AIStore.isEnabled();

  return (
    <div className="container-ai">
      <section>
        <AIEnabledSwitch />
        <p className="ai-enabled-detail">
          {enabled
            ? localized('AI summaries and smart extraction are on in Mailspring and in Views.')
            : localized(
                'AI is off. Nothing is downloaded, and none of your mail is sent anywhere. Views that use AI show their other information.'
              )}
        </p>
      </section>
      {enabled && <LocalModelSection />}
      {enabled && <FeatureList />}
    </div>
  );
}
