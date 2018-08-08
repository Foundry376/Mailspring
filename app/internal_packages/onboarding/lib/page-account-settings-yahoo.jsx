import React from 'react';
import PropTypes from 'prop-types';

import { buildYahooAccountFromAuthResponse, buildYahooAuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageYahoo extends React.Component {
  static displayName = 'AccountSettingsPageYahoo';

  static propTypes = {
    account: PropTypes.object,
  };

  constructor() {
    super();
    this._yahooAuthUrl = buildYahooAuthURL();
  }

  onSuccess(account) {
    OnboardingActions.finishAndAddAccount(account);
  }

  render() {
    const providerConfig = AccountProviders.find(a => a.provider === this.props.account.provider);
    const { headerIcon } = providerConfig;
    const goBack = () => OnboardingActions.moveToPreviousPage();

    return (
      <OAuthSignInPage
        serviceName="Yahoo"
        providerAuthPageUrl={this._yahooAuthUrl}
        buildAccountFromAuthResponse={buildYahooAccountFromAuthResponse}
        iconName={headerIcon}
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
