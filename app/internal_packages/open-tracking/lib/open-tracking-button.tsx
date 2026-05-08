import React from 'react';
import {
  Message,
  DraftEditingSession,
  localized,
  APIError,
  MailspringAPIRequest,
} from 'mailspring-exports';
import { MetadataComposerToggleButton } from 'mailspring-component-kit';
import { PLUGIN_ID, PLUGIN_NAME } from './open-tracking-constants';

type Props = { draft: Message; session: DraftEditingSession };

function errorMessage(error: Error) {
  if (
    error instanceof APIError &&
    MailspringAPIRequest.TimeoutErrorCodes.includes(error.statusCode)
  ) {
    return localized(
      `Open tracking does not work offline. Please re-enable when you come back online.`
    );
  }
  return localized(
    `Unfortunately, open tracking is currently not available. Please try again later. Error: %@`,
    error.message
  );
}

const OpenTrackingButtonInner: React.FC<Props> = ({ draft, session }) => {
  if (draft.plaintext) {
    return <span />;
  }
  return (
    <MetadataComposerToggleButton
      iconUrl="mailspring://open-tracking/assets/icon-composer-eye@2x.png"
      pluginId={PLUGIN_ID}
      pluginName={PLUGIN_NAME}
      metadataEnabledValue={{ open_count: 0, open_data: [] }}
      errorMessage={errorMessage}
      draft={draft}
      session={session}
    />
  );
};
const OpenTrackingButton = Object.assign(
  React.memo(
    OpenTrackingButtonInner,
    (prev, next) =>
      prev.draft.metadataForPluginId(PLUGIN_ID) === next.draft.metadataForPluginId(PLUGIN_ID)
  ),
  { containerRequired: false as const }
);
OpenTrackingButton.displayName = 'OpenTrackingButton';

export default OpenTrackingButton;
