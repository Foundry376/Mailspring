/* eslint global-require: 0 */
import {AccountStore, Account, Actions, React, IdentityStore} from 'nylas-exports'
import {RetinaImg} from 'nylas-component-kit'
import {shell} from 'electron';

export default class AccountErrorHeader extends React.Component {
  static displayName = 'AccountErrorHeader';

  constructor() {
    super();
    this.state = this.getStateFromStores();
  }

  componentDidMount() {
    this.mounted = true;
    this.unsubscribe = AccountStore.listen(() => this._onAccountsChanged());
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  getStateFromStores() {
    return {accounts: AccountStore.accounts()}
  }

  _onAccountsChanged() {
    this.setState(this.getStateFromStores())
  }

  _reconnect(existingAccount) {
    const ipc = require('electron').ipcRenderer;
    ipc.send('command', 'application:add-account', {existingAccount});
  }

  _openPreferences() {
    Actions.switchPreferencesTab('Accounts');
    Actions.openPreferences()
  }

  _contactSupport() {
    const {shell} = require("electron");
    shell.openExternal("https://support.nylas.com/hc/en-us/requests/new");
  }

  _onCheckAgain = (event) => {
    const errorAccounts = this.state.accounts.filter(a => a.hasSyncStateError());
    this.setState({refreshing: true});

    event.stopPropagation();

    AccountStore.refreshHealthOfAccounts(errorAccounts.map(a => a.id)).finally(() => {
      if (!this.mounted) { return; }
      this.setState({refreshing: false});
    });
  }

  _onUpgrade = () => {
    this.setState({buildingUpgradeURL: true});
    IdentityStore.fetchSingleSignOnURL('/dashboard').then((url) => {
      this.setState({buildingUpgradeURL: false});
      shell.openExternal(url);
    });
  }

  _renderErrorHeader(message, buttonName, actionCallback) {
    return (
      <div className="account-error-header notifications-sticky">
        <div
          className={"notifications-sticky-item notification-error has-default-action"}
          onClick={actionCallback}
        >
          <RetinaImg
            className="icon"
            name="icon-alert-onred.png"
            mode={RetinaImg.Mode.ContentPreserve}
          />
          <div className="message">
            {message}
          </div>
          <a className="action refresh" onClick={this._onCheckAgain}>
            {this.state.refreshing ? "Checking..." : "Check Again"}
          </a>
          <a className="action default" onClick={actionCallback}>
            {buttonName}
          </a>
        </div>
      </div>
    )
  }

  _renderUpgradeHeader() {
    return (
      <div className="account-error-header notifications-sticky">
        <div
          className={"notifications-sticky-item notification-upgrade has-default-action"}
          onClick={this._onUpgrade}
        >
          <RetinaImg
            className="icon"
            name="ic-upgrade.png"
            mode={RetinaImg.Mode.ContentIsMask}
          />
          <div className="message">
            Your 30-day trial has expired and we've paused your mailboxes. Upgrade today to continue using N1!
          </div>
          <a className="action refresh" onClick={this._onCheckAgain}>
            {this.state.refreshing ? "Checking..." : "Check Again"}
          </a>
          <a className="action default" onClick={this._onUpgrade}>
            {this.state.buildingUpgradeURL ? "Please wait..." : "Upgrade to Nylas Pro..."}
          </a>
        </div>
      </div>
    )
  }

  render() {
    const errorAccounts = this.state.accounts.filter(a => a.hasSyncStateError());
    const trialExpiredAccounts = errorAccounts.filter(a => a.trialExpirationDate && (a.trialExpirationDate < new Date()))

    if (trialExpiredAccounts.length > 0 || true) {
      return this._renderUpgradeHeader(trialExpiredAccounts)
    }

    if (errorAccounts.length === 1) {
      const account = errorAccounts[0];

      switch (account.syncState) {
        case Account.SYNC_STATE_AUTH_FAILED:
          return this._renderErrorHeader(
            `Nylas N1 can no longer authenticate with ${account.emailAddress}. Click here to reconnect.`,
            "Reconnect",
            () => this._reconnect(account));

        case Account.SYNC_STATE_STOPPED:
          return this._renderErrorHeader(
            `The cloud sync for ${account.emailAddress} has been disabled. You will
            not be able to send or receive mail. Please contact Nylas support.`,
            "Contact support",
            () => this._contactSupport());

        default:
          return this._renderErrorHeader(
            `Nylas encountered an error while syncing mail for ${account.emailAddress} - we're
            looking into it. Contact Nylas support for details.`,
            "Contact support",
            () => this._contactSupport());
      }
    }
    if (errorAccounts.length > 1) {
      return this._renderErrorHeader("Several of your accounts are having issues. " +
        "You will not be able to send or receive mail. Click here to manage your accounts.",
        "Open preferences",
        () => this._openPreferences());
    }
    return <span />;
  }
}
