import { React, PropTypes, Actions } from 'mailspring-exports';
import { MultiselectDropdown } from 'mailspring-component-kit';

export default class SignatureAccountDefaultPicker extends React.Component {
  static propTypes = {
    defaults: PropTypes.object,
    signature: PropTypes.object,
    accountsAndAliases: PropTypes.array,
  };

  _onToggleAccount = account => {
    Actions.toggleAccount(account.email);
  };

  render() {
    const { accountsAndAliases, defaults, signature } = this.props;

    const isChecked = accountOrAlias => defaults[accountOrAlias.email] === signature.id;
    const checked = accountsAndAliases.filter(isChecked);

    return (
      <div className="account-picker">
        Default for:{' '}
        <MultiselectDropdown
          className="account-dropdown"
          items={accountsAndAliases}
          itemChecked={isChecked}
          itemContent={accountOrAlias => accountOrAlias.email}
          itemKey={a => a.id}
          current={signature}
          attachment={'right'}
          buttonText={`${checked.length} Account${checked.length === 1 ? '' : 's'}`}
          onToggleItem={this._onToggleAccount}
        />
      </div>
    );
  }
}
