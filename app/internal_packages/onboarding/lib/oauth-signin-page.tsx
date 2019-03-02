import { shell, clipboard } from 'electron';
import React from 'react';
import { localized, localizedReactFragment, PropTypes, Account } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import http from 'http';
import url from 'url';

import FormErrorMessage from './form-error-message';
import { LOCAL_SERVER_PORT } from './onboarding-helpers';

interface OAuthSignInPageProps {
  providerAuthPageUrl: string;
  buildAccountFromAuthResponse: (rep: any) => Account;
  onSuccess: (account: Account) => void;
  onTryAgain: () => void;
  iconName: string;
  sessionKey: string;
  serviceName: string;
}

interface OAuthSignInPageState {
  authStage: string;
  showAlternative: boolean;
  errorMessage?: string;
  pressed?: boolean;
}

export default class OAuthSignInPage extends React.Component<
  OAuthSignInPageProps,
  OAuthSignInPageState
> {
  static displayName = 'OAuthSignInPage';

  static propTypes = {
    /**
     * Step 1: Open a webpage in the user's browser letting them login on
     * the native provider's website. We pass along a key and a redirect
     * url to a Nylas-owned server
     */
    providerAuthPageUrl: PropTypes.string,
    buildAccountFromAuthResponse: PropTypes.func,
    onSuccess: PropTypes.func,
    onTryAgain: PropTypes.func,
    iconName: PropTypes.string,
    sessionKey: PropTypes.string,
    serviceName: PropTypes.string,
  };

  _server?: http.Server;
  _startTimer: NodeJS.Timeout;
  _warnTimer: NodeJS.Timeout;
  _mounted: boolean = false;

  state: OAuthSignInPageState = {
    authStage: 'initial',
    showAlternative: false,
  };

  componentDidMount() {
    // Show the "Sign in to ..." prompt for a moment before bouncing
    // to URL. (400msec animation + 200msec to read)
    this._mounted = true;
    this._startTimer = setTimeout(() => {
      if (!this._mounted) return;
      shell.openExternal(this.props.providerAuthPageUrl);
    }, 600);
    this._warnTimer = setTimeout(() => {
      if (!this._mounted) return;
      this.setState({ showAlternative: true });
    }, 1500);

    // launch a web server
    this._server = http.createServer((request, response) => {
      if (!this._mounted) return;
      const { query } = url.parse(request.url, true);
      if (query.code) {
        this._onReceivedCode(query.code);
        response.writeHead(302, { Location: 'https://id.getmailspring.com/oauth/finished' });
        response.end();
      } else {
        response.end('Unknown Request');
      }
    });
    this._server.listen(LOCAL_SERVER_PORT, err => {
      if (err) {
        AppEnv.showErrorDialog({
          title: localized('Unable to Start Local Server'),
          message: localized(
            `To listen for the Gmail Oauth response, Mailspring needs to start a webserver on port ${LOCAL_SERVER_PORT}. Please go back and try linking your account again. If this error persists, use the IMAP/SMTP option with a Gmail App Password.\n\n%@`,
            err
          ),
        });
        return;
      }
    });
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._startTimer) clearTimeout(this._startTimer);
    if (this._warnTimer) clearTimeout(this._warnTimer);
    if (this._server) this._server.close();
  }

  _onError(err) {
    this.setState({ authStage: 'error', errorMessage: err.message });
    AppEnv.reportError(err);
  }

  async _onReceivedCode(code) {
    if (!this._mounted) return;
    AppEnv.focus();
    this.setState({ authStage: 'buildingAccount' });
    let account = null;
    try {
      account = await this.props.buildAccountFromAuthResponse(code);
    } catch (err) {
      if (!this._mounted) return;
      this._onError(err);
      return;
    }
    if (!this._mounted) return;
    this.setState({ authStage: 'accountSuccess' });
    setTimeout(() => {
      if (!this._mounted) return;
      this.props.onSuccess(account);
    }, 400);
  }

  _renderHeader() {
    const authStage = this.state.authStage;
    if (authStage === 'initial') {
      return (
        <h2>
          {localizedReactFragment(
            'Sign in with %@ in %@ your browser.',
            this.props.serviceName,
            <br />
          )}
        </h2>
      );
    }
    if (authStage === 'buildingAccount') {
      return <h2>{localized('Connecting to %@…', this.props.serviceName)}</h2>;
    }
    if (authStage === 'accountSuccess') {
      return (
        <div>
          <h2>{localized('Successfully connected to %@!', this.props.serviceName)}</h2>
          <h3>{localized('Adding your account to Mailspring…')}</h3>
        </div>
      );
    }

    // Error
    return (
      <div>
        <h2>{localized('Sorry, we had trouble logging you in')}</h2>
        <div className="error-region">
          <FormErrorMessage message={this.state.errorMessage} />
          <div className="btn" style={{ marginTop: 20 }} onClick={this.props.onTryAgain}>
            {localized('Try Again')}
          </div>
        </div>
      </div>
    );
  }

  _renderAlternative() {
    let classnames = 'input hidden';
    if (this.state.showAlternative) {
      classnames += ' fadein';
    }

    return (
      <div className="alternative-auth">
        <div className={classnames}>
          <div style={{ marginTop: 40 }}>
            {localized(`Page didn't open? Paste this URL into your browser:`)}
          </div>
          <input
            type="url"
            className="url-copy-target"
            value={this.props.providerAuthPageUrl}
            readOnly
          />
          <div
            className="copy-to-clipboard"
            onClick={() => clipboard.writeText(this.props.providerAuthPageUrl)}
            onMouseDown={() => this.setState({ pressed: true })}
            onMouseUp={() => this.setState({ pressed: false })}
          >
            <RetinaImg name="icon-copytoclipboard.png" mode={RetinaImg.Mode.ContentIsMask} />
          </div>
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className={`page account-setup ${this.props.serviceName.toLowerCase()}`}>
        <div className="logo-container">
          <RetinaImg
            name={this.props.iconName}
            mode={RetinaImg.Mode.ContentPreserve}
            className="logo"
          />
        </div>
        {this._renderHeader()}
        {this._renderAlternative()}
      </div>
    );
  }
}
