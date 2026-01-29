import React from 'react';
import { ipcRenderer } from 'electron';
import {
  AccountStore,
  AccountGroupStore,
  AccountGroup,
  Actions,
  Account,
  localized,
} from 'mailspring-exports';
import PreferencesAccountList from './preferences-account-list';
import PreferencesAccountDetails from './preferences-account-details';

interface PreferencesAccountsState {
  accounts: Account[];
  selected: Account;
  groups: AccountGroup[];
  showGroupPicker: boolean;
  selectedGroupId: string;
  previousAccountIds: string[];
}

class PreferencesAccounts extends React.Component<
  Record<string, unknown>,
  PreferencesAccountsState
> {
  static displayName = 'PreferencesAccounts';

  _unsubscribers: Array<() => void> = [];

  constructor(props) {
    super(props);
    this.state = {
      ...this.getStateFromStores(),
      groups: AccountGroupStore.groups(),
      showGroupPicker: false,
      selectedGroupId: '',
      previousAccountIds: [],
    };
  }

  componentDidMount() {
    this._unsubscribers.push(AccountStore.listen(this._onAccountsChanged));
    this._unsubscribers.push(AccountGroupStore.listen(this._onGroupsChanged));
  }

  componentWillUnmount() {
    this._unsubscribers.forEach(unsub => unsub());
  }

  getStateFromStores({ selected }: { selected?: Account } = {}) {
    const accounts = AccountStore.accounts();
    let selectedAccount;
    if (selected) {
      selectedAccount = accounts.find(a => a.id === selected.id);
    }
    if (!selectedAccount) {
      selectedAccount = accounts[0];
    }
    return {
      accounts,
      selected: selectedAccount,
    };
  }

  _onAccountsChanged = () => {
    const prev = this.state.accounts;
    const storeState = this.getStateFromStores(this.state);
    this.setState(storeState as any);

    // If a new account was added and we had a group selected, assign it
    if (
      this.state.selectedGroupId &&
      storeState.accounts.length > prev.length
    ) {
      const prevIds = new Set(prev.map(a => a.id));
      const newAccounts = storeState.accounts.filter(a => !prevIds.has(a.id));
      if (newAccounts.length > 0) {
        const group = AccountGroupStore.groupForId(this.state.selectedGroupId);
        if (group) {
          const newIds = [...group.accountIds, ...newAccounts.map(a => a.id)];
          Actions.updateAccountGroup({ id: group.id, accountIds: newIds });
        }
        this.setState({ selectedGroupId: '' });
      }
    }
  };

  _onGroupsChanged = () => {
    this.setState({ groups: AccountGroupStore.groups() });
  };

  _onAddAccount = () => {
    const groups = AccountGroupStore.groups();
    if (groups.length > 0) {
      this.setState({
        showGroupPicker: true,
        selectedGroupId: groups[0].id,
        previousAccountIds: this.state.accounts.map(a => a.id),
      });
    } else {
      ipcRenderer.send('command', 'application:add-account');
    }
  };

  _onConfirmGroupAndAdd = () => {
    this.setState({ showGroupPicker: false });
    ipcRenderer.send('command', 'application:add-account');
  };

  _onSkipGroupAndAdd = () => {
    this.setState({ showGroupPicker: false, selectedGroupId: '' });
    ipcRenderer.send('command', 'application:add-account');
  };

  _onCancelGroupPicker = () => {
    this.setState({ showGroupPicker: false, selectedGroupId: '' });
  };

  _onReorderAccount(account: Account, oldIdx: number, newIdx: number) {
    Actions.reorderAccount(account.id, newIdx);
  }

  _onSelectAccount = (account: Account) => {
    this.setState({ selected: account });
  };

  _onRemoveAccount(account: Account) {
    Actions.removeAccount(account.id);
  }

  _onAccountUpdated(account: Account, updates: Partial<Account>) {
    Actions.updateAccount(account.id, updates);
  }

  _renderGroupPicker() {
    if (!this.state.showGroupPicker) return null;

    return (
      <div className="group-picker-overlay">
        <div className="group-picker-modal">
          <h3>{localized('Add Account to Group')}</h3>
          <p>{localized('Select a group for the new account, or skip to add without a group.')}</p>
          <select
            className="group-picker-select"
            value={this.state.selectedGroupId}
            onChange={e => this.setState({ selectedGroupId: e.target.value })}
          >
            {this.state.groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="group-picker-actions">
            <button className="btn btn-emphasis" onClick={this._onConfirmGroupAndAdd}>
              {localized('Add to Group')}
            </button>
            <button className="btn" onClick={this._onSkipGroupAndAdd}>
              {localized('Skip (No Group)')}
            </button>
            <button className="btn" onClick={this._onCancelGroupPicker}>
              {localized('Cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="container-accounts">
        <div className="accounts-content">
          <PreferencesAccountList
            accounts={this.state.accounts}
            selected={this.state.selected}
            onAddAccount={this._onAddAccount}
            onReorderAccount={this._onReorderAccount}
            onSelectAccount={this._onSelectAccount}
            onRemoveAccount={this._onRemoveAccount}
          />
          <PreferencesAccountDetails
            account={this.state.selected}
            onAccountUpdated={this._onAccountUpdated}
          />
        </div>
        {this._renderGroupPicker()}
      </div>
    );
  }
}

export default PreferencesAccounts;
