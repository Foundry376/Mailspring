import React from 'react';
import { localized, Account } from 'mailspring-exports';
import CreatePageForForm from './decorators/create-page-for-form';
import FormField from './form-field';

const StandardIMAPPorts = [143, 993];
const StandardSMTPPorts = [25, 465, 587];

interface AccountIMAPSettingsFormProps {
  account: Account;
  errorFieldNames: string[];
  submitting: boolean;
  onConnect: () => void;
  onFieldChange: (
    e: { target: { value: string; id: string } },
    opts?: { afterSetState: () => void }
  ) => void;
  onFieldKeyPress: () => void;
}

class AccountIMAPSettingsForm extends React.Component<AccountIMAPSettingsFormProps> {
  static displayName = 'AccountIMAPSettingsForm';

  static submitLabel = () => {
    return localized('Connect Account');
  };

  static titleLabel = () => {
    return localized('Set up Account');
  };

  static subtitleLabel = () => {
    return localized('Complete the IMAP and SMTP settings below to connect your account.');
  };

  static validateAccount = account => {
    let errorMessage = null;
    const errorFieldNames = [];

    if (!account.settings[`imap_username`] || !account.settings[`imap_password`]) {
      return { errorMessage, errorFieldNames, populated: false };
    }

    // Note: we explicitly don't check that an SMTP username / password
    // is provided because occasionally those gateways don't require them!

    for (const type of ['imap', 'smtp']) {
      if (!account.settings[`${type}_host`]) {
        return { errorMessage, errorFieldNames, populated: false };
      }
      if (!Number.isInteger(account.settings[`${type}_port`] / 1)) {
        errorMessage = localized('Please provide a valid port number.');
        errorFieldNames.push(`${type}_port`);
      }
    }

    return { errorMessage, errorFieldNames, populated: true };
  };

  renderPortDropdown(protocol) {
    if (!['imap', 'smtp'].includes(protocol)) {
      throw new Error(`Can't render port dropdown for protocol '${protocol}'`);
    }
    const { account: { settings }, submitting, onFieldKeyPress, onFieldChange } = this.props;

    const field = `${protocol}_port`;
    const values = protocol === 'imap' ? StandardIMAPPorts : StandardSMTPPorts;
    const isStandard = values.includes(settings[field] / 1);
    const customValue = isStandard ? '0' : settings[field];

    // When you change the port, automatically switch the security setting to
    // the standard for that port. Lots of people don't update that field and
    // are getting confused.
    const onPortChange = event => {
      const port = event.target.value / 1;

      onFieldChange(event, {
        afterSetState: () => {
          if (port === 143 && settings.imap_security !== 'none') {
            onFieldChange({ target: { value: 'none', id: 'settings.imap_security' } });
          }
          if (port === 993 && settings.imap_security !== 'SSL / TLS') {
            onFieldChange({ target: { value: 'SSL / TLS', id: 'settings.imap_security' } });
          }
          if (port === 25 && settings.smtp_security !== 'none') {
            onFieldChange({ target: { value: 'none', id: 'settings.smtp_security' } });
          }
          if (port === 587 && settings.smtp_security !== 'STARTTLS') {
            onFieldChange({ target: { value: 'STARTTLS', id: 'settings.smtp_security' } });
          }
        },
      });
    };

    return (
      <span>
        <label htmlFor={`settings.${field}`}>{localized('Port')}:</label>
        <select
          id={`settings.${field}`}
          tabIndex={0}
          value={settings[field]}
          disabled={submitting}
          onChange={onPortChange}
        >
          {values.map(v => (
            <option value={v} key={v}>
              {v}
            </option>
          ))}
          <option value={customValue} key="custom">
            {localized('Custom')}
          </option>
        </select>
        {!isStandard && (
          <input
            style={{
              width: 80,
              marginLeft: 6,
              height: 23,
            }}
            id={`settings.${field}`}
            tabIndex={0}
            value={settings[field]}
            disabled={submitting}
            onKeyPress={onFieldKeyPress}
            onChange={onFieldChange}
          />
        )}
      </span>
    );
  }

  renderSecurityDropdown(protocol) {
    const { account: { settings }, submitting, onFieldKeyPress, onFieldChange } = this.props;

    return (
      <div>
        <span>
          <label htmlFor={`settings.${protocol}_security`}>{localized('Security')}:</label>
          <select
            id={`settings.${protocol}_security`}
            tabIndex={0}
            value={settings[`${protocol}_security`]}
            disabled={submitting}
            onKeyPress={onFieldKeyPress}
            onChange={onFieldChange}
          >
            <option value="SSL / TLS" key="SSL / TLS">
              SSL / TLS
            </option>
            <option value="STARTTLS" key="STARTTLS">
              STARTTLS
            </option>
            <option value="none" key="none">
              {localized('None')}
            </option>
          </select>
        </span>
        <span style={{ paddingLeft: '20px', paddingTop: '10px' }}>
          <input
            type="checkbox"
            id={`settings.${protocol}_allow_insecure_ssl`}
            disabled={submitting}
            checked={settings[`${protocol}_allow_insecure_ssl`] || false}
            onKeyPress={onFieldKeyPress}
            onChange={onFieldChange}
          />
          <label htmlFor={`${protocol}_allow_insecure_ssl"`} className="checkbox">
            {localized('Allow insecure SSL')}
          </label>
        </span>
      </div>
    );
  }

  renderFieldsForType(type) {
    return (
      <div>
        <FormField field={`settings.${type}_host`} title={'Server'} {...this.props} />
        <div style={{ textAlign: 'left' }}>
          {this.renderPortDropdown(type)}
          {this.renderSecurityDropdown(type)}
        </div>
        <FormField field={`settings.${type}_username`} title={'Username'} {...this.props} />
        <FormField
          field={`settings.${type}_password`}
          title={localized('Password')}
          type="password"
          {...this.props}
        />
      </div>
    );
  }

  render() {
    return (
      <div className="twocol">
        <div className="col">
          <div className="col-heading">{localized('Incoming Mail')} (IMAP):</div>
          {this.renderFieldsForType('imap')}
        </div>
        <div className="col">
          <div className="col-heading">{localized('Outgoing Mail')} (SMTP):</div>
          {this.renderFieldsForType('smtp')}
        </div>
      </div>
    );
  }
}

export default CreatePageForForm(AccountIMAPSettingsForm);
