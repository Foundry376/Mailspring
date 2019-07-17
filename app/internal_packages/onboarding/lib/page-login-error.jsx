const React = require('react');
const PropTypes = require('prop-types');
const path = require('path');
const fs = require('fs');
const { RetinaImg, Flexbox, ConfigPropContainer, LottieImg } = require('mailspring-component-kit');
const { AccountStore, IdentityStore } = require('mailspring-exports');
const OnboardingActions = require('./onboarding-actions').default;

class LoginErrorPage extends React.Component {
  static displayName = 'LoginErrorPage';

  constructor(props) {
    super(props);
    this.state = { submitting: false };
  }

  render() {
    const { submitting } = this.state;
    return (
      <div className="page opaque" style={{ width: 900, height: '100%' }}>
        <img
          src={`edisonmail://onboarding/assets/login-error.png`}
          alt=""
        />
        <h1>Oops!</h1>
        <h4>We had trouble logging you in.</h4>
        <div className="footer">
          <button className={'btn btn-large ' + (submitting && 'btn-disabled')} onClick={this._onClick}>
            Try Again
          </button>
          {
            submitting && (
              <LottieImg name='loading-spinner-blue'
                size={{ width: 24, height: 24 }}
                style={{
                  marginLeft: '-12px',
                  position: 'absolute',
                  bottom: '70px',
                  left: '50%'
                }} />
            )
          }
        </div>
      </div>
    );
  }

  _onClick = () => {
    this.setState({
      submitting: true
    });
    OnboardingActions.moveToPage('account-choose');
  };
}

module.exports = LoginErrorPage;
