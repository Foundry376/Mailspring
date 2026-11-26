import React from 'react';
import { localized } from '../intl';
import * as Actions from '../flux/actions';
import AIStore, { AICapability, LocalBackend } from '../flux/stores/ai-store';
import LocalModelStore, { LocalModelStatus } from '../flux/stores/local-model-store';
import { LocalModelSettings, formatModelBytes } from './local-model-settings';

export function openAIPreferences() {
  Actions.openPreferences();
  Actions.switchPreferencesTab('AI');
}

/** What turning AI on will do here: use the system model, or download one. */
function localModelPlan(status: LocalModelStatus | null) {
  if (!status || status.system.reason === 'checking') {
    return localized("Mailspring runs AI on this computer, so your mail isn't sent anywhere.");
  }
  const { system, downloadable } = status;
  if (status.provider === 'auto' && system.available) {
    return localized(
      "Mailspring will use %@ on this Mac. There's nothing to download, and your mail stays on this computer.",
      system.name
    );
  }
  if (status.provider === 'auto' && system.reason === 'appleIntelligenceNotEnabled') {
    return localized(
      "Mailspring runs AI on this computer, so your mail isn't sent anywhere. It can use %@ once you turn it on in System Settings, or download a %@ model, %@.",
      system.name,
      formatModelBytes(downloadable.sizeBytes),
      downloadable.label
    );
  }
  return localized(
    "Mailspring will download a %@ model, %@, and run it on this computer. Your mail isn't sent anywhere.",
    formatModelBytes(downloadable.sizeBytes),
    downloadable.label
  );
}

function useStores() {
  const [, setVersion] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const unlisteners = [AIStore.listen(bump), LocalModelStore.listen(bump)];
    return () => unlisteners.forEach((u) => u());
  }, []);
}

interface EnableAIPromptProps {
  /** Why this place asks, e.g. "“Rides” uses AI to read ride receipts." */
  reason: React.ReactNode;
  /** What the feature needs; one the local backend can't do sends the user to Settings. */
  requires?: AICapability[];
  /** The user chose Not Now. */
  onNotNow: () => void;
  /** The user closed the prompt after turning AI on. */
  onDone: () => void;
}

/**
 * Asks the user to turn AI on where a feature needs it, so they needn't go to Preferences.
 * It turns AI on with the local backend, then shows the model's status (download progress,
 * Apple Intelligence setup) until the user closes it. Other backends are chosen in
 * Preferences > AI, which "More options" opens.
 *
 * Shown over a View that asks for AI while it's off (view-host.tsx), in the Views badge, and
 * as a modal from `AIStore.requestEnable` anywhere else.
 */
export function EnableAIPrompt({ reason, requires = [], onNotNow, onDone }: EnableAIPromptProps) {
  useStores();
  const status = LocalModelStore.status();
  const enabled = AIStore.isEnabled();
  const localCan = requires.every((c) => LocalBackend.capabilities.has(c));

  if (enabled) {
    return (
      <div className="enable-ai-prompt">
        <div className="enable-ai-prompt-title">{localized('AI is on')}</div>
        {status && <LocalModelSettings status={status} intro={null} />}
        <div className="enable-ai-prompt-actions">
          <button className="btn btn-emphasis" onClick={onDone}>
            {localized('Done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="enable-ai-prompt">
      <div className="enable-ai-prompt-title">{localized('Turn on AI?')}</div>
      <p className="enable-ai-prompt-reason">{reason}</p>
      <p className="enable-ai-prompt-plan">
        {localCan
          ? localModelPlan(status)
          : localized(
              'This needs more capable AI than Mailspring can run on this computer. You can connect a remote AI provider in Settings.'
            )}
      </p>
      <div className="enable-ai-prompt-actions">
        <button className="btn" onClick={onNotNow}>
          {localized('Not Now')}
        </button>
        {localCan ? (
          <button className="btn btn-emphasis" onClick={() => AIStore.setEnabled(true)}>
            {localized('Turn On AI')}
          </button>
        ) : (
          <button className="btn btn-emphasis" onClick={openAIPreferences}>
            {localized('Open AI Settings')}
          </button>
        )}
      </div>
      {localCan && (
        <button className="enable-ai-prompt-more" onClick={openAIPreferences}>
          {localized('More options in Settings…')}
        </button>
      )}
    </div>
  );
}

/**
 * Shows EnableAIPrompt in a modal and resolves with whether AI is on when it closes. Resolves
 * true at once if AI is already on.
 */
export function requestAIEnabled({
  reason,
  requires,
}: {
  reason: React.ReactNode;
  requires?: AICapability[];
}): Promise<boolean> {
  if (AIStore.isEnabled()) return Promise.resolve(true);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ModalStore = require('../flux/stores/modal-store').default;
  return new Promise((resolve) => {
    let unlisten: () => void = null;
    // Escape or a click outside also closes the modal, so resolve whenever it closes.
    const onModalChange = () => {
      if (ModalStore.isModalOpen()) return;
      unlisten();
      resolve(AIStore.isEnabled());
    };
    const close = () => Actions.closeModal();
    Actions.openModal(
      {
        component: (
          <div className="enable-ai-prompt-modal">
            <EnableAIPrompt reason={reason} requires={requires} onNotNow={close} onDone={close} />
          </div>
        ),
        width: 420,
        height: 300,
      },
      () => (unlisten = ModalStore.listen(onModalChange))
    );
  });
}
