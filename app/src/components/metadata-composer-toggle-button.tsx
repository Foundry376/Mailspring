import React from 'react';
import {
  MailspringAPIRequest,
  APIError,
  localized,
  FeatureUsageStore,
  Message,
  DraftEditingSession,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import classnames from 'classnames';
import _ from 'underscore';

type MetadataComposerToggleButtonProps = {
  iconUrl?: string;
  iconName?: string;
  pluginId: string;
  pluginName: string;
  metadataEnabledValue: any;
  errorMessage: (...args: any[]) => any;
  draft: Message;
  session: DraftEditingSession;
};
type MetadataComposerToggleButtonState = {
  pending: boolean;
  onByDefaultButUsedUp: boolean;
};

export default class MetadataComposerToggleButton extends React.Component<
  MetadataComposerToggleButtonProps,
  MetadataComposerToggleButtonState
> {
  static displayName = 'MetadataComposerToggleButton';

  constructor(props) {
    super(props);

    const wantsDefault = this._isEnabledByDefault() && !this._isEnabled();
    this.state = {
      pending: false,
      onByDefaultButUsedUp: wantsDefault && !FeatureUsageStore.isUsable(props.pluginId),
    };
  }

  componentDidMount() {
    if (
      this._isEnabledByDefault() &&
      !this._isEnabled() &&
      FeatureUsageStore.isUsable(this.props.pluginId)
    ) {
      this._setEnabled(true);
    }
  }

  _configKey() {
    return `plugins.${this.props.pluginId}.defaultOn`;
  }

  _isEnabled() {
    const { pluginId, draft, metadataEnabledValue } = this.props;
    const value = draft.metadataForPluginId(pluginId);
    return _.isEqual(value, metadataEnabledValue) || _.isMatch(value, metadataEnabledValue);
  }

  _isEnabledByDefault() {
    return AppEnv.config.get(this._configKey()) !== false;
  }

  async _setEnabled(enabled) {
    const { pluginId, session, metadataEnabledValue } = this.props;

    const metadataValue = enabled ? metadataEnabledValue : null;
    this.setState({ pending: true });

    try {
      session.changes.addPluginMetadata(pluginId, metadataValue);
    } catch (error) {
      const { errorMessage } = this.props;

      AppEnv.config.set(this._configKey(), false);

      let title = localized('Error');
      if (!(error instanceof APIError)) {
        AppEnv.reportError(error);
      } else if (error.statusCode === 400) {
        AppEnv.reportError(error);
      } else if (MailspringAPIRequest.TimeoutErrorCodes.includes(error.statusCode)) {
        title = localized('Offline');
      }

      AppEnv.showErrorDialog({ title, message: errorMessage(error) });
    }

    this.setState({ pending: false });
  }

  _onClick = async (e) => {
    const { pluginId } = this.props;
    let nextEnabled = !this._isEnabled();
    if (this.state.pending) {
      return;
    }

    const simulateUsedUp = e.shiftKey && e.altKey;

    // note: we don't actually increment the usage counters until you /send/
    // the message with link and open tracking, we just display the notice

    if (nextEnabled && (!FeatureUsageStore.isUsable(pluginId) || simulateUsedUp)) {
      try {
        await FeatureUsageStore.displayUpgradeModal(pluginId, {
          headerText: localized(`All used up!`),
          rechargeText: `${localized(
            `You can get open and click notifications for %1$@ emails each %2$@ with Mailspring Basic.`
          )} ${localized('Upgrade to Pro today!')}`,
          iconUrl: `mailspring://${pluginId}/assets/ic-modal-image@2x.png`,
        });
      } catch (err) {
        // user does not have access to this feature
        if (this.state.onByDefaultButUsedUp) {
          this.setState({ onByDefaultButUsedUp: false });
        }
        nextEnabled = false;
      }
    }

    AppEnv.config.set(this._configKey(), nextEnabled);
    this._setEnabled(nextEnabled);
  };

  render() {
    const enabled = this._isEnabled();

    const className = classnames({
      btn: true,
      'btn-toolbar': true,
      'btn-pending': this.state.pending,
      'btn-enabled': enabled,
    });

    const attrs: any = {};
    if (this.props.iconUrl) {
      attrs.url = this.props.iconUrl;
    } else if (this.props.iconName) {
      attrs.name = this.props.iconName;
    }

    return (
      <button
        className={className}
        onClick={this._onClick}
        title={`${enabled ? localized('Disable') : localized('Enable')} ${this.props.pluginName}`}
        aria-label={`${enabled ? localized('Disable') : localized('Enable')} ${this.props.pluginName}`}
        tabIndex={-1}
      >
        {this.state.onByDefaultButUsedUp ? (
          <div style={{ position: 'absolute', zIndex: 2, transform: 'translate(14px, -4px)' }}>
            <RetinaImg
              name="tiny-warning-sign.png"
              mode={RetinaImg.Mode.ContentPreserve}
              aria-hidden="true"
            />
          </div>
        ) : null}
        <RetinaImg {...attrs} mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
      </button>
    );
  }
}
