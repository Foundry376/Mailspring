import React, { Component } from 'react';
import {
  localized,
  Actions,
  Account,
  AccountStore,
  AccountGroupStore,
  AccountGroup,
  AccountGroupDisplayStyle,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

interface PreferencesAccountGroupsState {
  groups: AccountGroup[];
  accounts: Account[];
  selectedGroupId: string | null;
  editingGroupId: string | null;
  editingName: string;
  showCreateDialog: boolean;
  newGroupName: string;
  searchQuery: string;
}

class PreferencesAccountGroups extends Component<
  Record<string, unknown>,
  PreferencesAccountGroupsState
> {
  static displayName = 'PreferencesAccountGroups';

  _unsubscribers: Array<() => void> = [];

  constructor(props) {
    super(props);
    const groups = AccountGroupStore.groups();
    this.state = {
      groups,
      accounts: AccountStore.accounts(),
      selectedGroupId: groups.length > 0 ? groups[0].id : null,
      editingGroupId: null,
      editingName: '',
      showCreateDialog: false,
      newGroupName: '',
      searchQuery: '',
    };
  }

  componentDidMount() {
    this._unsubscribers.push(AccountGroupStore.listen(this._onStoreChanged));
    this._unsubscribers.push(AccountStore.listen(this._onStoreChanged));
  }

  componentWillUnmount() {
    this._unsubscribers.forEach(unsub => unsub());
  }

  _onStoreChanged = () => {
    const groups = AccountGroupStore.groups();
    this.setState(prev => {
      let selectedGroupId = prev.selectedGroupId;
      if (!selectedGroupId || !groups.find(g => g.id === selectedGroupId)) {
        selectedGroupId = groups.length > 0 ? groups[0].id : null;
      }
      return {
        groups,
        accounts: AccountStore.accounts(),
        selectedGroupId,
      };
    });
  };

  _selectedGroup(): AccountGroup | null {
    if (!this.state.selectedGroupId) return null;
    return this.state.groups.find(g => g.id === this.state.selectedGroupId) || null;
  }

  // Group CRUD

  _onOpenCreateDialog = () => {
    this.setState({ showCreateDialog: true, newGroupName: '' });
  };

  _onConfirmCreate = () => {
    const name = this.state.newGroupName.trim();
    if (!name) return;
    Actions.createAccountGroup({ name, accountIds: [] });
    this.setState({ showCreateDialog: false, newGroupName: '' });
    setTimeout(() => {
      const groups = AccountGroupStore.groups();
      const newGroup = groups[groups.length - 1];
      if (newGroup) {
        this.setState({ selectedGroupId: newGroup.id });
      }
    }, 50);
  };

  _onCancelCreate = () => {
    this.setState({ showCreateDialog: false, newGroupName: '' });
  };

  _onDeleteGroup = (groupId: string) => {
    const group = this.state.groups.find(g => g.id === groupId);
    if (!group) return;
    const remote = require('@electron/remote');
    const response = remote.dialog.showMessageBoxSync({
      type: 'warning',
      message: localized('Delete Group'),
      detail: localized('Are you sure you want to delete the group "%@"?', group.name),
      buttons: [localized('Delete'), localized('Cancel')],
      defaultId: 1,
    });
    if (response !== 0) return;
    Actions.deleteAccountGroup({ id: groupId });
  };

  _onStartEditName = (group: AccountGroup) => {
    this.setState({ editingGroupId: group.id, editingName: group.name });
  };

  _onConfirmEditName = () => {
    const name = this.state.editingName.trim();
    if (name && this.state.editingGroupId) {
      Actions.updateAccountGroup({ id: this.state.editingGroupId, name });
    }
    this.setState({ editingGroupId: null, editingName: '' });
  };

  _onCancelEditName = () => {
    this.setState({ editingGroupId: null, editingName: '' });
  };

  // Account assignment

  _onToggleAccount = (accountId: string, checked: boolean) => {
    const group = this._selectedGroup();
    if (!group) return;
    const accountIds = checked
      ? [...group.accountIds, accountId]
      : group.accountIds.filter(id => id !== accountId);
    Actions.updateAccountGroup({ id: group.id, accountIds });
  };

  _onSelectAll = () => {
    const group = this._selectedGroup();
    if (!group) return;
    const accountIds = this._filteredAccounts().map(a => a.id);
    const merged = new Set([...group.accountIds, ...accountIds]);
    Actions.updateAccountGroup({ id: group.id, accountIds: Array.from(merged) });
  };

  _onDeselectAll = () => {
    const group = this._selectedGroup();
    if (!group) return;
    const filteredIds = new Set(this._filteredAccounts().map(a => a.id));
    const remaining = group.accountIds.filter(id => !filteredIds.has(id));
    Actions.updateAccountGroup({ id: group.id, accountIds: remaining });
  };

  // Customization

  _onSetColor = (color: string) => {
    const group = this._selectedGroup();
    if (!group) return;
    Actions.updateAccountGroup({ id: group.id, color });
  };

  _onResetColor = () => {
    const group = this._selectedGroup();
    if (!group) return;
    Actions.updateAccountGroup({ id: group.id, color: '' });
  };

  _onSetDisplayStyle = (displayStyle: AccountGroupDisplayStyle) => {
    const group = this._selectedGroup();
    if (!group) return;
    Actions.updateAccountGroup({ id: group.id, displayStyle });
  };

  _getGroupNameStyle(group: AccountGroup): React.CSSProperties {
    const style: React.CSSProperties = {};
    if (group.color) {
      style.color = group.color;
    }
    const ds = group.displayStyle || 'normal';
    if (ds === 'bold' || ds === 'bold-italic') {
      style.fontWeight = 700;
    }
    if (ds === 'italic' || ds === 'bold-italic') {
      style.fontStyle = 'italic';
    }
    return style;
  }

  // Filtering

  _filteredAccounts() {
    const query = this.state.searchQuery.toLowerCase().trim();
    if (!query) return this.state.accounts;
    return this.state.accounts.filter(
      acc =>
        (acc.label || '').toLowerCase().includes(query) ||
        acc.emailAddress.toLowerCase().includes(query) ||
        (acc.name || '').toLowerCase().includes(query)
    );
  }

  // Create dialog

  _renderCreateDialog() {
    if (!this.state.showCreateDialog) return null;
    const canSave = this.state.newGroupName.trim().length > 0;

    return (
      <div className="create-group-overlay" onClick={this._onCancelCreate}>
        <div className="create-group-dialog" onClick={e => e.stopPropagation()}>
          <h3>{localized('Create New Group')}</h3>
          <p>{localized('Enter a name for the new account group.')}</p>
          <input
            type="text"
            className="create-group-input"
            placeholder={localized('Group name')}
            value={this.state.newGroupName}
            onChange={e => this.setState({ newGroupName: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter' && canSave) this._onConfirmCreate();
              if (e.key === 'Escape') this._onCancelCreate();
            }}
            autoFocus
          />
          <div className="create-group-actions">
            <button className="btn btn-small" onClick={this._onCancelCreate}>
              {localized('Cancel')}
            </button>
            <button
              className="btn btn-emphasis"
              disabled={!canSave}
              onClick={this._onConfirmCreate}
            >
              {localized('Save')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Left panel renderers

  _renderGroupListItem(group: AccountGroup) {
    const isSelected = this.state.selectedGroupId === group.id;
    const isEditing = this.state.editingGroupId === group.id;
    const accountCount = group.accountIds.length;
    const borderStyle: React.CSSProperties = group.color
      ? { borderLeftColor: group.color, borderLeftWidth: 3, borderLeftStyle: 'solid' }
      : {};

    return (
      <div
        key={group.id}
        className={`group-list-item ${isSelected ? 'selected' : ''}`}
        style={borderStyle}
        onClick={() => this.setState({ selectedGroupId: group.id })}
      >
        {isEditing ? (
          <input
            type="text"
            className="group-name-input"
            value={this.state.editingName}
            onChange={e => this.setState({ editingName: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') this._onConfirmEditName();
              if (e.key === 'Escape') this._onCancelEditName();
            }}
            onBlur={this._onConfirmEditName}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <div className="group-list-item-content">
            <span className="group-name" style={this._getGroupNameStyle(group)}>
              {group.name}
            </span>
            <span className="group-account-count">
              {accountCount} {accountCount === 1 ? localized('account') : localized('accounts')}
            </span>
          </div>
        )}
      </div>
    );
  }

  _renderLeftPanel() {
    const { groups } = this.state;

    return (
      <div className="groups-left-panel">
        <div className="groups-left-header">
          <h3>{localized('Groups')}</h3>
          <button
            className="btn btn-small btn-add-group"
            onClick={this._onOpenCreateDialog}
          >
            + {localized('Add')}
          </button>
        </div>

        <div className="groups-list">
          {groups.map(group => this._renderGroupListItem(group))}
        </div>

        {groups.length === 0 && (
          <div className="groups-empty-hint">
            <p>{localized('No groups yet.')}</p>
            <p>{localized('Click "+ Add" to create one.')}</p>
          </div>
        )}
      </div>
    );
  }

  // Right panel renderers

  _renderGroupCustomization(group: AccountGroup) {
    const displayStyle = group.displayStyle || 'normal';

    return (
      <div className="group-customization">
        <div className="customization-row">
          <label className="customization-label">{localized('Color')}</label>
          <div className="customization-control color-control">
            <input
              type="color"
              value={group.color || '#000000'}
              onChange={e => this._onSetColor(e.target.value)}
            />
            <span className="color-preview" style={this._getGroupNameStyle(group)}>
              {group.name}
            </span>
            {group.color && (
              <button
                className="btn btn-small btn-reset"
                onClick={this._onResetColor}
              >
                {localized('Reset')}
              </button>
            )}
          </div>
        </div>
        <div className="customization-row">
          <label className="customization-label">{localized('Style')}</label>
          <div className="customization-control style-control">
            <button
              className={`btn btn-small btn-style ${displayStyle === 'normal' ? 'active' : ''}`}
              onClick={() => this._onSetDisplayStyle('normal')}
            >
              Aa
            </button>
            <button
              className={`btn btn-small btn-style ${displayStyle === 'bold' ? 'active' : ''}`}
              style={{ fontWeight: 700 }}
              onClick={() => this._onSetDisplayStyle('bold')}
            >
              <b>Aa</b>
            </button>
            <button
              className={`btn btn-small btn-style ${displayStyle === 'italic' ? 'active' : ''}`}
              style={{ fontStyle: 'italic' }}
              onClick={() => this._onSetDisplayStyle('italic')}
            >
              <i>Aa</i>
            </button>
            <button
              className={`btn btn-small btn-style ${displayStyle === 'bold-italic' ? 'active' : ''}`}
              style={{ fontWeight: 700, fontStyle: 'italic' }}
              onClick={() => this._onSetDisplayStyle('bold-italic')}
            >
              <b><i>Aa</i></b>
            </button>
          </div>
        </div>
      </div>
    );
  }

  _renderRightPanel() {
    const group = this._selectedGroup();
    if (!group) {
      return (
        <div className="groups-right-panel">
          <div className="right-panel-empty">
            <h3>{localized('No Group Selected')}</h3>
            <p>
              {localized(
                'Create a group using the "+ Add" button, then select it to assign accounts.'
              )}
            </p>
          </div>
        </div>
      );
    }

    const filteredAccounts = this._filteredAccounts();
    const allSelected =
      filteredAccounts.length > 0 && filteredAccounts.every(a => group.accountIds.includes(a.id));
    const someSelected =
      !allSelected && filteredAccounts.some(a => group.accountIds.includes(a.id));

    return (
      <div className="groups-right-panel">
        <div className="right-panel-header">
          <div className="right-panel-title-row">
            <h3 style={this._getGroupNameStyle(group)}>{group.name}</h3>
            <div className="right-panel-actions">
              <button
                className="btn btn-small"
                onClick={() => this._onStartEditName(group)}
              >
                {localized('Rename')}
              </button>
              <button
                className="btn btn-small btn-danger"
                onClick={() => this._onDeleteGroup(group.id)}
              >
                {localized('Delete')}
              </button>
            </div>
          </div>
          {this._renderGroupCustomization(group)}
        </div>

        <div className="right-panel-accounts">
          <div className="accounts-toolbar">
            <div className="search-container">
              <RetinaImg
                name="searchloupe.png"
                mode={RetinaImg.Mode.ContentIsMask}
                className="search-icon"
              />
              <input
                type="text"
                className="search-input"
                placeholder={localized('Search accounts...')}
                value={this.state.searchQuery}
                onChange={e => this.setState({ searchQuery: e.target.value })}
              />
              {this.state.searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => this.setState({ searchQuery: '' })}
                >
                  x
                </button>
              )}
            </div>
            <label className="select-all-toggle">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={() => {
                  if (allSelected) {
                    this._onDeselectAll();
                  } else {
                    this._onSelectAll();
                  }
                }}
              />
              <span>{allSelected ? localized('Deselect All') : localized('Select All')}</span>
            </label>
          </div>

          <div className="accounts-list">
            {filteredAccounts.map(account => {
              const checked = group.accountIds.includes(account.id);
              return (
                <label key={account.id} className={`account-row ${checked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => this._onToggleAccount(account.id, e.target.checked)}
                  />
                  <RetinaImg
                    style={{ width: 24, height: 24 }}
                    name={`ic-settings-account-${account.provider}.png`}
                    fallback="ic-settings-account-imap.png"
                    mode={RetinaImg.Mode.ContentPreserve}
                  />
                  <div className="account-info">
                    <span className="account-label">
                      {account.label || account.emailAddress}
                    </span>
                    {account.label && account.label !== account.emailAddress && (
                      <span className="account-email">{account.emailAddress}</span>
                    )}
                  </div>
                </label>
              );
            })}
            {filteredAccounts.length === 0 && (
              <div className="no-results">
                {localized('No accounts match your search.')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="container-account-groups">
        <div className="groups-split-layout">
          {this._renderLeftPanel()}
          {this._renderRightPanel()}
        </div>
        {this._renderCreateDialog()}
      </div>
    );
  }
}

export default PreferencesAccountGroups;
