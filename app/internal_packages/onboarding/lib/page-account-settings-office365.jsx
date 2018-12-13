import React from 'react';
import PropTypes from 'prop-types';

import { buildOffice365AccountFromAuthResponse, buildOffice365AuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageOffice365 extends React.Component {
  static displayName = 'AccountSettingsPageOffice365';

  static propTypes = {
    account: PropTypes.object,
  };

  constructor() {
    super();
    this._office365AuthUrl = buildOffice365AuthURL();
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
        serviceName="Office365"
        providerAuthPageUrl={this._office365AuthUrl}
        buildAccountFromAuthResponse={buildOffice365AccountFromAuthResponse}
        iconName={headerIcon}
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
