import React, { Component, CSSProperties } from 'react';
import { localized, Account } from 'mailspring-exports';
import { RetinaImg, Flexbox, EditableList } from 'mailspring-component-kit';
import classnames from 'classnames';
import PropTypes from 'prop-types';

interface PreferencesAccountListProps {
  accounts: Account[];
  selected: Account;
  onAddAccount: () => void;
  onReorderAccount: (account: Account, oldIndex: number, newIndex: number) => void;
  onSelectAccount: (account: Account) => void;
  onRemoveAccount: (account: Account) => void;
}

class PreferencesAccountList extends Component<PreferencesAccountListProps> {
  static propTypes = {
    accounts: PropTypes.array,
    selected: PropTypes.object,
    onAddAccount: PropTypes.func.isRequired,
    onReorderAccount: PropTypes.func.isRequired,
    onSelectAccount: PropTypes.func.isRequired,
    onRemoveAccount: PropTypes.func.isRequired,
  };

  _renderAccountStateIcon(account: Account) {
    if (account.syncState !== 'running') {
      return (
        <div className="sync-error-icon">
          <RetinaImg
            className="sync-error-icon"
            name="ic-settings-account-error.png"
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </div>
      );
    }
    return null;
  }

  _renderAccount = (account: Account) => {
    const label = account.label;
    const accountSub = `${account.name || localized('No name provided')} <${account.emailAddress}>`;
    const syncError = account.hasSyncStateError();
    let style: CSSProperties = {}
    if (account.color) {
      style = { borderLeftColor: account.color, borderLeftWidth: '8px', borderLeftStyle: 'solid' }
    } else {
      style = { marginLeft: '8px' }
    }

    return (
      <div style={style} className={classnames({ account: true, 'sync-error': syncError })} key={account.id}>
        <Flexbox direction="row" style={{ alignItems: 'middle' }}>
          <div style={{ textAlign: 'center' }}>
            <RetinaImg
              style={{ width: 50, height: 50 }}
              name={
                syncError
                  ? 'ic-settings-account-error.png'
                  : `ic-settings-account-${account.provider}.png`
              }
              fallback="ic-settings-account-imap.png"
              mode={RetinaImg.Mode.ContentPreserve}
            />
          </div>
          <div style={{ flex: 1, marginLeft: 10, marginRight: 10 }}>
            <div className="account-name" dir="auto">
              {label}
            </div>
            <div className="account-subtext" dir="auto">
              {accountSub} ({account.displayProvider()})
            </div>
          </div>
        </Flexbox>
      </div>
    );
  };

  render() {
    if (!this.props.accounts) {
      return <div className="account-list" />;
    }
    return (
      <EditableList
        className="account-list"
        items={this.props.accounts}
        itemContent={this._renderAccount}
        selected={this.props.selected}
        onReorderItem={this.props.onReorderAccount}
        onCreateItem={this.props.onAddAccount}
        onSelectItem={this.props.onSelectAccount}
        onDeleteItem={this.props.onRemoveAccount}
      />
    );
  }
}

export default PreferencesAccountList;
