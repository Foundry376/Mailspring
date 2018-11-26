import { React, PropTypes, MailspringAPIRequest } from 'mailspring-exports';
import { Webview } from 'mailspring-component-kit';
import OnboardingActions from './onboarding-actions';

export default class AuthenticatePage extends React.Component {
  static displayName = 'AuthenticatePage';

  static propTypes = {
    account: PropTypes.object,
  };

  _src() {
    // const n1Version = AppEnv.getVersion();
    // return `${MailspringAPIRequest.rootURLForServer(
    //   'identity'
    // )}/onboarding?utm_medium=N1&utm_source=OnboardingPage&N1_version=${n1Version}&client_edition=basic`;
    return 'https://www.edison.tech/';
  }

  _onDidFinishLoad = webview => {
    const receiveUserInfo = `
      var a = document.querySelector('#identity-result');
      result = a ? a.innerText : null;
    `;
    webview.executeJavaScript(receiveUserInfo, false, result => {
      this.setState({ ready: true, webviewLoading: false });
      if (result !== null) {
        OnboardingActions.identityJSONReceived(JSON.parse(atob(result)));
      }
    });

    const openExternalLink = `
      var el = document.querySelector('.open-external');
      if (el) {el.addEventListener('click', function(event) {console.log(this.href); event.preventDefault(); return false;})}
    `;
    webview.executeJavaScript(openExternalLink);
  };

  componentWillMount() {
    this._skipLogin();
  }

  _skipLogin() {
    const d = new Date();
    const sysdata = d.getTime();
    const result = {
      "id": "id_" + sysdata,
      "token": "token" + sysdata,
      "firstName": "",
      "lastName": "",
      "emailAddress": "",
      "object": "identity",
      "createdAt": d.toISOString(),
      "stripePlan": "Basic",
      "stripePlanEffective": "Basic",
      "stripeCustomerId": "cus_" + sysdata,
      "stripePeriodEnd": "2099-12-31T00:00:00.000Z"
    }
    OnboardingActions.identityJSONReceived(result);
  }

  render() {
    return (
      <div className="page authenticate">
        {/* <Webview src={this._src()} onDidFinishLoad={this._onDidFinishLoad} edisonAutoLogin={true} /> */}
      </div>
    );
  }
}
