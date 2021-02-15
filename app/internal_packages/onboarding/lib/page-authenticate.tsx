import React from 'react';
import qs from 'querystring';
import { PropTypes, MailspringAPIRequest, IdentityAuthResponse } from 'mailspring-exports';
import { Webview } from 'mailspring-component-kit';
import * as OnboardingActions from './onboarding-actions';

export default class AuthenticatePage extends React.Component {
  static displayName = 'AuthenticatePage';

  static propTypes = {
    account: PropTypes.object,
  };

  _src() {
    return `${MailspringAPIRequest.rootURLForServer('identity')}/onboarding?${qs.stringify({
      version: AppEnv.getVersion(),
      skipSupported: true,
    })}`;
  }

  _onDidFinishLoad = async (webview: Electron.WebviewTag) => {
    const receiveUserInfo = `
      var a = document.querySelector('#identity-result');
      result = a ? a.innerText : null;
    `;
    const result = await webview.executeJavaScript(receiveUserInfo, false);
    this.setState({ ready: true, webviewLoading: false });
    if (result !== null) {
      const parsed = JSON.parse(atob(result)) as IdentityAuthResponse;
      OnboardingActions.identityJSONReceived(parsed);
    }

    const openExternalLink = `
      var el = document.querySelector('.open-external');
      if (el) {el.addEventListener('click', function(event) {console.log(this.href); event.preventDefault(); return false;})}
    `;
    webview.executeJavaScript(openExternalLink);
  };

  render() {
    return (
      <div className="page authenticate">
        <Webview src={this._src()} onDidFinishLoad={this._onDidFinishLoad} />
      </div>
    );
  }
}
