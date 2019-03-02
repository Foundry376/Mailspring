import url from 'url';
import React from 'react';
import PropTypes from 'prop-types';
import { shell } from 'electron';
import ReactDOM from 'react-dom';
import classnames from 'classnames';
import networkErrors from 'chromium-net-errors';
import { localized } from 'mailspring-exports';

import { rootURLForServer } from '../flux/mailspring-api-request';
import { RetinaImg } from './retina-img';
import { Disposable } from 'event-kit';

type InitialLoadingCoverProps = {
  ready?: boolean;
  error?: string;
  onTryAgain?: (...args: any[]) => any;
};
type InitialLoadingCoverState = {
  slow: boolean;
};

class InitialLoadingCover extends React.Component<
  InitialLoadingCoverProps,
  InitialLoadingCoverState
> {
  state = {
    slow: false,
  };
  _slowTimeout: NodeJS.Timeout;

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this._slowTimeout = setTimeout(() => {
      this.setState({ slow: true });
    }, 3500);
  }

  componentWillUnmount() {
    clearTimeout(this._slowTimeout);
    this._slowTimeout = null;
  }

  render() {
    const classes = classnames({
      'webview-cover': true,
      ready: this.props.ready,
      error: this.props.error,
      slow: this.state.slow,
    });

    let message = this.props.error;
    if (this.props.error) {
      message = this.props.error;
    } else if (this.state.slow) {
      message = localized(`Still trying to reach %@…`, rootURLForServer('identity'));
    } else {
      message = '&nbsp;';
    }

    return (
      <div className={classes}>
        <div style={{ flex: 1 }} />
        <RetinaImg
          className="spinner"
          style={{ width: 20, height: 20 }}
          name="inline-loading-spinner.gif"
          mode={RetinaImg.Mode.ContentPreserve}
        />
        <div className="message">{message}</div>
        <div className="btn try-again" onClick={this.props.onTryAgain}>
          {localized('Try Again')}
        </div>
        <div style={{ flex: 1 }} />
      </div>
    );
  }
}

type WebviewProps = {
  src?: string;
  onDidFinishLoad?: (...args: any[]) => any;
};
type WebviewState = {
  webviewLoading: boolean;
  ready: boolean;
  error: null;
};

export default class Webview extends React.Component<WebviewProps, WebviewState> {
  static displayName = 'Webview';

  _mounted: boolean = false;
  _disposable?: Disposable;

  state: WebviewState = {
    webviewLoading: false,
    ready: false,
    error: null,
  };

  componentDidMount() {
    this._mounted = true;
    this._setupWebview(this.props);

    // Workaround: The webview doesn't receive any of the standard commands - they're
    // caught in the parent page and not forwarded into the focused <webview />, so
    // we're attaching listeners to the <webview /> node in our DOM and forwarding the
    // events into the child DOM manually.
    const webview = ReactDOM.findDOMNode(this.refs.webview) as Electron.WebviewTag;
    this._disposable = AppEnv.commands.add(webview, {
      'core:copy': () => webview.getWebContents().copy(),
      'core:cut': () => webview.getWebContents().cut(),
      'core:paste': () => webview.getWebContents().paste(),
      'core:paste-and-match-style': () => webview.getWebContents().pasteAndMatchStyle(),
      'core:undo': e => webview.getWebContents().undo(),
      'core:redo': e => webview.getWebContents().redo(),
      'core:select-all': e => webview.getWebContents().selectAll(),
    });
  }

  componentWillReceiveProps(nextProps: WebviewProps) {
    if (this.props.src !== nextProps.src) {
      this.setState({ error: null, webviewLoading: true, ready: false });
      this._setupWebview(nextProps);
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._disposable) {
      this._disposable.dispose();
      this._disposable = null;
    }
  }

  _setupWebview(props) {
    if (!props.src) return;
    const webview = ReactDOM.findDOMNode(this.refs.webview) as Electron.WebviewTag;
    const listeners = {
      'did-fail-load': this._webviewDidFailLoad,
      'did-finish-load': this._webviewDidFinishLoad,
      'did-get-response-details': this._webviewDidGetResponseDetails,
      'console-message': this._onConsoleMessage,
      'new-window': this._onNewWindow,

      // Workaround: When a webview changes pages, it's focus state seems to get out of
      // sync and the text insertion cursor disappears until you blur it and focus it again.
      'did-navigate': () => webview.blur(),
    };
    for (const event of Object.keys(listeners)) {
      webview.removeEventListener(event, listeners[event]);
    }
    webview.partition = 'in-memory-only';
    webview.src = props.src;
    for (const event of Object.keys(listeners)) {
      webview.addEventListener(event, listeners[event]);
    }
  }

  _onTryAgain = () => {
    const webview = ReactDOM.findDOMNode(this.refs.webview) as Electron.WebviewTag;
    webview.reload();
  };

  _onNewWindow = e => {
    const { protocol } = url.parse(e.url);
    if (protocol === 'http:' || protocol === 'https:') {
      shell.openExternal(e.url);
    }
  };

  _onConsoleMessage = e => {
    if (/^http.+/i.test(e.message)) {
      shell.openExternal(e.message);
    }
    console.log('Guest page logged a message:', e.message);
  };

  _webviewDidGetResponseDetails = ({ httpResponseCode, originalURL }) => {
    if (!this._mounted) return;
    if (!originalURL.includes(url.parse(this.props.src).host)) {
      // This means that some other secondarily loaded resource (like
      // analytics or Linkedin, etc) got a response. We don't care about
      // that.
      return;
    }
    if (httpResponseCode >= 400) {
      const error = localized(
        `Could not reach Mailspring. Please try again or contact support@getmailspring.com if the issue persists. (%@: %@)`,
        originalURL,
        httpResponseCode
      );
      this.setState({ ready: false, error: error, webviewLoading: false });
    }
    this.setState({ webviewLoading: false });
  };

  _webviewDidFailLoad = ({ errorCode, validatedURL }) => {
    if (!this._mounted) return;
    // "Operation was aborted" can be fired when we move between pages quickly.
    if (errorCode === -3) {
      return;
    }

    const e = networkErrors.createByCode(errorCode);
    const error = localized(`Could not reach %@. %@`, validatedURL, e ? e.message : errorCode);
    this.setState({ ready: false, error: error, webviewLoading: false });
  };

  _webviewDidFinishLoad = () => {
    if (!this._mounted) return;
    // this is sometimes called right after did-fail-load
    if (this.state.error) return;
    this.setState({ ready: true, webviewLoading: false });

    if (!this.props.onDidFinishLoad) return;
    const webview = ReactDOM.findDOMNode(this.refs.webview) as Electron.WebviewTag;
    this.props.onDidFinishLoad(webview);

    // tweak the size of the webview to ensure it's contents have laid out
    window.requestAnimationFrame(() => {
      webview.style.bottom = '1px';
      window.requestAnimationFrame(() => {
        webview.style.bottom = '0';
      });
    });
  };

  render() {
    return (
      <div className="webview-wrap">
        <webview ref="webview" partition="in-memory-only" />
        <div className={`webview-loading-spinner loading-${this.state.webviewLoading}`}>
          <RetinaImg
            style={{ width: 20, height: 20 }}
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
        <InitialLoadingCover
          ready={this.state.ready}
          error={this.state.error}
          onTryAgain={this._onTryAgain}
        />
      </div>
    );
  }
}
