import React from 'react';

import { Account, localized, localizedReactFragment, RegExpUtils } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { buildO365AccountFromAuthResponse, buildO365AuthURL } from './onboarding-helpers';

import OAuthSignInPage from './oauth-signin-page';
import FormErrorMessage from './form-error-message';
import * as OnboardingActions from './onboarding-actions';
import AccountProviders from './account-providers';

interface AccountSettingsPageO365State {
  sharedMailbox: string;
  showSharedMailboxForm: boolean;
  fieldValue: string;
  errorMessage: string | null;
}

export default class AccountSettingsPageO365 extends React.Component<
  { account: Account },
  AccountSettingsPageO365State
> {
  static displayName = 'AccountSettingsPageO365';

  _authUrl = buildO365AuthURL();

  state: AccountSettingsPageO365State = {
    sharedMailbox: '',
    // Preferences > Accounts > "Add Shared Mailbox..." opens the onboarding window
    // with this flag so the user lands directly on the shared mailbox form.
    showSharedMailboxForm: !!AppEnv.getWindowProps().o365SharedMailbox,
    fieldValue: '',
    errorMessage: null,
  };

  onSuccess(account) {
    OnboardingActions.finishAndAddAccount(account);
  }

  _onSubmitSharedMailbox = () => {
    const address = this.state.fieldValue.trim();
    if (!RegExpUtils.emailRegex().test(address)) {
      this.setState({
        errorMessage: localized('Please provide a valid email address.'),
      });
      return;
    }
    this.setState({
      sharedMailbox: address,
      showSharedMailboxForm: false,
      errorMessage: null,
    });
  };

  _onFieldKeyPress = (event: React.KeyboardEvent) => {
    if (['Enter', 'Return'].includes(event.key)) {
      this._onSubmitSharedMailbox();
    }
  };

  _renderSharedMailboxForm(providerConfig) {
    return (
      <div className="page account-setup office 365">
        <div className="logo-container">
          <RetinaImg
            name={providerConfig.headerIcon}
            style={{ backgroundColor: providerConfig.color, borderRadius: 44 }}
            mode={RetinaImg.Mode.ContentPreserve}
            className="logo"
          />
        </div>
        <h2>{localized('Connect a shared mailbox')}</h2>
        <div className="message empty note">
          {localized(
            `Enter the address of the shared mailbox, then sign in with your own Office 365 account. Your account needs "Full Access" permission on the shared mailbox to read mail, and "Send As" permission to send from its address. Without "Send As", the mailbox connects read-only and sending will fail.`
          )}
        </div>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            this._onSubmitSharedMailbox();
          }}
        >
          <FormErrorMessage message={this.state.errorMessage} />
          <span>
            <label htmlFor="sharedMailbox">{localized('Shared mailbox address')}:</label>
            <input
              type="text"
              id="sharedMailbox"
              className={this.state.errorMessage ? 'error' : ''}
              spellCheck={false}
              autoFocus
              value={this.state.fieldValue}
              onKeyPress={this._onFieldKeyPress}
              onChange={(e) => this.setState({ fieldValue: e.target.value })}
            />
          </span>
        </form>
        <div>
          <button
            className="btn btn-large btn-gradient btn-add-account"
            onClick={this._onSubmitSharedMailbox}
          >
            {localized('Continue')}
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <a
            onClick={() => {
              if (this.state.sharedMailbox) {
                // Came back here from the sign-in screen via "Change" — return to it.
                this.setState({ showSharedMailboxForm: false, errorMessage: null });
              } else {
                OnboardingActions.moveToPreviousPage();
              }
            }}
          >
            {localized('Cancel')}
          </a>
        </div>
      </div>
    );
  }

  _renderSharedMailboxConfirmation() {
    // Shared mailboxes are connected from Preferences > Accounts (matching Outlook,
    // which has no shared mailbox path in first-run setup), so this only confirms
    // the pending shared address during the OAuth sign-in. Rendered in flow just
    // below the provider note — the bottom of the page is occupied by the
    // "Page didn't open?" fallback UI.
    if (!this.state.sharedMailbox) {
      return undefined;
    }
    return (
      <div>
        <div className="shared-mailbox-confirmation">
          {localizedReactFragment(
            'Shared mailbox: %@',
            <strong>{this.state.sharedMailbox}</strong>
          )}
          <a onClick={() => this.setState({ showSharedMailboxForm: true })}>
            {localized('Change')}
          </a>
        </div>
      </div>
    );
  }

  render() {
    const providerConfig = AccountProviders.find((a) => a.provider === this.props.account.provider);

    if (this.state.showSharedMailboxForm) {
      return this._renderSharedMailboxForm(providerConfig);
    }

    const goBack = () => OnboardingActions.moveToPreviousPage();
    const { sharedMailbox } = this.state;

    return (
      <OAuthSignInPage
        serviceName="Office 365"
        providerAuthPageUrl={this._authUrl}
        providerConfig={providerConfig}
        buildAccountFromAuthResponse={(code) =>
          buildO365AccountFromAuthResponse(code, sharedMailbox || undefined)
        }
        onSuccess={this.onSuccess}
        onTryAgain={goBack}
      >
        {this._renderSharedMailboxConfirmation()}
      </OAuthSignInPage>
    );
  }
}
