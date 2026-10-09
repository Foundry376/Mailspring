import { shell } from 'electron';
import React from 'react';
import { localized, localizedReactFragment, Account } from 'mailspring-exports';
import { CopyButton, RetinaImg } from 'mailspring-component-kit';
import crypto from 'crypto';
import http from 'http';
import url from 'url';

import FormErrorMessage from './form-error-message';
import { LOCAL_SERVER_PORT, getLatestOAuthState } from './onboarding-constants';
import AccountProviders from './account-providers';

/**
 * Read a parameter from a redirect URL's query string, ignoring the path so the
 * same listener serves Google (root) and Microsoft (`/desktop`) redirects.
 * Uses decodeURIComponent instead of querystring.parse to preserve `+` as
 * a literal character (RFC 3986) rather than decoding it as a space
 * (application/x-www-form-urlencoded).
 */
function extractQueryParam(requestUrl: string, param: string): string | null {
  const rawQuery = url.parse(requestUrl).query || '';
  const match = rawQuery.match(new RegExp(`(?:^|&)${param}=([^&]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function extractOAuthCodeFromUrl(requestUrl: string): string | null {
  return extractQueryParam(requestUrl, 'code');
}

export function extractOAuthStateFromUrl(requestUrl: string): string | null {
  return extractQueryParam(requestUrl, 'state');
}

/**
 * The `state` value is carried alongside PKCE as defense in depth (RFC 6749 §10.12).
 * A callback whose state is absent or does not match the value on the most recently
 * built authorization URL aborts the sign-in rather than exchanging the code.
 */
export function oauthStateIsValid(
  received: string | null,
  expected: string | null = getLatestOAuthState()
): boolean {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

interface OAuthSignInPageProps {
  providerAuthPageUrl: string;
  buildAccountFromAuthResponse: (rep: any) => Account | Promise<Account>;
  onSuccess: (account: Account) => void;
  onTryAgain: () => void;
  providerConfig: (typeof AccountProviders)[0];
  serviceName: string;
  children?: React.ReactNode;
}

interface OAuthSignInPageState {
  authStage: string;
  showAlternative: boolean;
  errorMessage?: string;
  errorLog?: string;
}

export default class OAuthSignInPage extends React.Component<
  OAuthSignInPageProps,
  OAuthSignInPageState
> {
  static displayName = 'OAuthSignInPage';

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
      if (!code) {
        response.end('Unknown Request');
        return;
      }
      if (!oauthStateIsValid(extractOAuthStateFromUrl(request.url))) {
        this._onStateMismatch();
        response.writeHead(400);
        response.end('Invalid State');
        return;
      }
      this._onReceivedCode(code);
      response.writeHead(302, { Location: 'https://id.getmailspring.com/oauth/finished' });
      response.end();
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
    const isNetworkError = err.message?.includes('Failed to fetch') || err.isNetworkError;
    this.setState({
      authStage: 'error',
      errorMessage: isNetworkError
        ? localized(
            'A network error occurred. Please check your internet connection and try again.'
          )
        : err.message,
      errorLog: err.rawLog,
    });
    // Don't report network errors or user-configuration errors (e.g. account has no mailbox)
    // to Sentry — they are expected and shown directly to the user.
    if (!isNetworkError && !err.isUserError) {
      AppEnv.reportError(err);
    }
  }

  _onStateMismatch() {
    AppEnv.focus();
    // A callback for an authorization URL built before the current one (e.g. a sign-in
    // tab left open from an earlier visit to this page) lands here, so this is shown
    // to the user rather than reported to Sentry.
    const err: any = new Error(
      localized(
        'The sign-in response did not match this sign-in attempt. Please go back and try again.'
      )
    );
    err.isUserError = true;
    this._onError(err);
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
          <FormErrorMessage message={this.state.errorMessage} log={this.state.errorLog} />
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
          <CopyButton className="copy-to-clipboard" text={this.props.providerAuthPageUrl} />
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
        {this.state.authStage === 'initial' && this.props.children}
        {this._renderAlternative()}
      </div>
    );
  }
}
