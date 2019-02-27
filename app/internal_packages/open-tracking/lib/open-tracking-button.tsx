import React from 'react';
import { localized, PropTypes, APIError, MailspringAPIRequest } from 'mailspring-exports';
import { MetadataComposerToggleButton } from 'mailspring-component-kit';
import { PLUGIN_ID, PLUGIN_NAME } from './open-tracking-constants';

export default class OpenTrackingButton extends React.Component {
  static displayName = 'OpenTrackingButton';

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
  };

  shouldComponentUpdate(nextProps) {
    return (
      nextProps.draft.metadataForPluginId(PLUGIN_ID) !==
      this.props.draft.metadataForPluginId(PLUGIN_ID)
    );
  }

  _errorMessage(error) {
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

  render() {
    const enabledValue = {
      open_count: 0,
      open_data: [],
    };

    return (
      <MetadataComposerToggleButton
        iconUrl="mailspring://open-tracking/assets/icon-composer-eye@2x.png"
        pluginId={PLUGIN_ID}
        pluginName={PLUGIN_NAME}
        metadataEnabledValue={enabledValue}
        errorMessage={this._errorMessage}
        draft={this.props.draft}
        session={this.props.session}
      />
    );
  }
}

OpenTrackingButton.containerRequired = false;
