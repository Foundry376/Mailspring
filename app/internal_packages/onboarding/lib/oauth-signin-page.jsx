import { clipboard } from 'electron';
import OnboardingActions from './onboarding-actions';
import { React, ReactDOM, PropTypes } from 'mailspring-exports';
import { RetinaImg, LottieImg } from 'mailspring-component-kit';
import http from 'http';
import url from 'url';

import FormErrorMessage from './form-error-message';
import { LOCAL_SERVER_PORT } from './onboarding-helpers';

export default class OAuthSignInPage extends React.Component {
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

  constructor(props) {
    super(props);
    this._mounted = false;
    this.state = {
      authStage: 'initial',
      showAlternative: false,
      open: false,
      url: null,
      loading: true,
      isYahoo: /yahoo/g.test(props.providerAuthPageUrl)
    };
  }

  _openInWebView(url) {
    this.setState({
      open: true,
      url
    });
  }

  componentDidMount() {
    this._setupWebview();

    // Show the "Sign in to ..." prompt for a moment before bouncing
    // to URL. (400msec animation + 200msec to read)
    this._mounted = true;
    this._startTimer = setTimeout(() => {
      if (!this._mounted) return;
      // shell.openExternal(this.props.providerAuthPageUrl);
      this._openInWebView(this.props.providerAuthPageUrl)
    }, 600);
    this._warnTimer = setTimeout(() => {
      if (!this._mounted) return;
      this.setState({ showAlternative: true });
    }, 1500);

    // launch a web server
    this._server = http.createServer((request, response) => {
      if (!this._mounted) return;
      const { query } = url.parse(request.url, { querystring: true });
      if (query.code) {
        this._onReceivedCode(query.code);
        // when oauth succeed, display Edison homepage
        response.writeHead(302, { Location: 'http://email.easilydo.com' });
        response.end();
      }
      else if (query.error === 'access_denied') {
        OnboardingActions.moveToPage('account-choose');
        return;
      }
      else {
        response.end('Unknown Request');
      }
    });
    this._server.listen(LOCAL_SERVER_PORT, err => {
      if (err) {
        AppEnv.showErrorDialog({
          title: 'Unable to Start Local Server',
          message: `To listen for the Oauth response, Edison Mail needs to start a webserver on port ${LOCAL_SERVER_PORT}. Please go back and try linking your account again. If this error persists, use the IMAP/SMTP option with an App Password.\n\n${err}`,
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
          Sign in with {this.props.serviceName} in<br />your browser.
        </h2>
      );
    }
    if (authStage === 'buildingAccount') {
      return <h2>Connecting to {this.props.serviceName}…</h2>;
    }
    if (authStage === 'accountSuccess') {
      return (
        <div>
          <h2>Successfully connected to {this.props.serviceName}!</h2>
          <h3>Adding your account to Edison Mail…</h3>
        </div>
      );
    }

    // Error
    return (
      <div>
        <h2>Sorry, we had trouble logging you in</h2>
        <div className="error-region">
          <FormErrorMessage message={this.state.errorMessage} />
          <div className="btn" style={{ marginTop: 20 }} onClick={this.props.onTryAgain}>
            Try Again
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
            Page didn&#39;t open? Paste this URL into your browser:
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

  _onConsoleMessage = e => {
    // console.log('*****webview: ' + e.message);
    if (e.message === 'move-to-account-choose') {
      OnboardingActions.moveToPage('account-choose');
    }
  }

  _setupWebview = () => {
    const webview = ReactDOM.findDOMNode(this.refs.webview);
    if (!webview) {
      return;
    }
    const listeners = {
      // 'did-fail-load': this._webviewDidFailLoad,
      'did-finish-load': this._loaded,
      // 'did-get-response-details': this._webviewDidGetResponseDetails,
      'console-message': this._onConsoleMessage,
    };

    for (const event of Object.keys(listeners)) {
      webview.removeEventListener(event, listeners[event]);
    }
    for (const event of Object.keys(listeners)) {
      webview.addEventListener(event, listeners[event]);
    }

    if (this.state.isYahoo) {
      webview.getWebContents().executeJavaScript(`
      function deleteAllCookies() {
          var cookies = document.cookie.split(";");
          if (cookies.length > 0) {
              for (var i = 0; i < cookies.length; i++) {
                  var cookie = cookies[i];
                  var eqPos = cookie.indexOf("=");
                  var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
                  name = name.trim();
                  document.cookie = name + "=;expires=" + new Date(0).toUTCString() + "; path=/; domain=.yahoo.com";
              }
          }
      }
      deleteAllCookies();
    `, false, () => {
          webview.reload();
        });
      webview.setAttribute('preload', '../internal_packages/onboarding/lib/oauth-inject-yahoo.js');
    }
  }

  _loaded = () => {
    this.setState({
      loading: false
    });
  }

  render() {
    const { authStage, loading, isYahoo } = this.state;
    const defaultOptions = {
      height: '100%',
      width: '100%',
      position: 'fixed',
      top: 75,
      bottom: 0,
      zIndex: 2
    };
    const yahooOptions = {
      position: 'fixed',
      width: '100%',
      height: '100%',
      top: 0,
      left: 0,
      zIndex: 2,
    }
    return (
      <div className={`page account-setup oauth ${this.props.serviceName.toLowerCase()}`}>
        {authStage === 'buildingAccount' || authStage === 'accountSuccess' ? (
          <div className="validating">
            <h2>Validating...</h2>
            <p>Please wait while we validate<br />
              your account.</p>
            <LottieImg name='loading-spinner-blue'
              size={{ width: 65, height: 65 }}
              style={{ margin: '0 auto' }} />
          </div>
        ) : (
            <webview ref='webview' src={this.state.url} partition="in-memory-only" style={
              isYahoo ? yahooOptions : defaultOptions
            } />
          )}
        {loading && (
          <LottieImg name='loading-spinner-blue'
            size={{ width: 65, height: 65 }}
            style={{ margin: '200px auto 0' }} />
        )}
        {authStage === 'error' && (
          <div style={{ marginTop: 100 }} >
            <h2>Sorry, we had trouble logging you in</h2>
            <div className="error-region">
              <FormErrorMessage message={this.state.errorMessage} />
            </div>
          </div>
        )}
      </div>
    );
  }
}
