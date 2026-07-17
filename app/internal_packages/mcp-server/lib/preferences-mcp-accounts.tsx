import React from 'react';
import { localized, AccountStore, CategoryStore } from 'mailspring-exports';
import { DisclosureTriangle } from 'mailspring-component-kit';

interface AccountConfig {
  enabled: boolean;
  excludedFolderIds?: string[];
}

interface Props {
  enabledAccounts: { [accountId: string]: AccountConfig };
  onChange: (enabledAccounts: { [accountId: string]: AccountConfig }) => void;
}

interface State {
  expandedAccounts: { [accountId: string]: boolean };
}

export default class PreferencesMcpAccounts extends React.Component<Props, State> {
  state: State = { expandedAccounts: {} };

  _isAccountEnabled(accountId: string): boolean {
    const { enabledAccounts } = this.props;
    if (Object.keys(enabledAccounts).length === 0) return true;
    return enabledAccounts[accountId]?.enabled ?? false;
  }

  _getExcludedFolders(accountId: string): string[] {
    return this.props.enabledAccounts[accountId]?.excludedFolderIds || [];
  }

  _toggleAccount = (accountId: string) => {
    const current = { ...this.props.enabledAccounts };
    const wasEnabled = this._isAccountEnabled(accountId);

    // If this is the first toggle and no accounts are configured, initialize all as enabled
    if (Object.keys(current).length === 0) {
      for (const a of AccountStore.accounts()) {
        current[a.id] = { enabled: true };
      }
    }

    current[accountId] = { ...current[accountId], enabled: !wasEnabled };
    this.props.onChange(current);
  };

  _toggleFolder = (accountId: string, folderId: string) => {
    const current = { ...this.props.enabledAccounts };

    // Initialize if needed
    if (Object.keys(current).length === 0) {
      for (const a of AccountStore.accounts()) {
        current[a.id] = { enabled: true };
      }
    }

    const accountConfig = { ...current[accountId] };
    const excluded = [...(accountConfig.excludedFolderIds || [])];
    const idx = excluded.indexOf(folderId);
    if (idx >= 0) {
      excluded.splice(idx, 1);
    } else {
      excluded.push(folderId);
    }
    accountConfig.excludedFolderIds = excluded;
    current[accountId] = accountConfig;
    this.props.onChange(current);
  };

  _toggleExpanded = (accountId: string) => {
    this.setState((prev) => ({
      expandedAccounts: {
        ...prev.expandedAccounts,
        [accountId]: !prev.expandedAccounts[accountId],
      },
    }));
  };

  render() {
    const accounts = AccountStore.accounts();
    return (
      <div className="mcp-accounts-list">
        {accounts.map((account) => this._renderAccount(account))}
      </div>
    );
  }

  _renderAccount(account: { id: string; label: string; emailAddress: string }) {
    const enabled = this._isAccountEnabled(account.id);
    const excluded = this._getExcludedFolders(account.id);
    const expanded = this.state.expandedAccounts[account.id];
    const categories = CategoryStore.categories(account.id);
    const hasExclusions = excluded.length > 0;

    return (
      <div key={account.id} className="mcp-account-item">
        <div className="mcp-account-header" onClick={() => this._toggleExpanded(account.id)}>
          <input
            type="checkbox"
            checked={enabled}
            ref={(el) => {
              if (el) el.indeterminate = enabled && hasExclusions;
            }}
            onChange={(e) => {
              e.stopPropagation();
              this._toggleAccount(account.id);
            }}
          />
          <DisclosureTriangle
            visible
            collapsed={!expanded}
            onCollapseToggled={() => this._toggleExpanded(account.id)}
          />
          <span className="mcp-account-name">{account.label || account.emailAddress}</span>
          {account.label && account.label !== account.emailAddress && (
            <span className="mcp-account-email">{account.emailAddress}</span>
          )}
        </div>
        {expanded && enabled && (
          <div className="mcp-folder-list">
            {categories.map((cat) => {
              const isExcluded = excluded.includes(cat.id);
              return (
                <label key={cat.id} className="mcp-folder-item">
                  <input
                    type="checkbox"
                    checked={!isExcluded}
                    onChange={() => this._toggleFolder(account.id, cat.id)}
                  />
                  {(cat as any).displayName || cat.name}
                </label>
              );
            })}
            {categories.length === 0 && (
              <div className="mcp-folder-empty">{localized('No folders found')}</div>
            )}
          </div>
        )}
      </div>
    );
  }
}
