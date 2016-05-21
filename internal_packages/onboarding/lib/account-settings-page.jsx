import React from 'react';
import {RegExpUtils} from 'nylas-exports';

import OnboardingActions from './onboarding-actions';
import CreatePageForForm from './decorators/create-page-for-form';

class AccountBasicSettingsForm extends React.Component {
  static displayName = 'AccountBasicSettingsForm';

  static propTypes = {
    accountInfo: React.PropTypes.object,
    errorFieldNames: React.PropTypes.array,
    submitting: React.PropTypes.bool,
    onConnect: React.PropTypes.func,
    onFieldChange: React.PropTypes.func,
    onFieldKeyPress: React.PropTypes.func,
  };

  static submitLabel = (accountInfo) => {
    return (accountInfo.type === 'imap') ? 'Next' : 'Connect Account';
  }

  static titleLabel = (AccountType) => {
    return AccountType.title || `Add your ${AccountType.displayName} account`;
  }

  static subtitleLabel = () => {
    return 'Enter your email account credentials to get started.';
  }

  static validateAccountInfo = (accountInfo) => {
    const {email, password, name} = accountInfo;
    const errorFieldNames = [];
    let errorMessage = null;

    if (!email || !password || !name) {
      return {errorMessage, errorFieldNames, populated: false};
    }

    if (!RegExpUtils.emailRegex().test(accountInfo.email)) {
      errorFieldNames.push('email')
      errorMessage = "Please provide a valid email address."
    }
    if (!accountInfo.password) {
      errorFieldNames.push('password')
      errorMessage = "Please provide a password for your account."
    }
    if (!accountInfo.name) {
      errorFieldNames.push('name')
      errorMessage = "Please provide your name."
    }

    return {errorMessage, errorFieldNames, populated: true};
  }

  submit() {
    if (this.props.accountInfo.type === 'imap') {
      const accountInfo = Object.assign({}, this.props.accountInfo);
      accountInfo.smtp_username = accountInfo.smtp_username || accountInfo.email;
      accountInfo.smtp_password = accountInfo.smtp_password || accountInfo.password;
      accountInfo.imap_username = accountInfo.imap_username || accountInfo.email;
      accountInfo.imap_password = accountInfo.imap_password || accountInfo.password;
      accountInfo.imap_port = accountInfo.imap_port || 993;
      accountInfo.smtp_port = accountInfo.smtp_port || 587;
      if (accountInfo.email.endsWith('@fastmail.fm')) {
        accountInfo.imap_host = 'mail.messagingengine.com';
        accountInfo.smtp_host = 'mail.messagingengine.com';
      }
      OnboardingActions.setAccountInfo(accountInfo);
      OnboardingActions.moveToPage('account-settings-imap');
    } else {
      this.props.onConnect();
    }
  }

  render() {
    const {accountInfo, errorFieldNames, submitting, onFieldKeyPress, onFieldChange} = this.props;

    return (
      <form className="settings">
        <label forHtml="name">Name:</label>
        <input
          type="text"
          id="name"
          className={(accountInfo.name && errorFieldNames.includes('name')) ? 'error' : ''}
          disabled={submitting}
          value={accountInfo.name || ''}
          onKeyPress={onFieldKeyPress}
          onChange={onFieldChange}
        />
        <label forHtml="email">Email:</label>
        <input
          type="text"
          id="email"
          className={(accountInfo.email && errorFieldNames.includes('email')) ? 'error' : ''}
          disabled={submitting}
          value={accountInfo.email || ''}
          onKeyPress={onFieldKeyPress}
          onChange={onFieldChange}
        />
        <label forHtml="password">Password:</label>
        <input
          type="password"
          id="password"
          className={(accountInfo.password && errorFieldNames.includes('password')) ? 'error' : ''}
          disabled={submitting}
          value={accountInfo.password || ''}
          onKeyPress={onFieldKeyPress}
          onChange={onFieldChange}
        />
      </form>
    )
  }
}

export default CreatePageForForm(AccountBasicSettingsForm);
