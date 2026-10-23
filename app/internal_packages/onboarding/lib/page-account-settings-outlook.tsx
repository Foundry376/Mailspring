import React from 'react';

import { Account, localized } from 'mailspring-exports';
import { buildOutlookAccountFromAuthResponse, buildO365AuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import * as OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

export default class AccountSettingsPageOutlook extends React.Component<{ account: Account }> {
  static displayName = 'AccountSettingsPageOutlook';

  _authUrl = buildO365AuthURL();
  _withGraphSend = true;

  // Organizations that require admin approval for new permissions decline the Graph mail
  // scopes; the account can still be added with the permissions approved before, sending over SMTP.
  _graphSendFallback = {
    label: localized('Sign in without Microsoft 365 sending'),
    prompt: localized("Asked for an administrator's approval?"),
    onSelect: () => {
      this._withGraphSend = false;
      this._authUrl = buildO365AuthURL({ withGraphSend: false });
      this.forceUpdate();
    },
  };

  onSuccess(account) {
    OnboardingActions.finishAndAddAccount(account);
  }

  render() {
    const providerConfig = AccountProviders.find((a) => a.provider === this.props.account.provider);
    const goBack = () => OnboardingActions.moveToPreviousPage();

    return (
      <OAuthSignInPage
        serviceName="Outlook"
        key={this._authUrl}
        providerAuthPageUrl={this._authUrl}
        fallback={this._withGraphSend ? this._graphSendFallback : undefined}
        providerConfig={providerConfig}
        buildAccountFromAuthResponse={(code) =>
          buildOutlookAccountFromAuthResponse(code, { withGraphSend: this._withGraphSend })
        }
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      />
    );
  }
}
