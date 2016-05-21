import React from 'react';
import ReactDOM from 'react-dom';
import {NylasAPI} from 'nylas-exports';
import OnboardingActions from './onboarding-actions';

export default class AuthenticatePage extends React.Component {
  static displayName = "AuthenticatePage";

  static propTypes = {
    accountInfo: React.PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = {
      ready: false,
    };
  }

  componentDidMount() {
    const webview = ReactDOM.findDOMNode(this.refs.webview);
    webview.src = "http://pro.nylas.toad:5555/onboarding";
    webview.addEventListener('did-finish-load', () => {
      const js = `
        var a = document.querySelector('#pro-account');
        result = a ? a.innerText : null;
      `;
      webview.executeJavaScript(js, false, (result) => {
        this.setState({ready: true});
        if (result !== null) {
          this.onDidFinishAuth(JSON.parse(result));
        }
      });
    });
    webview.addEventListener('console-message', (e) => {
      console.log('Guest page logged a message:', e.message);
    });
  }

  componentWillUnmount() {
    if (this._nextTimeout) {
      clearTimeout(this._nextTimeout);
    }
  }

  onDidFinishAuth = (json) => {
    NylasAPI.setN1UserAccount(json);
    this._nextTimeout = setTimeout(() => {
      OnboardingActions.moveToPage('account-choose');
    }, 1000);
  }
  render() {
    const readyClass = this.state.ready ? ' ready' : '';

    return (
      <div className="page authenticate">
        <webview ref="webview"></webview>
        <div className={`webview-cover ${readyClass}`}></div>
      </div>
    );
  }
}
