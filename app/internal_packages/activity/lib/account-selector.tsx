import React from 'react';
import { Account, localized } from 'mailspring-exports';
import { DropdownMenu } from 'mailspring-component-kit';

interface AccountOption {
  /** Null for all accounts. */
  id: string | null;
  name: string;
}

export default class AccountSelector extends React.Component<{
  accounts: Account[];
  accountId: string | null;
  onChange: (accountId: string | null) => void;
}> {
  render() {
    const { accounts, accountId } = this.props;
    const options: AccountOption[] = [
      { id: null, name: localized('All Accounts') },
      ...accounts.map((account) => ({ id: account.id, name: account.label })),
    ];
    const itemIdx = Math.max(
      0,
      options.findIndex((item) => item.id === accountId)
    );

    return (
      <div className="account-selector hidden-on-web">
        <DropdownMenu
          attachment={DropdownMenu.Attachment.RightEdge}
          intitialSelectionItem={options[itemIdx]}
          defaultSelectedIndex={itemIdx}
          headerComponents={[]}
          footerComponents={[]}
          items={options}
          itemKey={(item: AccountOption) => item.id || 'all'}
          itemContent={(item: AccountOption) => item.name}
          onSelect={(item: AccountOption) => this.props.onChange(item.id)}
        />
      </div>
    );
  }
}
