import React from 'react';
import {
  localized,
  Account,
  AccountStore,
  CategoryStore,
  Category,
  Actions,
  ChangeRoleMappingTask,
} from 'mailspring-exports';

import CategorySelection from './category-selection';

const SELECTABLE_ROLES = ['inbox', 'sent', 'drafts', 'spam', 'archive', 'trash'];

// Gmail's system labels have fixed roles, which the sync engine sets again on every pass on any
// server advertising X-GM-EXT-1, so a role chosen here would not last. The hosts cover a Google
// account added as plain IMAP; imap.googlemail.com is Google's older name for the same server.
const GMAIL_IMAP_HOSTS = ['imap.gmail.com', 'imap.googlemail.com'];

function rolesAreFixedByServer(account: Account) {
  return account.provider === 'gmail' || GMAIL_IMAP_HOSTS.includes(account.settings.imap_host);
}

interface State {
  assignments: {
    [accountId: string]: {
      [role: string]: Category;
    };
  };
  all: {
    [accountId: string]: Category[];
  };
  containerFolderDefault: string;
}

export default class PreferencesCategoryMapper extends React.Component<
  Record<string, unknown>,
  State
> {
  _unlisten?: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._unlisten = CategoryStore.listen(() => {
      this.setState(this._getStateFromStores());
    });
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _getStateFromStores() {
    const assignments = {};
    const all = {};

    for (const cat of CategoryStore.categories()) {
      all[cat.accountId] = all[cat.accountId] || [];
      all[cat.accountId].push(cat);
      if (SELECTABLE_ROLES.includes(cat.role)) {
        assignments[cat.accountId] = assignments[cat.accountId] || {};
        assignments[cat.accountId][cat.role] = cat;
      }
    }

    const containerFolderDefault = AccountStore.containerFolderDefaultGetter();
    return { assignments, all, containerFolderDefault };
  }

  _onCategorySelection = async (account, role, category) => {
    // our state will be updated as soon as the sync worker commits the change
    Actions.queueTask(
      new ChangeRoleMappingTask({
        role: role,
        path: category.path,
        accountId: account.id,
      })
    );
  };

  _updateContainerFolderDefault = () => {
    Actions.updateContainerFolderDefault(this.state.containerFolderDefault);
  };

  _renderRoleSection = (account: Account, role: string) => {
    if (!account) return false;

    const assignments = this.state.assignments[account.id];
    if (!assignments) {
      // Account may not have completed an initial sync yet
      return false;
    }
    return (
      <div className="role-section" key={`${account.id}-${role}`}>
        <div className="col-left">{Category.LocalizedStringForRole[role]}:</div>
        <div className="col-right">
          <CategorySelection
            all={this.state.all[account.id]}
            current={assignments[role]}
            onSelect={(category) => this._onCategorySelection(account, role, category)}
          />
        </div>
      </div>
    );
  };

  render() {
    const accounts = AccountStore.accounts();
    const mappableAccounts = accounts.filter((account) => !rolesAreFixedByServer(account));

    return (
      <div className="category-mapper-container">
        <h6>{localized('Default Container Folder (folder/subfolder)')}</h6>
        <input
          type="text"
          value={this.state.containerFolderDefault}
          onBlur={(e) => this._updateContainerFolderDefault()}
          onChange={(e) => this.setState({ containerFolderDefault: e.target.value })}
        />
        {mappableAccounts.length < accounts.length && (
          <div className="platform-note">
            {localized(
              'Gmail accounts must use the standard inbox, sent, trash, spam labels provided by the server.'
            )}
          </div>
        )}
        {mappableAccounts.map((account) => (
          <div key={account.id}>
            <div className="account-section-title">{account.label}</div>
            {SELECTABLE_ROLES.map((role) => this._renderRoleSection(account, role))}
          </div>
        ))}
      </div>
    );
  }
}
