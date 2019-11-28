import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import OnboardingActions from './onboarding-actions';

export default class LoginPage extends React.Component {
  static displayName = 'LoginPage';

  _onContinue = () => {
    OnboardingActions.moveToPage('account-choose');
  };

  render() {
    return (
      <div className="page welcome">
        <div className="steps-container">
          <RetinaImg
            className="icons"
            url="edisonmail://onboarding/assets/logo-light.png"
            mode={RetinaImg.Mode.ContentPreserve}
          />
          <h1 className="hero-text">
            Welcome to the Mac Closed Beta
          </h1>
          <p>
            Connect your account to continue using the app
          </p>
          <button className="btn login-button" onClick={this._onContinue}>Login</button>
        </div>
      </div>
    );
  }
}
