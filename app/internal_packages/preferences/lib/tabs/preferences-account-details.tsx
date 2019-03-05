/* eslint global-require: 0 */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { shell, ipcRenderer } from 'electron';
import { EditableList } from 'mailspring-component-kit';
import {
  localized,
  RegExpUtils,
  KeyManager,
  Account,
  AccountAutoaddress,
} from 'mailspring-exports';

interface AutoaddressControlProps {
  autoaddress: AccountAutoaddress;
  onChange: (obj: AccountAutoaddress) => void;
  onSaveChanges: () => void;
}

class AutoaddressControl extends Component<AutoaddressControlProps> {
  render() {
    const { autoaddress, onChange, onSaveChanges } = this.props;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 3 }}>
          {localized('When composing, automatically')}
          <select
            style={{ marginTop: 0 }}
            value={autoaddress.type}
            onChange={e => onChange(Object.assign({}, autoaddress, { type: e.target.value }))}
            onBlur={onSaveChanges}
          >
            <option value="cc">{localized('Cc')}</option>
            <option value="bcc">{localized('Bcc')}</option>
          </select>:
        </div>
        <input
          type="text"
          value={autoaddress.value}
          onChange={e => onChange(Object.assign({}, autoaddress, { value: e.target.value }))}
          onBlur={onSaveChanges}
          placeholder={localized('Comma-separated email addresses')}
        />
      </div>
    );
  }
}

class PreferencesAccountDetails extends Component<
  {
    account: Account;
    onAccountUpdated: (account: Account, newAccount: Account) => void;
  },
  {
    account: Account;
  }
> {
  static propTypes = {
    account: PropTypes.object,
    onAccountUpdated: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = { account: props.account.clone() };
  }

  componentWillReceiveProps(nextProps) {
    this.setState({ account: nextProps.account.clone() });
  }

  componentWillUnmount() {
    this._saveChanges();
  }

  // Helpers

  /**
   * @private Will transform any user input into alias format.
   * It will ignore any text after an email, if one is entered.
   * If no email is entered, it will use the account's email.
   * It will treat the text before the email as the name for the alias.
   * If no name is entered, it will use the account's name value.
   * @param {string} str - The string the user entered on the alias input
   * @param {object} [account=this.props.account] - The account object
   */
  _makeAlias(str, account = this.props.account) {
    const emailRegex = RegExpUtils.emailRegex();
    const match = emailRegex.exec(str);
    if (!match) {
      return `${str || account.name} <${account.emailAddress}>`;
    }
    const email = match[0];
    let name = str.slice(0, Math.max(0, match.index - 1));
    if (!name) {
      name = account.name || localized('No name provided');
    }
    name = name.trim();
    // TODO Sanitize the name string
    return `${name} <${email}>`;
  }

  _saveChanges = () => {
    this.props.onAccountUpdated(this.props.account, this.state.account);
  };

  _setState = (updates, callback = () => {}) => {
    const account = Object.assign(this.state.account.clone(), updates);
    this.setState({ account }, callback);
  };

  _setStateAndSave = updates => {
    this._setState(updates, () => {
      this._saveChanges();
    });
  };

  // Handlers
  _onAccountAutoaddressUpdated = autoaddress => {
    this._setState({ autoaddress });
  };

  _onAccountAliasCreated = newAlias => {
    const coercedAlias = this._makeAlias(newAlias);
    const aliases = this.state.account.aliases.concat([coercedAlias]);
    this._setStateAndSave({ aliases });
  };

  _onAccountAliasUpdated = (newAlias, alias, idx) => {
    const coercedAlias = this._makeAlias(newAlias);
    const aliases = this.state.account.aliases.slice();
    let defaultAlias = this.state.account.defaultAlias;
    if (defaultAlias === alias) {
      defaultAlias = coercedAlias;
    }
    aliases[idx] = coercedAlias;
    this._setStateAndSave({ aliases, defaultAlias });
  };

  _onAccountAliasRemoved = (alias, idx) => {
    const aliases = this.state.account.aliases.slice();
    let defaultAlias = this.state.account.defaultAlias;
    if (defaultAlias === alias) {
      defaultAlias = null;
    }
    aliases.splice(idx, 1);
    this._setStateAndSave({ aliases, defaultAlias });
  };

  _onDefaultAliasSelected = event => {
    const defaultAlias = event.target.value === 'None' ? null : event.target.value;
    this._setStateAndSave({ defaultAlias });
  };

  _onReconnect = async () => {
    ipcRenderer.send('command', 'application:add-account', {
      existingAccountJSON: await KeyManager.insertAccountSecrets(this.state.account),
    });
  };

  _onResetCache = () => {
    AppEnv.mailsyncBridge.resetCacheForAccount(this.state.account);
  };

  _onContactSupport = () => {
    shell.openExternal('https://support.getmailspring.com/hc/en-us/requests/new');
  };

  // Renderers

  _renderDefaultAliasSelector(account) {
    const aliases = account.aliases;
    const defaultAlias = account.defaultAlias || 'None';
    if (aliases.length > 0) {
      return (
        <div className="default-alias-selector">
          <div>{localized('Default for new messages:')}</div>
          <select value={defaultAlias} onChange={this._onDefaultAliasSelected}>
            <option value="None">{`${account.name} <${account.emailAddress}>`}</option>
            {aliases.map((alias, idx) => (
              <option key={`alias-${idx}`} value={alias}>
                {alias}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return null;
  }

  _renderErrorDetail(message, buttonText, buttonAction) {
    return (
      <div className="account-error-detail">
        <div className="message">{message}</div>
        <a className="action" onClick={buttonAction}>
          {buttonText}
        </a>
      </div>
    );
  }

  _renderSyncErrorDetails() {
    const { account } = this.state;

    switch (account.syncState) {
      case Account.SYNC_STATE_AUTH_FAILED:
        return this._renderErrorDetail(
          localized(
            `Mailspring can no longer authenticate with %@. The password or authentication may have changed.`,
            account.emailAddress
          ),
          localized('Reconnect'),
          this._onReconnect
        );
      case Account.SYNC_STATE_ERROR:
        return this._renderErrorDetail(
          localized(
            `Mailspring encountered errors syncing this account. Crash reports have been sent to the Mailspring team and we'll work to fix these errors in the next release.`
          ),
          localized('Try Reconnecting'),
          this._onReconnect
        );
      default:
        return null;
    }
  }

  render() {
    const { account } = this.state;
    const aliasPlaceholder = this._makeAlias(`alias@${account.emailAddress.split('@')[1]}`);

    return (
      <div className="account-details">
        {this._renderSyncErrorDetails()}
        <h3>{localized('Account Label')}</h3>
        <input
          type="text"
          value={account.label}
          onBlur={this._saveChanges}
          onChange={e => this._setState({ label: e.target.value })}
        />
        <h3>{localized('Account Settings')}</h3>
        <div className="btn" onClick={this._onReconnect}>
          {account.provider === 'imap'
            ? localized('Update Connection Settings...')
            : localized('Re-authenticate...')}
        </div>
        <div className="btn" style={{ margin: 6 }} onClick={this._onResetCache}>
          {localized('Rebuild Cache...')}
        </div>
        <h3>{localized('Sender Name')}</h3>
        <input
          type="text"
          value={account.name}
          onBlur={this._saveChanges}
          onChange={e => this._setState({ name: e.target.value })}
        />
        <h3>{localized('Automatic CC / BCC')}</h3>
        <AutoaddressControl
          autoaddress={account.autoaddress}
          onChange={this._onAccountAutoaddressUpdated}
          onSaveChanges={this._saveChanges}
        />
        <h3>{localized('Aliases')}</h3>
        <div className="platform-note">
          {localized(
            'You may need to configure aliases with your mail provider (Outlook, Gmail) before using them.'
          )}
        </div>
        <EditableList
          showEditIcon
          items={account.aliases}
          createInputProps={{ placeholder: aliasPlaceholder }}
          onItemCreated={this._onAccountAliasCreated}
          onItemEdited={this._onAccountAliasUpdated}
          onDeleteItem={this._onAccountAliasRemoved}
        />
        {this._renderDefaultAliasSelector(account)}
      </div>
    );
  }
}

export default PreferencesAccountDetails;
