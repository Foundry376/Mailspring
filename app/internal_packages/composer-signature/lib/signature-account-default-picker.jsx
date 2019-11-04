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

    return (
      <div className="account-picker">
        <label>Use this signature as the default for:</label>

        {accountsAndAliases.map(account => {
          const isChecked = defaults[account.email] === signature.id;
          return (
            <div key={account.id}>
              <input
                type="checkbox"
                onChange={() => {
                  this._onToggleAccount(account);
                }}
                checked={isChecked}
              />
              <label>{account.email}</label>
            </div>
          );
        })}
      </div>
    );
  }
}
