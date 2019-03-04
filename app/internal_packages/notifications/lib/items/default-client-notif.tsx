import React from 'react';
import { localized, DefaultClientHelper } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';
import { IDisposable } from 'rx-core';

const SETTINGS_KEY = 'mailto.prompted-about-default';

interface State {
  initializing: boolean;
  alreadyPrompted: boolean;
  registered?: boolean;
}

export default class DefaultClientNotification extends React.Component<{}, State> {
  static displayName = 'DefaultClientNotification';

  helper = new DefaultClientHelper();
  state: State = Object.assign(this.getStateFromStores(), { initializing: true });
  mounted = false;
  disposable?: IDisposable;

  componentDidMount() {
    this.mounted = true;
    this.helper.isRegisteredForURLScheme('mailto', registered => {
      if (this.mounted) {
        this.setState({
          initializing: false,
          registered: registered,
        });
      }
    });
    this.disposable = AppEnv.config.onDidChange(SETTINGS_KEY, () =>
      this.setState(this.getStateFromStores())
    );
  }

  componentWillUnmount() {
    this.mounted = false;
    this.disposable.dispose();
  }

  getStateFromStores() {
    return {
      alreadyPrompted: AppEnv.config.get(SETTINGS_KEY),
    };
  }

  _onAccept = () => {
    this.helper.registerForURLScheme('mailto', err => {
      if (err) {
        AppEnv.reportError(err);
      }
    });
    AppEnv.config.set(SETTINGS_KEY, true);
  };

  _onDecline = () => {
    AppEnv.config.set(SETTINGS_KEY, true);
  };

  render() {
    if (this.state.initializing || this.state.alreadyPrompted || this.state.registered) {
      return <span />;
    }
    return (
      <Notification
        title={localized('Would you like to make Mailspring your default mail client?')}
        priority="1"
        icon="volstead-defaultclient.png"
        actions={[
          {
            label: localized('Yes'),
            fn: this._onAccept,
          },
          {
            label: localized('No'),
            fn: this._onDecline,
          },
        ]}
      />
    );
  }
}
