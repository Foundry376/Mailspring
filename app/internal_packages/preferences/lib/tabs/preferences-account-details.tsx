/* eslint global-require: 0 */
import fs from 'fs';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { shell, ipcRenderer, remote } from 'electron';
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
            style={{ marginTop: 0, marginLeft: 8 }}
            value={autoaddress.type}
            onChange={e => onChange({ ...autoaddress, type: e.target.value as 'cc' | 'bcc' })}
            onBlur={onSaveChanges}
          >
            <option value="cc">{localized('Cc')}</option>
            <option value="bcc">{localized('Bcc')}</option>
          </select>
          :
        </div>
        <input
          type="text"
          value={autoaddress.value}
          onChange={e => onChange({ ...autoaddress, value: e.target.value })}
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

  _setState = (updates, callback = () => { }) => {
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

  _onManageContacts = () => {
    ipcRenderer.send('command', 'application:show-contacts', {});
  };

  _onSetColor = (colorChanged) => {
    // TODO: Ensure that the account color is updated in all places where it is displayed:
    // - internal_packages/composer/lib/account-contict-field.tsx
    // - internal_packages/contacts/lib/ContactsList.tsx
    // - internal_packages/preferecnes/lib/preferences-account-list.tsx
    // - internal/packages/thread-list/lib/thread-lib-participants.tsx
    // - src/components/outline-view.tsx
    this._setState(colorChanged)
  }

  _onResetColor = () => {
    this.state.account.color = '';
    this._saveChanges();
  }

  _onContactSupport = () => {
    shell.openExternal('https://support.getmailspring.com/hc/en-us/requests/new');
  };

  _onShowErrorDetails = async () => {
    const { id, syncState, settings, provider } = this.props.account;
    const filepath = require('path').join(
      remote.app.getPath('temp'),
      `error-details-${id}-${Date.now()}.html`
    );

    try {
      const logs = await AppEnv.mailsyncBridge.tailClientLog(id);
      const result = [
        `Mailspring Version: ${AppEnv.getVersion()}`,
        `Platform: ${process.platform}`,
        `Account State: ${syncState}`,
        `Account Provider: ${provider}`,
        `IMAP Server: ${settings.imap_host}`,
        `SMTP Server: ${settings.smtp_host}`,
        `--------------------------------------------`,
        logs,
      ].join('\n');

      fs.writeFileSync(
        filepath,
        `<div style="white-space: pre-wrap; font-family: monospace;">${result}</div>`
      );
    } catch (err) {
      AppEnv.showErrorDialog({ title: 'Error', message: `Could not retrieve sync logs. ${err}` });
      return;
    }
    const win = new remote.BrowserWindow({
      width: 800,
      height: 600,
      title: `Account ${id} - Recent Logs`,
      webPreferences: {
        javascript: false,
        nodeIntegration: false,
      },
    });
    win.loadURL(`file://${filepath}`);
  };

  // Renderers

  _renderErrorDetail(message, actions: { text: string; action: () => void }[]) {
    return (
      <div className="account-error-detail">
        <div className="message">{message}</div>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          {actions.map(({ text, action }) => (
            <a className="action" onClick={action} key={text}>
              {text}
            </a>
          ))}
        </div>
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
          [
            { text: localized('Reconnect'), action: this._onReconnect },
            { text: localized('Error Details...'), action: this._onShowErrorDetails },
          ]
        );
      case Account.SYNC_STATE_ERROR:
        return this._renderErrorDetail(
          localized(
            `Mailspring encountered errors syncing this account. Crash reports have been sent to the Mailspring team and we'll work to fix these errors in the next release.`
          ),
          [
            { text: localized('Reconnect'), action: this._onReconnect },
            { text: localized('Error Details...'), action: this._onShowErrorDetails },
          ]
        );
      default:
        return null;
    }
  }

  render() {
    const { account } = this.state;
    const aliasPlaceholder = this._makeAlias(`alias@${account.emailAddress.split('@')[1]}`);
    const aliases = account.aliases;
    const defaultAlias = account.defaultAlias || 'None';

    return (
      <div className="account-details">
        {this._renderSyncErrorDetails()}
        <h6>{localized('Account Label')}</h6>
        <input
          type="text"
          value={account.label}
          onBlur={this._saveChanges}
          onChange={e => this._setState({ label: e.target.value })}
        />
        <h6>{localized('Sender Name')}</h6>
        <input
          type="text"
          value={account.name}
          onBlur={this._saveChanges}
          onChange={e => this._setState({ name: e.target.value })}
        />
        <h6>{localized('Automatic CC / BCC')}</h6>
        <AutoaddressControl
          autoaddress={account.autoaddress}
          onChange={this._onAccountAutoaddressUpdated}
          onSaveChanges={this._saveChanges}
        />
        <h6>{localized('Aliases')}</h6>
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
        {aliases.length > 0 ? (
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
        ) : (
            undefined
          )}
        <h6>{localized('Account Color')}</h6>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <input
            type="color"
            value={account.color}
            onBlur={this._saveChanges}
            onChange={e => this._onSetColor({ color: e.target.value })}
          />
          <div className="btn" style={{ marginLeft: 6 }} onClick={this._onResetColor}>
            {localized('Reset Account Color')}
          </div>
        </div>
        <h6>{localized('Account Settings')}</h6>
        <div className="btn" onClick={this._onManageContacts}>
          {localized('Manage Contacts')}
        </div>
        <div className="btn" style={{ marginLeft: 6 }} onClick={this._onReconnect}>
          {account.provider === 'gmail'
            ? localized('Re-authenticate...')
            : localized('Update Connection Settings...')}
        </div>
        <h6>{localized('Local Data')}</h6>
        <div className="btn" onClick={this._onResetCache}>
          {localized('Rebuild Cache...')}
        </div>
      </div>
    );
  }
}

export default PreferencesAccountDetails;
