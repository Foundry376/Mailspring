import React from 'react';

import { Account } from 'mailspring-exports';
import { buildO365AccountFromAuthResponse, buildO365AuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import * as OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageO365 extends React.Component<{ account: Account }> {
  static displayName = 'AccountSettingsPageO365';

  _authUrl = buildO365AuthURL();

  onSuccess(account) {
    OnboardingActions.finishAndAddAccount(account);
  }

  render() {
    const providerConfig = AccountProviders.find(a => a.provider === this.props.account.provider);
    const goBack = () => OnboardingActions.moveToPreviousPage();

    return (
      <OAuthSignInPage
        serviceName="Office 365"
        providerAuthPageUrl={this._authUrl}
        providerConfig={providerConfig}
        buildAccountFromAuthResponse={buildO365AccountFromAuthResponse}
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
