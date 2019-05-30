const React = require('react');
const PropTypes = require('prop-types');
const path = require('path');
const fs = require('fs');
const { RetinaImg, Flexbox, ConfigPropContainer, LottieImg } = require('mailspring-component-kit');
const { AccountStore, IdentityStore } = require('mailspring-exports');
const OnboardingActions = require('./onboarding-actions').default;

class InitialDonePage extends React.Component {
  static displayName = 'InitialDonePage';

  constructor(props) {
    super(props);
    this.state = { account: AccountStore.accounts()[0], submitting: false };
  }

  componentDidMount() {
    this._unlisten = AccountStore.listen(this._onAccountStoreChange);
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _onAccountStoreChange = () => {
    this.setState({ account: AccountStore.accounts()[0] });
  };

  render() {
    if (!this.state.account) {
      return <div />;
    }
    const { submitting } = this.state;
    return (
      <div className="page opaque" style={{ width: 900, height: '100%' }}>
        <img
          src={`edisonmail://onboarding/assets/onboarding-done@2x.png`}
          alt=""
        />
        <h1>You're all Set!</h1>
        <h4>We couldn't be happier to have you using Edison Mail for Mac.</h4>
        <div className="footer">
          <button className={'btn btn-large ' + (submitting && 'btn-disabled')} onClick={this._onFinished}>
            Let's Go
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

  _onFinished = () => {
    this.setState({
      submitting: true
    });
    require('electron').ipcRenderer.send('account-setup-successful');
  };
}

module.exports = InitialDonePage;
