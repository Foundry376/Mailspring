import React from 'react';
import { localized, Actions, AccountStore, IdentityStore, IIdentity } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';

export default class PleaseSubscribeNotification extends React.Component<{}, { msg: string }> {
  static displayName = 'PleaseSubscribeNotification';

  unlisteners: Array<() => void>;

  constructor(props) {
    super(props);
    this.state = this.getStateFromStores();
  }

  componentDidMount() {
    this.unlisteners = [
      AccountStore.listen(() => this.setState(this.getStateFromStores())),
      IdentityStore.listen(() => this.setState(this.getStateFromStores())),
    ];
  }

  componentWillUnmount() {
    for (const u of this.unlisteners) {
      u();
    }
  }

  getStateFromStores() {
    const { stripePlanEffective, stripePlan } = (IdentityStore.identity() || {}) as IIdentity;
    const accountCount = AccountStore.accounts().length;

    let msg = null;
    if (stripePlan === 'Basic' && accountCount > 4) {
      msg = localized(
        `You're syncing more than four accounts — please consider paying for Mailspring Pro!`
      );
    }
    if (stripePlan !== stripePlanEffective) {
      msg = localized(`We're having trouble billing your Mailspring subscription.`);
    }

    return { msg };
  }

  render() {
    if (!this.state.msg) {
      return <span />;
    }
    return (
      <Notification
        priority="0"
        isDismissable={true}
        title={this.state.msg}
        actions={[
          {
            label: localized('Manage'),
            fn: () => {
              Actions.switchPreferencesTab('Subscription');
              Actions.openPreferences();
            },
          },
        ]}
      />
    );
  }
}
