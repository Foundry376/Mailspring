/* eslint global-require: 0 */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { shell, ipcRenderer } from 'electron';
import { EditableList } from 'mailspring-component-kit';
import { RegExpUtils, KeyManager, Account } from 'mailspring-exports';
import PreferencesCategory from './preferences-category';

class AutoaddressControl extends Component {
  render() {
    const { autoaddress, onChange, onSaveChanges } = this.props;

    return (
      <div>
        <div className="item">
          <label>When composing, automatically</label>
          <select
            value={autoaddress.type}
            onChange={e => onChange(Object.assign({}, autoaddress, { type: e.target.value }))}
            onBlur={onSaveChanges}
          >
            <option value="cc">CC</option>
            <option value="bcc">BCC</option>
          </select>
          &nbsp;&nbsp;:
        </div>
        <div className="item">
          <input
            type="text"
            value={autoaddress.value}
            onChange={e => onChange(Object.assign({}, autoaddress, { value: e.target.value }))}
            onBlur={onSaveChanges}
            placeholder="Comma-separated email addresses"
          />
        </div>
      </div>
    );
  }
}
class PreferencesAccountDetails extends Component {
  static propTypes = {
    account: PropTypes.object,
    accounts: PropTypes.array,
    onAccountUpdated: PropTypes.func.isRequired,
    onRemoveAccount: PropTypes.func,
    onSelectAccount: PropTypes.func,
  };

  constructor(props) {
    super(props);
    this.state = { account: props.account.clone() };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
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
      name = account.name || 'No name provided';
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
  _onAccountLabelUpdated = event => {
    this._setState({ label: event.target.value });
  };
  _onAccountNameUpdated = event => {
    this._setState({ name: event.target.value });
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

  _onDeleteAccount = () => {
    const { account, onRemoveAccount, onSelectAccount } = this.props;
    const index = this.props.accounts.indexOf(account);
    if (account && typeof onRemoveAccount === 'function') {
      // Move the selection 1 up or down after deleting
      const newIndex = index === 0 ? index + 1 : index - 1;
      onRemoveAccount(account);
      if (this.props.accounts[newIndex] && typeof onSelectAccount === 'function') {
        onSelectAccount(this.props.accounts[newIndex]);
      }
    }
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
        <div>
          <div className="item">
            <label>Default for new messages:</label>
          </div>
          <div className="item">
            <select value={defaultAlias} onChange={this._onDefaultAliasSelected}>
              <option value="None">{`${account.name} <${account.emailAddress}>`}</option>
              {aliases.map((alias, idx) => (
                <option key={`alias-${idx}`} value={alias}>
                  {alias}
                </option>
              ))}
            </select>
          </div>
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
          `EdisonMail can no longer authenticate with ${account.emailAddress}. The password
            or authentication may have changed.`,
          'Reconnect',
          this._onReconnect
        );
      case Account.SYNC_STATE_ERROR:
        return this._renderErrorDetail(
          `EdisonMail encountered errors syncing this account. Crash reports
          have been sent to the EdisonMail team and we'll work to fix these
          errors in the next release.`,
          'Try Reconnecting',
          this._onReconnect
        );
      default:
        return null;
    }
  }
  _onUpdateMailSyncSettings = ({ value, key, defaultData = {} }) => {
    try {
      const defalutMailsyncSettings = AppEnv.config.get('core.mailsync') || defaultData;
      let mailsyncSettings = this.state.account.mailsync;
      if (defalutMailsyncSettings && !mailsyncSettings) {
        mailsyncSettings = defalutMailsyncSettings;
      }
      delete mailsyncSettings.accounts;
      const tmp = {};
      tmp[key] = value;
      const newSettings = Object.assign({}, mailsyncSettings, tmp);
      const data = {};
      data[this.state.account.id] = newSettings;
      ipcRenderer.send('mailsync-config', data);
      return newSettings;
    } catch (e) {
      AppEnv.reportError(e);
    }
  };
  _onFetchEmailIntervalUpdate = event => {
    try {
      const fetchInterval = parseInt(event.target.value, 10);
      const newSettings = this._onUpdateMailSyncSettings({
        value: fetchInterval,
        key: 'fetchEmailInterval',
        defaultData: { fetchEmailInterval: 1 },
      });
      if (newSettings) {
        this._setState({ mailsync: newSettings });
      }
    } catch (e) {
      AppEnv.reportError(e);
    }
  };
  _onFetchEmailRangeUpdate = event => {
    try {
      const fetchRange = parseInt(event.target.value, 10);
      const newSettings = this._onUpdateMailSyncSettings({
        value: fetchRange,
        key: 'fetchEmailRange',
        defaultData: { fetchEmailRange: 365 },
      });
      if (newSettings) {
        this._setState({ mailsync: newSettings });
      }
    } catch (e) {
      AppEnv.reportError(e);
    }
  };

  _renderMailFetchRange() {
    const defalutMailsyncSettings = AppEnv.config.get('core.mailsync') || {
      fetchEmailRange: 365,
      fetchEmailInterval: 1,
    };
    let mailsyncSettings = this.state.account.mailsync;
    if (defalutMailsyncSettings && !mailsyncSettings) {
      mailsyncSettings = defalutMailsyncSettings;
    } else if (!mailsyncSettings || !mailsyncSettings.fetchEmailRange) {
      AppEnv.reportError(new Error('fetchEmailRange do not have value'));
      mailsyncSettings = {
        fetchEmailRange: 365,
        fetchEmailInterval: 1,
      };
    }
    return (
      <div className="item">
        <label>Sync mail as far back as:</label>
        <select
          value={mailsyncSettings.fetchEmailRange.toString()}
          onChange={this._onFetchEmailRangeUpdate}
          onBlur={this._saveChanges}
        >
          <option value="7">Within 7 days</option>
          <option value="30">Within 30 days</option>
          <option value="90">Within 3 month</option>
          <option value="365">Within 1 year</option>
          <option value="-1">All</option>
        </select>
      </div>
    );
  }

  _renderMailFetchInterval() {
    const defalutMailsyncSettings = AppEnv.config.get('core.mailsync') || {
      fetchEmailRange: 365,
      fetchEmailInterval: 1,
    };
    let mailsyncSettings = this.state.account.mailsync;
    if (defalutMailsyncSettings && !mailsyncSettings) {
      mailsyncSettings = defalutMailsyncSettings;
    } else if (!mailsyncSettings || !mailsyncSettings.fetchEmailInterval) {
      AppEnv.reportWarning(new Error('fetchEmailInterval do not have value'));
      mailsyncSettings = {
        fetchEmailRange: 365,
        fetchEmailInterval: 1,
      };
    }
    return (
      <div className="item">
        <label>Check for mail every:</label>
        <select
          value={mailsyncSettings.fetchEmailInterval.toString()}
          onChange={this._onFetchEmailIntervalUpdate}
          onBlur={this._saveChanges}
        >
          <option value="1">Every minute</option>
          <option value="3">Every 3 minutes</option>
          <option value="5">Every 5 minutes</option>
        </select>
      </div>
    );
  }

  render() {
    const { account } = this.state;
    const aliasPlaceholder = this._makeAlias(`alias@${account.emailAddress.split('@')[1]}`);

    return (
      <div className="account-details">
        {this._renderSyncErrorDetails()}
        <div className="config-group">
          <h6>ACCOUNT DETAILS</h6>
          <div className="item">
            <label htmlFor={'Account Label'}>Account Label</label>
            <input
              type="text"
              value={account.label}
              onBlur={this._saveChanges}
              onChange={this._onAccountLabelUpdated}
            />
          </div>
          <div className="item">
            <label htmlFor={'Account Name'}>Account Name</label>
            <input
              type="text"
              value={account.name || account.label}
              onBlur={this._saveChanges}
              onChange={this._onAccountNameUpdated}
            />
          </div>

          <AutoaddressControl
            autoaddress={account.autoaddress}
            onChange={this._onAccountAutoaddressUpdated}
            onSaveChanges={this._saveChanges}
          />
        </div>
        <div className="config-group">
          <h6>ALIASES</h6>
          <div className="notice">
            You may need to configure aliases with your mail provider (Outlook, Gmail) before using
            them.
          </div>
          <div className="aliases-edit">
            <EditableList
              showEditIcon
              needScroll
              items={account.aliases}
              createInputProps={{ placeholder: aliasPlaceholder }}
              onItemCreated={this._onAccountAliasCreated}
              onItemEdited={this._onAccountAliasUpdated}
              onDeleteItem={this._onAccountAliasRemoved}
            />
          </div>
          {this._renderDefaultAliasSelector(account)}
        </div>
        <div className="config-group">
          <h6>FOLDERS</h6>
          <PreferencesCategory account={account} />
        </div>
        <div className="config-group">
          <h6>ADVANCED</h6>
          {this._renderMailFetchRange()}
          {this._renderMailFetchInterval()}
          <button onClick={this._onReconnect}>
            {account.provider === 'imap'
              ? 'Update Connection Settings...'
              : 'Re-authenticate Account'}
          </button>
          <button onClick={this._onResetCache}>Rebuild Cache</button>
          <button className={'danger'} onClick={this._onDeleteAccount}>
            Remove Account
          </button>
        </div>
      </div>
    );
  }
}

export default PreferencesAccountDetails;
