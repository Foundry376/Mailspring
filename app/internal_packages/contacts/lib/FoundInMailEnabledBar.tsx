import React from 'react';
import { ListensToFluxStore } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import { Store, ContactSource } from './Store';

interface FoundInMailEnabledBarProps {
  selectedSource: ContactSource;
}

const CONFIG_KEY = 'core.contacts.findInMailDisabled';

class FoundInMailEnabledBarWithData extends React.Component<FoundInMailEnabledBarProps> {
  static displayName = 'FoundInMailEnabledBar';

  _onToggle = () => {
    const accountId = this.props.selectedSource.accountId;
    let disabled = AppEnv.config.get(CONFIG_KEY);
    if (disabled.includes(accountId)) {
      disabled = disabled.filter(i => i !== accountId);
    } else {
      disabled = [...disabled, accountId];
    }
    AppEnv.config.set(CONFIG_KEY, disabled);
    this.forceUpdate();
  };

  render() {
    const { selectedSource } = this.props;
    if (!selectedSource || selectedSource.type !== 'found-in-mail') {
      return false;
    }

    const disabled = AppEnv.config.get(CONFIG_KEY).includes(selectedSource.accountId);

    return (
      <div className="found-in-mail-enabled-bar">
        <div className="notice">
          {localized(
            `Contacts you've emailed appear here and Mailspring can suggest them when composing new messages.`
          )}
        </div>
        <div className="btn" onClick={this._onToggle}>
          {disabled ? localized(`Enable`) : localized(`Disable`)}
        </div>
      </div>
    );
  }
}

export const FoundInMailEnabledBar = ListensToFluxStore(FoundInMailEnabledBarWithData, {
  stores: [Store],
  getStateFromStores: props => ({
    selectedSource: Store.selectedSource(),
  }),
});
FoundInMailEnabledBar.displayName = 'FoundInMailEnabledBar';
