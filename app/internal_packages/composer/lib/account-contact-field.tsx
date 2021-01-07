import React, { CSSProperties } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import {
  localized,
  AccountStore,
  ContactStore,
  Account,
  Contact,
  DraftEditingSession,
  Message,
} from 'mailspring-exports';
import { Menu, ButtonDropdown, InjectedComponentSet } from 'mailspring-component-kit';

interface AccountContactFieldProps {
  accounts: Account[];
  value: Contact;
  session: DraftEditingSession;
  draft: Message;
  onChange: (val: { from: Contact[]; cc: Contact[]; bcc: Contact[] }) => void;
}

export default class AccountContactField extends React.Component<AccountContactFieldProps> {
  static displayName = 'AccountContactField';

  static propTypes = {
    value: PropTypes.object,
    accounts: PropTypes.array,
    session: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
  };

  _dropdownComponent: ButtonDropdown;

  _onChooseContact = async contact => {
    const { draft, session, onChange } = this.props;
    const { autoaddress } = AccountStore.accountForEmail(contact.email);

    const existing = [...draft.to, ...draft.cc, ...draft.bcc].map(c => c.email);
    let autocontacts = await ContactStore.parseContactsInString(autoaddress.value);
    autocontacts = autocontacts.filter(c => !existing.includes(c.email));

    this._dropdownComponent.toggleDropdown();

    onChange({
      from: [contact],
      cc: [...draft.cc].concat(autoaddress.type === 'cc' ? autocontacts : []),
      bcc: [...draft.bcc].concat(autoaddress.type === 'bcc' ? autocontacts : []),
    });
    session.ensureCorrectAccount();
  };

  _renderAccountSelector() {
    if (!this.props.value) {
      return <span />;
    }

    const label = this.props.value.toString();
    const multipleAccounts = this.props.accounts.length > 1;
    const hasAliases = this.props.accounts[0] && this.props.accounts[0].aliases.length > 0;
    const account = AccountStore.accountForEmail(this.props.value.email);
    let style: CSSProperties = {
    }
    if (account && account.color) {
      style = {
        ...style,
        borderLeftColor: account.color,
        paddingLeft: '8px',
        borderLeftWidth: '8px',
        borderLeftStyle: 'solid',
      }
    }

    if (multipleAccounts || hasAliases) {
      return (
        <ButtonDropdown
          ref={cm => {
            this._dropdownComponent = cm;
          }}
          bordered={false}
          primaryItem={<span style={style}>{label}</span>}
          menu={this._renderAccounts(this.props.accounts)}
        />
      );
    }
    return this._renderAccountSpan(label, style);
  }

  _renderAccountSpan = (label, style) => {
    style = {
      ...style,
      position: 'relative',
      top: 13,
      left: '0.5em',
    }

    return (
      <span className="from-single-name" style={style}>
        {label}
      </span>
    );
  };

  _renderMenuItem = contact => {
    const account = AccountStore.accountForId(contact.accountId)
    let style: CSSProperties = {}
    if (account && account.color) {
      style = {
        ...style,
        borderLeftColor: account.color,
        paddingLeft: '8px',
        borderLeftWidth: '8px',
        borderLeftStyle: 'solid',
      }
    }
    const className = classnames({
      contact: true,
      'is-alias': contact.isAlias,
    });
    return <div className={className} style={style}>
      {contact.toString()}
    </div>;
  };

  _renderAccounts(accounts) {
    const items = AccountStore.aliasesFor(accounts);
    return (
      <Menu
        items={items}
        itemKey={contact => contact.id}
        itemContent={this._renderMenuItem}
        onSelect={this._onChooseContact}
      />
    );
  }

  _renderFromFieldComponents = () => {
    const { draft, session, accounts } = this.props;
    return (
      <InjectedComponentSet
        deferred
        className="dropdown-component"
        matching={{ role: 'Composer:FromFieldComponents' }}
        exposedProps={{
          draft,
          session,
          accounts,
          draftFromEmail: draft.from[0] ? draft.from[0].email : undefined,
        }}
      />
    );
  };

  render() {
    return (
      <div className="composer-participant-field from-field">
        <div className="composer-field-label">{localized('From')}:</div>
        {this._renderAccountSelector()}
        {this._renderFromFieldComponents()}
      </div>
    );
  }
}
