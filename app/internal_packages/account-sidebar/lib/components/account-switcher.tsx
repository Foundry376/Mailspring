import React from 'react';
import { localized, Actions, PropTypes } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ipcRenderer, remote } from 'electron';
import * as AccountCommands from '../account-commands';

export default class AccountSwitcher extends React.Component {
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
    const menu = remote.Menu.buildFromTemplate(this._makeMenuTemplate());
    menu.popup({});
  };

  render() {
    return (
      <div className="account-switcher" onMouseDown={this._onShowMenu}>
        <RetinaImg
          style={{ width: 13, height: 14 }}
          name="account-switcher-dropdown.png"
          mode={RetinaImg.Mode.ContentDark}
        />
      </div>
    );
  }
}
