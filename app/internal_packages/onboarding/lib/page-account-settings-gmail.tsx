import React from 'react';

import { Account } from 'mailspring-exports';
import { buildGmailAccountFromAuthResponse, buildGmailAuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import * as OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageGmail extends React.Component<{ account: Account }> {
  static displayName = 'AccountSettingsPageGmail';

  _gmailAuthUrl = buildGmailAuthURL();

  onSuccess(account) {
    OnboardingActions.finishAndAddAccount(account);
  }

  render() {
    const providerConfig = AccountProviders.find((a) => a.provider === this.props.account.provider);
    const goBack = () => OnboardingActions.moveToPreviousPage();

    return (
      <OAuthSignInPage
        serviceName="Google"
        providerAuthPageUrl={this._gmailAuthUrl}
        providerConfig={providerConfig}
        buildAccountFromAuthResponse={buildGmailAccountFromAuthResponse}
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
