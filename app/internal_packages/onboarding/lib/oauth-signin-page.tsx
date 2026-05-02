import { shell } from 'electron';
import React from 'react';
import { localized, localizedReactFragment, PropTypes, Account } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import http from 'http';
import url from 'url';

import FormErrorMessage from './form-error-message';
import { LOCAL_SERVER_PORT } from './onboarding-constants';
import AccountProviders from './account-providers';

/**
 * Extract the OAuth authorization code from a redirect URL's query string.
 * Uses decodeURIComponent instead of querystring.parse to preserve `+` as
 * a literal character (RFC 3986) rather than decoding it as a space
 * (application/x-www-form-urlencoded).
 */
export function extractOAuthCodeFromUrl(requestUrl: string): string | null {
  const parsedUrl = url.parse(requestUrl);
  const rawQuery = parsedUrl.query || '';
  const codeMatch = rawQuery.match(/(?:^|&)code=([^&]*)/);
  if (!codeMatch) return null;
  try {
    return decodeURIComponent(codeMatch[1]);
  } catch {
    return null;
  }
}

interface OAuthSignInPageProps {
  providerAuthPageUrl: string;
  buildAccountFromAuthResponse: (rep: any) => Account | Promise<Account>;
  onSuccess: (account: Account) => void;
  onTryAgain: () => void;
  providerConfig: (typeof AccountProviders)[0];
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
     * url to a Mailspring-owned server
     */
    providerAuthPageUrl: PropTypes.string,
    buildAccountFromAuthResponse: PropTypes.func,
    onSuccess: PropTypes.func,
    onTryAgain: PropTypes.func,
    iconName: PropTypes.string,
    serviceName: PropTypes.string,
  };

  _server?: http.Server;
  _startTimer: NodeJS.Timeout;
  _warnTimer: NodeJS.Timeout;
  _mounted = false;

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
      const code = extractOAuthCodeFromUrl(request.url);
      if (code) {
        this._onReceivedCode(code);
        response.writeHead(302, { Location: 'https://id.getmailspring.com/oauth/finished' });
        response.end();
      } else {
        response.end('Unknown Request');
      }
    });
    this._server.once('error', (err) => {
      AppEnv.showErrorDialog({
        title: localized('Unable to Start Local Server'),
        message: localized(
          `To listen for the Gmail Oauth response, Mailspring needs to start a webserver on port ${LOCAL_SERVER_PORT}. Please go back and try linking your account again. If this error persists, use the IMAP/SMTP option with a Gmail App Password.\n\n%@`,
          err
        ),
      });
    });
    this._server.listen(LOCAL_SERVER_PORT);
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._startTimer) clearTimeout(this._startTimer);
    if (this._warnTimer) clearTimeout(this._warnTimer);
    if (this._server) this._server.close();
  }

  _onError(err) {
    const isNetworkError = err.message?.includes('Failed to fetch');
    this.setState({
      authStage: 'error',
      errorMessage: isNetworkError
        ? localized(
            'A network error occurred. Please check your internet connection and try again.'
          )
        : err.message,
    });
    if (!isNetworkError) {
      AppEnv.reportError(err);
    }
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
    const { note } = this.props.providerConfig;
    return (
      <div>
        <h2>{localized('Sorry, we had trouble logging you in')}</h2>
        <div className="error-region">
          <FormErrorMessage message={this.state.errorMessage} />
          {note && <div className="message empty note">{note}</div>}
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
            onClick={() =>
              navigator.clipboard
                .writeText(this.props.providerAuthPageUrl)
                .catch((err) => console.error('Failed to copy to clipboard:', err))
            }
            onMouseDown={() => this.setState({ pressed: true })}
            onMouseUp={() => this.setState({ pressed: false })}
          >
            <RetinaImg name="icon-copytoclipboard.png" mode={RetinaImg.Mode.ContentIsMask} />
          </div>
        </div>
      </div>
    );
  }

  _renderNote() {
    if (this.state.authStage === 'error') return null;
    const { note } = this.props.providerConfig;
    if (!note) return null;
    return <div className="message empty note">{note}</div>;
  }

  render() {
    return (
      <div className={`page account-setup ${this.props.serviceName.toLowerCase()}`}>
        <div className="logo-container">
          <RetinaImg
            name={this.props.providerConfig.headerIcon}
            style={{ backgroundColor: this.props.providerConfig.color, borderRadius: 44 }}
            mode={RetinaImg.Mode.ContentPreserve}
            className="logo"
          />
        </div>
        {this._renderHeader()}
        {this._renderNote()}
        {this._renderAlternative()}
      </div>
    );
  }
}
