import React from 'react';
import {
  localized,
  PropTypes,
  Actions,
  IAliasSet,
  ISignature,
  IDefaultSignatures,
} from 'mailspring-exports';
import { MultiselectDropdown } from 'mailspring-component-kit';

interface SignatureAccountDefaultPickerProps {
  defaults: IDefaultSignatures;
  signature: ISignature;
  accountsAndAliases: IAliasSet;
}

export default class SignatureAccountDefaultPicker extends React.Component<
  SignatureAccountDefaultPickerProps
> {
  _onToggleAccount = account => {
    Actions.toggleAccount(account.email);
  };

  render() {
    const { accountsAndAliases, defaults, signature } = this.props;

    const isChecked = accountOrAlias => defaults[accountOrAlias.email] === signature.id;
    const checked = accountsAndAliases.filter(isChecked);

    const noun = checked.length === 1 ? localized('Account') : localized('Accounts');

    return (
      <div className="account-picker">
        {localized('Default for:')}{' '}
        <MultiselectDropdown
          className="account-dropdown"
          items={accountsAndAliases}
          itemChecked={isChecked}
          itemContent={accountOrAlias => accountOrAlias.email}
          itemKey={a => a.id}
          attachment={'right'}
          buttonText={`${checked.length} ${noun}`}
          onToggleItem={this._onToggleAccount}
        />
      </div>
    );
  }
}
