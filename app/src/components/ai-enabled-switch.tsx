import React from 'react';
import { localized } from '../intl';
import AIStore from '../flux/stores/ai-store';
import LocalModelStore from '../flux/stores/local-model-store';
import { confirm, formatModelBytes } from './local-model-settings';

/**
 * Turns AI off after the user confirms, since that deletes the downloaded model. Turning it
 * on needs no confirmation: the main process starts the download, which the user can cancel.
 */
export function setAIEnabled(enabled: boolean) {
  if (enabled) {
    AIStore.setEnabled(true);
    return;
  }
  const status = LocalModelStore.status();
  const freed = status ? status.bytesOnDisk : 0;
  const ok = confirm(
    localized('Turn off AI?'),
    freed
      ? localized(
          'AI features in Mailspring and in Views stop working, and the downloaded model is deleted, freeing %@.',
          formatModelBytes(freed)
        )
      : localized('AI features in Mailspring and in Views stop working until you turn AI back on.'),
    localized('Turn Off')
  );
  if (ok) AIStore.setEnabled(false);
}

/** The one switch for AI in Mailspring and in Views; Preferences > AI and the Views badge. */
export function AIEnabledSwitch({ id = 'ai-enabled' }: { id?: string }) {
  const [enabled, setEnabled] = React.useState(AIStore.isEnabled());
  React.useEffect(() => {
    const unlisten = AIStore.listen(() => setEnabled(AIStore.isEnabled()));
    return () => {
      unlisten();
    };
  }, []);
  return (
    <div className="ai-enabled-switch">
      <input
        type="checkbox"
        id={id}
        checked={enabled}
        onChange={(e) => setAIEnabled(e.target.checked)}
      />
      <label htmlFor={id}>{localized('Use AI features')}</label>
    </div>
  );
}
