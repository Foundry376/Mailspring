import React from 'react';
import PropTypes from 'prop-types';

import { buildOutlookAccountFromAuthResponse, buildOutlookAuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageOutlook extends React.Component {
  static displayName = 'AccountSettingsPageOutlook';

  static propTypes = {
    account: PropTypes.object,
  };

  constructor() {
    super();
    this._outlookAuthUrl = buildOutlookAuthURL();
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
        serviceName="Outlook"
        providerAuthPageUrl={this._outlookAuthUrl}
        buildAccountFromAuthResponse={code => buildOutlookAccountFromAuthResponse(code, this.props.account.provider)}
        iconName={headerIcon}
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
