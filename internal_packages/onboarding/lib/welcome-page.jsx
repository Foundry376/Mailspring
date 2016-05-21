import React from 'react';
import {Actions} from 'nylas-exports';
import {RetinaImg} from 'nylas-component-kit';
import OnboardingActions from './onboarding-actions';

export default class WelcomePage extends React.Component {
  static displayName = "WelcomePage";

  _onContinue = () => {
    Actions.recordUserEvent('Welcome Page Finished');
    OnboardingActions.moveToPage("tutorial");
  }

  render() {
    return (
      <div className="page welcome">
        <div className="steps-container">
          <div key="step-0">
            <RetinaImg className="logo" style={{marginTop: 166}} url="nylas://onboarding/assets/nylas-logo@2x.png" mode={RetinaImg.Mode.ContentPreserve} />
            <p className="hero-text" style={{fontSize: 46, marginTop: 57}}>Welcome to Nylas N1</p>
            <RetinaImg className="icons" style={{position: "absolute", top: 0, left: 0}} url="nylas://onboarding/assets/icons-bg@2x.png" mode={RetinaImg.Mode.ContentPreserve} />
          </div>
        </div>
        <div className="footer">
          <button key="next" className="btn btn-large btn-continue" onClick={this._onContinue}>Get Started</button>
        </div>
      </div>
    );
  }
}
