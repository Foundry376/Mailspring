import { shell, remote } from 'electron';
import React from 'react';
import ReactDOM from 'react-dom';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, Account } from 'mailspring-exports';

import OnboardingActions from '../onboarding-actions';
import { finalizeAndValidateAccount } from '../onboarding-helpers';
import FormErrorMessage from '../form-error-message';
import AccountProviders from '../account-providers';

let didWarnAboutGmailIMAP = false;

const CreatePageForForm = FormComponent => {
  return class Composed extends React.Component<
    { account: Account },
    {
      account: Account;
      submitting?: boolean;
      populated?: boolean;
      errorMessage?: string;
      errorStatusCode: number;
      errorFieldNames: string[];
      errorLog: string;
    }
  > {
    static displayName = FormComponent.displayName;

    _formEl: HTMLFormElement;

    constructor(props) {
      super(props);

      this.state = Object.assign(
        {
          account: this.props.account.clone(),
          errorFieldNames: [],
          errorMessage: null,
        },
        FormComponent.validateAccount(this.props.account)
      );
    }

    componentDidMount() {
      this._applyFocus();
    }

    componentDidUpdate() {
      this._applyFocus();
    }

    _applyFocus() {
      const anyInputFocused = document.activeElement && document.activeElement.nodeName === 'INPUT';
      if (anyInputFocused) {
        return;
      }

      const inputs = Array.from(
        (ReactDOM.findDOMNode(this) as HTMLElement).querySelectorAll('input')
      );
      if (inputs.length === 0) {
        return;
      }

      for (const input of inputs) {
        if (input.value === '') {
          input.focus();
          return;
        }
      }
      inputs[0].focus();
    }

    _isValid() {
      const { populated, errorFieldNames } = this.state;
      return errorFieldNames.length === 0 && populated;
    }

    onFieldChange = (event, { afterSetState }: { afterSetState?: () => void } = {}) => {
      const next = this.state.account.clone();

      let val = event.target.value;
      if (event.target.type === 'checkbox') {
        val = event.target.checked;
      }
      if (event.target.id === 'emailAddress') {
        val = val.trim();
      }

      if (event.target.id.includes('.')) {
        const [parent, key] = event.target.id.split('.');
        next[parent][key] = val;
      } else {
        next[event.target.id] = val;
      }

      const { errorFieldNames, errorMessage, populated } = FormComponent.validateAccount(next);

      this.setState(
        {
          account: next,
          errorFieldNames,
          errorMessage,
          populated,
          errorStatusCode: null,
        },
        afterSetState
      );
    };

    onSubmit = () => {
      OnboardingActions.setAccount(this.state.account);
      if (this._formEl.submit) {
        this.setState({ submitting: true });
        this._formEl.submit();
      } else {
        this.onConnect();
      }
    };

    onFieldKeyPress = event => {
      if (!this._isValid()) {
        return;
      }
      if (['Enter', 'Return'].includes(event.key)) {
        this.onSubmit();
      }
    };

    onBack = () => {
      OnboardingActions.setAccount(this.state.account);
      OnboardingActions.moveToPreviousPage();
    };

    onConnect = (updatedAccount?: Account) => {
      const account = updatedAccount || this.state.account;
      const providerConfig = AccountProviders.find(({ provider }) => provider === account.provider);

      // warn users about authenticating a Gmail or Google Apps account via IMAP
      // and allow them to go back
      if (
        !didWarnAboutGmailIMAP &&
        account.provider === 'imap' &&
        account.settings.imap_host &&
        account.settings.imap_host.includes('imap.gmail.com')
      ) {
        didWarnAboutGmailIMAP = true;
        const buttonIndex = remote.dialog.showMessageBox(null, {
          type: 'warning',
          buttons: [localized('Go Back'), localized('Continue')],
          message: localized('Are you sure?'),
          detail: localized(
            `This looks like a Gmail account! While it's possible to setup an App Password and connect to Gmail via IMAP, Mailspring also supports Google OAuth. Go back and select "Gmail & Google Apps" from the provider screen.`
          ),
        });
        if (buttonIndex === 0) {
          OnboardingActions.moveToPage('account-choose');
          return;
        }
      }

      this.setState({ submitting: true });

      finalizeAndValidateAccount(account)
        .then(validated => {
          OnboardingActions.moveToPage('account-onboarding-success');
          OnboardingActions.finishAndAddAccount(validated);
        })
        .catch(err => {
          // If we're connecting from the `basic` settings page with an IMAP account,
          // the settings are from a template. If authentication fails, move the user
          // to the full settings since our guesses may have been wrong.
          // TODO: Potentially show Authentication Errors on this simple screen?
          const isBasicForm = FormComponent.displayName === 'AccountBasicSettingsForm';
          if (account.provider === 'imap' && isBasicForm) {
            OnboardingActions.moveToPage('account-settings-imap');
            return;
          }
          const errorFieldNames = [];
          if (err.message.includes('Authentication Error')) {
            if (/smtp/i.test(err.message)) {
              errorFieldNames.push('settings.smtp_username');
              errorFieldNames.push('settings.smtp_password');
            } else {
              errorFieldNames.push('settings.imap_username');
              errorFieldNames.push('settings.imap_password');
            }
          }

          if (providerConfig.note) {
            const node = document.createElement('div');
            ReactDOM.render(providerConfig.note, node);
            let note = node.innerText;
            const link = node.querySelector('a');
            if (link) {
              note += '\n' + link.getAttribute('href');
            }
            err.rawLog = note + '\n\n' + err.rawLog;
          }
          this.setState({
            errorMessage: err.message,
            errorStatusCode: err.statusCode,
            errorLog: err.rawLog,
            errorFieldNames,
            submitting: false,
          });
        });
    };

    _renderButton() {
      const { account, submitting } = this.state;
      const buttonLabel = FormComponent.submitLabel(account);

      // We're not on the last page.
      if (submitting) {
        return (
          <button className="btn btn-large btn-disabled btn-add-account spinning">
            <RetinaImg
              name="sending-spinner.gif"
              width={15}
              height={15}
              mode={RetinaImg.Mode.ContentPreserve}
            />
            {localized('Adding account')}&hellip;
          </button>
        );
      }

      if (!this._isValid()) {
        return (
          <button className="btn btn-large btn-gradient btn-disabled btn-add-account">
            {buttonLabel}
          </button>
        );
      }

      return (
        <button className="btn btn-large btn-gradient btn-add-account" onClick={this.onSubmit}>
          {buttonLabel}
        </button>
      );
    }

    // When a user enters the wrong credentials, show a message that could
    // help with common problems. For instance, they may need an app password,
    // or to enable specific settings with their provider.
    _renderCredentialsNote() {
      const { errorStatusCode, account } = this.state;
      if (errorStatusCode !== 401) {
        return false;
      }
      let message;
      let articleURL;
      if (account.emailAddress.includes('@yahoo.com')) {
        message = localized('Have you enabled access through Yahoo?');
        articleURL =
          'http://support.getmailspring.com//hc/en-us/articles/115001882372-Authorizing-Use-with-Yahoo';
      } else {
        message = localized('Some providers require an app password.');
        articleURL =
          'http://support.getmailspring.com/hc/en-us/articles/115001876051-App-Passwords';
      }
      // We don't use a FormErrorMessage component because the content
      // we need to display has HTML.
      return (
        <div className="message error">
          {message}&nbsp;
          <a
            href=""
            style={{ cursor: 'pointer' }}
            onClick={() => {
              shell.openExternal(articleURL);
            }}
          >
            {localized('Learn more')}.
          </a>
        </div>
      );
    }

    render() {
      const { account, errorMessage, errorFieldNames, errorLog, submitting } = this.state;
      const providerConfig = AccountProviders.find(({ provider }) => provider === account.provider);

      if (!providerConfig) {
        throw new Error(`Cannot find account provider ${account.provider}`);
      }

      const hideTitle = errorMessage && errorMessage.length > 120;

      return (
        <div className={`page account-setup ${FormComponent.displayName}`}>
          <div className="logo-container">
            <RetinaImg
              style={{ backgroundColor: providerConfig.color, borderRadius: 44 }}
              name={providerConfig.headerIcon}
              mode={RetinaImg.Mode.ContentPreserve}
              className="logo"
            />
          </div>
          {hideTitle ? (
            <div style={{ height: 20 }} />
          ) : (
            <h2>{FormComponent.titleLabel(providerConfig)}</h2>
          )}
          <FormErrorMessage
            log={errorLog}
            message={errorMessage}
            empty={FormComponent.subtitleLabel(providerConfig)}
          />
          {this._renderCredentialsNote()}
          <FormComponent
            ref={el => {
              this._formEl = el;
            }}
            account={account}
            errorFieldNames={errorFieldNames}
            submitting={submitting}
            onFieldChange={this.onFieldChange}
            onFieldKeyPress={this.onFieldKeyPress}
            onConnect={this.onConnect}
          />
          <div>
            <div className="btn btn-large btn-gradient" onClick={this.onBack}>
              {localized('Back')}
            </div>
            {this._renderButton()}
          </div>
        </div>
      );
    }
  };
};

export default CreatePageForForm;
