import React from 'react';
import {
  localized,
  APIError,
  MailspringAPIRequest,
  Message,
  DraftEditingSession,
} from 'mailspring-exports';
import { MetadataComposerToggleButton } from 'mailspring-component-kit';
import { PLUGIN_ID, PLUGIN_NAME } from './link-tracking-constants';

type Props = { draft: Message; session: DraftEditingSession };

function errorMessage(error: Error) {
  if (
    error instanceof APIError &&
    MailspringAPIRequest.TimeoutErrorCodes.includes(error.statusCode)
  ) {
    return localized(
      `Link tracking does not work offline. Please re-enable when you come back online.`
    );
  }
  return localized(
    `Unfortunately, link tracking servers are currently not available. Please try again later. Error: %@`,
    error.message
  );
}

const LinkTrackingButtonInner: React.FC<Props> = ({ draft, session }) => {
  if (draft.plaintext) {
    return <span />;
  }
  return (
    <MetadataComposerToggleButton
      iconName="icon-composer-linktracking.png"
      pluginId={PLUGIN_ID}
      pluginName={PLUGIN_NAME}
      metadataEnabledValue={{ tracked: true }}
      errorMessage={errorMessage}
      draft={draft}
      session={session}
    />
  );
};
LinkTrackingButtonInner.displayName = 'LinkTrackingButton';

const LinkTrackingButton = React.memo(
  LinkTrackingButtonInner,
  (prev, next) =>
    prev.draft.metadataForPluginId(PLUGIN_ID) === next.draft.metadataForPluginId(PLUGIN_ID)
);

export default LinkTrackingButton;
