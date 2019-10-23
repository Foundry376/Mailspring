import { shell, remote } from 'electron';
import { ScrollRegion, RetinaImg, LottieImg } from 'mailspring-component-kit';
import { React, ReactDOM, PropTypes } from 'mailspring-exports';
import OnboardingActions from '../onboarding-actions';
import { finalizeAndValidateAccount } from '../onboarding-helpers';
import FormErrorMessage from '../form-error-message';
import AccountProviders from '../account-providers';

let didWarnAboutGmailIMAP = false;

const CreatePageForForm = FormComponent => {
  return class Composed extends React.Component {
    static displayName = FormComponent.displayName;

    static propTypes = {
      account: PropTypes.object,
    };

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

    _applyFocus() {
      const anyInputFocused = document.activeElement && document.activeElement.nodeName === 'INPUT';
      if (anyInputFocused) {
        return;
      }

      const inputs = Array.from(ReactDOM.findDOMNode(this).querySelectorAll('input'));
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

    onFieldChange = event => {
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
        // fill name field
        if (event.target.id === 'emailAddress') {
          next['name'] = val;
        }
      }

      const { errorFieldNames, errorMessage, populated } = FormComponent.validateAccount(next);

      this.setState({
        account: next,
        errorFieldNames,
        errorMessage,
        populated,
        errorStatusCode: null,
      });
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

    onConnect = updatedAccount => {
      const account = updatedAccount || this.state.account;

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
          buttons: ['Go Back', 'Continue'],
          message: 'Are you sure?',
          detail:
            `This looks like a Gmail account! While it's possible to setup an App ` +
            `Password and connect to Gmail via IMAP, EdisonMail also supports Google OAuth. Go ` +
            `back and select "Gmail & Google Apps" from the provider screen.`,
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
          } else if (/certificate/i.test(err.message)){
            errorFieldNames.push('settings.imap_allow_insecure_ssl');
            errorFieldNames.push('settings.smtp_allow_insecure_ssl');
            remote.dialog.showMessageBox(
              remote.getCurrentWindow(),
              {
                type: 'warning',
                buttons: ['Go Back', 'Continue'],
                message: 'Certificate Error',
                detail: `The TLS certificate for this server seems to be incorrect. Do you want to continue?`,
              },
              response => {
                if (response === 1 && this.state.account && this.state.account.settings) {
                  account.settings.imap_allow_insecure_ssl = true;
                  account.settings.smtp_allow_insecure_ssl = true;
                  this.setState({ account, submitting: true }, () => {
                    this.onConnect(this.state.account);
                  });
                } else {
                  account.settings.imap_allow_insecure_ssl = false;
                  account.settings.smtp_allow_insecure_ssl = false;
                  const errorAccount = Object.assign({}, account);
                  delete errorAccount.name;
                  delete errorAccount.emailAddress;
                  delete errorAccount.label;
                  delete errorAccount.autoaddress;
                  delete errorAccount.aliases;
                  AppEnv.reportError(err, { account: errorAccount });
                  this.setState({
                    errorMessage: err.message,
                    errorStatusCode: err.statusCode,
                    errorLog: err.rawLog,
                    errorFieldNames,
                    account,
                    submitting: false,
                  });
                }
              }
            );
            return;
          }
          const errorAccount = Object.assign({}, account);
          delete errorAccount.name;
          delete errorAccount.emailAddress;
          delete errorAccount.label;
          delete errorAccount.autoaddress;
          delete errorAccount.aliases;
          AppEnv.reportError(err, { account: errorAccount });

          this.setState({
            errorMessage: err.message,
            errorStatusCode: err.statusCode,
            errorLog: err.rawLog,
            errorFieldNames,
            account,
            submitting: false,
          });
        });
    };

    _renderButton() {
      const { account, submitting } = this.state;
      let buttonLabel = 'Sign In';
      if (account.provider === 'imap' && FormComponent.displayName !== 'AccountIMAPSettingsForm') {
        buttonLabel = 'Continue'
      }

      // We're not on the last page.
      if (submitting) {
        return (
          <button className="btn btn-large btn-disabled btn-add-account spinning">
            {buttonLabel}
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
        message = 'Have you enabled access through Yahoo?';
        articleURL =
          'http://support.getmailspring.com//hc/en-us/articles/115001882372-Authorizing-Use-with-Yahoo';
      } else {
        message = 'Some providers require an app password.';
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
            Learn more.
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
        <ScrollRegion className={`page account-setup ${FormComponent.displayName}`}>
          <div className="logo-container">
            <RetinaImg
              name={providerConfig.icon}
              mode={RetinaImg.Mode.ContentPreserve}
              className="logo"
            />
            <h2>{providerConfig.displayName}</h2>
          </div>
          <FormErrorMessage
            empty={FormComponent.subtitleLabel(providerConfig)}
          />
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
            providerConfig={providerConfig}
          />
          <FormErrorMessage
            log={errorLog}
            message={errorMessage}
          />
          {this._renderCredentialsNote()}
          <div>
            {this._renderButton()}
          </div>
          {providerConfig.twoStep}
          {
            submitting && (
              <LottieImg name='loading-spinner-blue'
                size={{ width: 24, height: 24 }}
                style={{ margin: '20px auto 0' }} />
            )
          }
        </ScrollRegion>
      );
    }
  };
};

export default CreatePageForForm;
