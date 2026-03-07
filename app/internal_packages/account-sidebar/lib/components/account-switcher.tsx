import React from 'react';
import { Account, localized, Actions, PropTypes } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ipcRenderer } from 'electron';
import * as AccountCommands from '../account-commands';

export default class AccountSwitcher extends React.Component<{
  accounts: Account[];
  sidebarAccountIds: string[];
}> {
  static displayName = 'AccountSwitcher';

  static propTypes = {
    accounts: PropTypes.array.isRequired,
    sidebarAccountIds: PropTypes.array.isRequired,
  };

  _makeMenuTemplate = () => {
    let template = AccountCommands.menuTemplate(this.props.accounts, this.props.sidebarAccountIds, {
      clickHandlers: true,
    });
    template = template.concat([
      { type: 'separator' },
      { label: `${localized('Add Account')}...`, click: this._onAddAccount },
      { label: `${localized('Manage Accounts')}...`, click: this._onManageAccounts },
    ]);
    return template;
  };

  // Handlers

  _onAddAccount = () => {
    ipcRenderer.send('command', 'application:add-account');
  };

  _onManageAccounts = () => {
    Actions.switchPreferencesTab('Accounts');
    Actions.openPreferences();
  };

  _onShowMenu = () => {
    const menu = require('@electron/remote').Menu.buildFromTemplate(this._makeMenuTemplate());
    menu.popup({});
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onShowMenu();
    }
  };

  render() {
    return (
      <div
        className="account-switcher"
        role="button"
        tabIndex={0}
        aria-label={localized('Account switcher')}
        aria-haspopup="menu"
        onMouseDown={this._onShowMenu}
        onKeyDown={this._onKeyDown}
      >
        <RetinaImg
          style={{ width: 13, height: 14 }}
          name="account-switcher-dropdown.png"
          mode={RetinaImg.Mode.ContentDark}
          alt=""
        />
      </div>
    );
  }
}
