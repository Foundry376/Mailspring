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
          <div>
            <p className="hero-text" style={{ fontSize: 46, marginTop: 257 }}>
              Welcome to Edison Mail
            </p>
            <RetinaImg
              className="icons"
              url="edisonmail://onboarding/assets/icons-bg@2x.png"
              mode={RetinaImg.Mode.ContentPreserve}
            />
          </div>
        </div>
        <div className="footer">
          <button key="next" className="btn btn-large btn-continue" onClick={this._onContinue}>
            Login
          </button>
        </div>
      </div>
    );
  }
}
