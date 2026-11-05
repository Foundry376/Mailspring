import { AccountStore } from 'mailspring-exports';
import React from 'react';

const EnabledKey = 'core.workspace.showAccountColorBar';

class AccountColorBar extends React.Component<
  { accountId: string },
  { color: string | null; enabled: boolean }
> {
  static displayName = 'AccountColorBar';

  unsubscribe?: () => void;
  configSubscription?: { dispose: () => void };

  constructor(props) {
    super(props);
    this.state = { color: this.getColor(props), enabled: AppEnv.config.get(EnabledKey) };
  }

  getColor = (props = this.props) => {
    const account = AccountStore.accountForId(props.accountId);
    return account ? account.color : null;
  };

  componentDidMount() {
    this.configSubscription = AppEnv.config.onDidChange(EnabledKey, () =>
      this.setState({ enabled: AppEnv.config.get(EnabledKey) })
    );
    this.unsubscribe = AccountStore.listen(() => {
      const nextColor = this.getColor();
      if (this.state.color !== nextColor) this.setState({ color: nextColor });
    });
  }

  componentWillUnmount() {
    this.unsubscribe && this.unsubscribe();
    this.configSubscription && this.configSubscription.dispose();
  }

  render() {
    return this.state.color && this.state.enabled ? (
      <span
        style={{
          height: '50%',
          paddingLeft: '4px',
          borderLeftWidth: '4px',
          borderLeftColor: this.state.color,
          borderLeftStyle: 'solid',
        }}
      />
    ) : (
      <span />
    );
  }
}

export default AccountColorBar;
