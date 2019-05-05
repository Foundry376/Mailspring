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
        <button className={'btn btn-large ' + (submitting && 'btn-disabled')} style={{ marginBottom: 60 }} onClick={this._onFinished}>
          Let's Go
        </button>
        {
          submitting && (
            <LottieImg name='loading-spinner-blue'
              size={{ width: 24, height: 24 }}
              style={{
                margin: '20px auto 0',
                position: 'relative',
                bottom: '170px'
              }} />
          )
        }
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
