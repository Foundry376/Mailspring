import { shell, ipcRenderer } from 'electron';
import React from 'react';
import { localized, Account, AccountStore, Actions, KeyManager } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';

export default class AccountErrorNotification extends React.Component {
  static displayName = 'AccountErrorNotification';

  constructor() {
    super();
    this._checkingTimeout = null;
    this.state = {
      checking: false,
      debugKeyPressed: false,
      accounts: AccountStore.accounts(),
    };
  }

  componentDidMount() {
    this.unlisten = AccountStore.listen(() =>
      this.setState({
        accounts: AccountStore.accounts(),
      })
    );
  }

  componentWillUnmount() {
    this.unlisten();
  }

  _onContactSupport = erroredAccount => {
    let url = 'https://support.getmailspring.com/hc/en-us/requests/new';
    if (erroredAccount) {
      url += `?email=${encodeURIComponent(erroredAccount.emailAddress)}`;
      const { syncError } = erroredAccount;
      if (syncError != null) {
        url += `&subject=${encodeURIComponent('Sync Error')}`;
        const description = encodeURIComponent(
          `Sync Error:\n\`\`\`\n${JSON.stringify(syncError, null, 2)}\n\`\`\``
        );
        url += `&description=${description}`;
      }
    }
    shell.openExternal(url);
  };

  _onReconnect = async account => {
    ipcRenderer.send('command', 'application:add-account', {
      existingAccountJSON: await KeyManager.insertAccountSecrets(account),
    });
  };

  _onOpenAccountPreferences = () => {
    Actions.switchPreferencesTab('Accounts');
    Actions.openPreferences();
  };

  _onCheckAgain(accounts) {
    clearTimeout(this._checkingTimeout);
    this.setState({ checking: true });
    this._checkingTimeout = setTimeout(() => this.setState({ checking: false }), 10000);

    accounts.forEach(acct => AppEnv.mailsyncBridge.forceRelaunchClient(acct));
  }

  render() {
    const erroredAccounts = this.state.accounts.filter(a => a.hasSyncStateError());
    const checkAgainLabel = this.state.checking
      ? `${localized('Checking')}...`
      : localized('Check Again');
    let title;
    let subtitle;
    let subtitleAction;
    let actions;
    if (erroredAccounts.length === 0) {
      return <span />;
    } else if (erroredAccounts.length > 1) {
      title = localized('Several of your accounts are having issues');
      actions = [
        {
          label: checkAgainLabel,
          fn: () => this._onCheckAgain(AccountStore.accounts().filter(a => a.hasSyncStateError())),
        },
        {
          label: localized('Manage'),
          fn: this._onOpenAccountPreferences,
        },
      ];
    } else {
      const erroredAccount = erroredAccounts[0];
      switch (erroredAccount.syncState) {
        case Account.SYNC_STATE_AUTH_FAILED:
          title = `Cannot authenticate with ${erroredAccount.emailAddress}`;
          actions = [
            {
              label: checkAgainLabel,
              fn: () => this._onCheckAgain([erroredAccount]),
            },
            {
              label: localized('Reconnect'),
              fn: () => this._onReconnect(erroredAccount),
            },
          ];
          break;
        default: {
          title = localized(`Encountered an error while syncing %@`, erroredAccount.emailAddress);
          actions = [
            {
              label: this.state.checking ? localized('Retrying...') : localized('Try Again'),
              fn: () => this._onCheckAgain([erroredAccount]),
            },
          ];
        }
      }
    }

    return (
      <Notification
        priority="3"
        isError
        title={title}
        subtitle={subtitle}
        subtitleAction={subtitleAction}
        actions={actions}
        icon="volstead-error.png"
      />
    );
  }
}
