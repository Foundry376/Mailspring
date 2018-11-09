import { Account, React, PropTypes, RegExpUtils } from 'mailspring-exports';

import OnboardingActions from './onboarding-actions';
import CreatePageForForm from './decorators/create-page-for-form';
import { expandAccountWithCommonSettings } from './onboarding-helpers';
import FormField from './form-field';

class AccountBasicSettingsForm extends React.Component {
  static displayName = 'AccountBasicSettingsForm';

  static propTypes = {
    account: PropTypes.object,
    errorFieldNames: PropTypes.array,
    submitting: PropTypes.bool,
    onConnect: PropTypes.func,
    onFieldChange: PropTypes.func,
    onFieldKeyPress: PropTypes.func,
  };

  static submitLabel = account => {
    return account.provider === 'imap' ? 'Continue' : 'Connect Account';
  };

  static titleLabel = providerConfig => {
    return (
      providerConfig.title ||
      `Add your ${providerConfig.displayNameShort || providerConfig.displayName} account`
    );
  };

  static subtitleLabel = providerConfig => {
    return (
      providerConfig.note ||
      `Enter your email account credentials to get started. Edison Mail\nstores your email password securely and it is never sent to our servers.`
    );
  };

  static validateAccount = account => {
    const errorFieldNames = [];
    let errorMessage = null;

    if (!account.emailAddress || !account.settings.imap_password || !account.name) {
      return { errorMessage, errorFieldNames, populated: false };
    }

    if (!RegExpUtils.emailRegex().test(account.emailAddress)) {
      errorFieldNames.push('email');
      errorMessage = 'Please provide a valid email address.';
    }
    if (!account.name) {
      errorFieldNames.push('name');
      errorMessage = 'Please provide your name.';
    }
    if (!account.settings.imap_password) {
      errorFieldNames.push('password');
      errorMessage = 'Please provide a password for your account.';
    }
    if (account.provider === 'exchange' && !account.settings.exchangeServer) {
      errorFieldNames.push('exchangeServer');
      errorMessage = 'Please provide your exchange server.';
    }

    return { errorMessage, errorFieldNames, populated: true };
  };

  async submit() {
    // create a new account with expanded settings and just the three fields
    const { name, emailAddress, provider, settings: { imap_password, exchangeServer } } = this.props.account;
    let account = new Account({ name, emailAddress, provider, settings: { imap_password, exchangeServer } });
    account = await expandAccountWithCommonSettings(account);
    OnboardingActions.setAccount(account);

    if ((account.settings.imap_host && account.settings.smtp_host) || provider === 'exchange') {
      // expanding the account settings succeeded - try to authenticate
      this.props.onConnect(account);
    } else {
      // we need the user to provide IMAP/SMTP credentials manually
      OnboardingActions.moveToPage('account-settings-imap');
    }
  }

  render() {
    const { provider } = this.props.account;
    return (
      <form className="settings">
        <FormField field="name" title="Name" {...this.props} />
        <FormField field="emailAddress" title="Email" {...this.props} />
        <FormField
          field="settings.imap_password"
          title="Password"
          type="password"
          {...this.props}
        />
        {provider === 'exchange' ? <FormField field="settings.exchangeServer" title="Exchange Server" {...this.props} /> : null}
      </form>
    );
  }
}

export default CreatePageForForm(AccountBasicSettingsForm);
