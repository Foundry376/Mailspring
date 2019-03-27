import React from 'react';
import OnboardingActions from './onboarding-actions';
import { AccountStore } from 'mailspring-exports';
import {
  RetinaImg
} from 'mailspring-component-kit';

export default class AddAnotherAccountPage extends React.Component {
  static displayName = 'AddAnotherAccountPage';

  constructor(props) {
    super(props);
  }

  componentDidMount() {

  }

  _onFinish = () => {
    OnboardingActions.moveToPage('initial-preferences');
  };

  _onAddNow = () => {
    OnboardingActions.moveToPage('account-choose');
  }

  render() {
    const accounts = AccountStore.accounts() || [];
    return (
      <div className={`page add-another`}>
        <div className="add-another-container">
          <img
            className="logo"
            src={`edisonmail://onboarding/assets/addAnotherAccount.png`}
            alt=""
          />
          <h1>Would you like to add another account?</h1>
          <h4>Access all of your accounts in one app.</h4>
          <div className="email-list">
            {
              accounts.map(acc => (
                <div key={acc.emailAddress} className="email-item">
                  <RetinaImg name={'check.svg'}
                    style={{ width: 28, height: 28 }}
                    isIcon
                    mode={RetinaImg.Mode.ContentIsMask} />
                  <span>{acc.emailAddress}</span>
                </div>
              ))
            }
          </div>
        </div>
        <div className="footer">
          <button key="later" className="btn btn-large btn-later" onClick={this._onFinish}>
            Maybe Later
          </button>
          <button key="now" className="btn btn-large btn-now" onClick={this._onAddNow}>
            Add Now!
          </button>
        </div>
      </div >
    );
  }
}
