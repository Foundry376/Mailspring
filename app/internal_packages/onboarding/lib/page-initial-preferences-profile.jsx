const React = require('react');
const PropTypes = require('prop-types');
const path = require('path');
const fs = require('fs');
const { RetinaImg, Flexbox, ConfigPropContainer, LottieImg } = require('mailspring-component-kit');
const { AccountStore, IdentityStore } = require('mailspring-exports');
const OnboardingActions = require('./onboarding-actions').default;

// NOTE: Temporarily copied from preferences module
class AppearanceModeOption extends React.Component {
  static propTypes = {
    mode: PropTypes.string.isRequired,
    active: PropTypes.bool,
    onClick: PropTypes.func,
  };

  render() {
    let classname = 'appearance-mode';
    let active = '';
    if (this.props.active) {
      classname += ' active';
      active = '-active';
    }

    const label = {
      show: 'Show',
      hide: 'Hide',
    }[this.props.mode];

    return (
      <div className={classname}>
        <div className={'imgbox'} onClick={this.props.onClick}>
          <RetinaImg
            name={`profile-${this.props.mode}${active}.png`}
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
        <div className={'label'}>{label}</div>
      </div>
    );
  }
}

class InitialPreferencesProfileOptions extends React.Component {
  static propTypes = { config: PropTypes.object };

  constructor(props) {
    super(props);
  }

  render() {
    if (!this.props.config) {
      return false;
    }

    return (
      <div className="preferences">
        <div>
          <p>2 of 2</p>
          <h1>Want to view profile images?</h1>
          <Flexbox direction="row" style={{ alignItems: 'center', width: 578 }}>
            {['show', 'hide'].map(mode => (
              <AppearanceModeOption
                mode={mode}
                key={mode}
                active={this.props.config.get('core.appearance.profile') === (mode === 'show')}
                onClick={() => this.props.config.set('core.appearance.profile', mode === 'show')}
              />
            ))}
          </Flexbox>
        </div>
      </div>
    );
  }
}

class InitialPreferencesProfilePage extends React.Component {
  static displayName = 'InitialPreferencesProfilePage';

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
    return (
      <div className="page opaque" style={{ width: 900, height: '100%' }}>
        <div className="configure">
          <ConfigPropContainer>
            <InitialPreferencesProfileOptions account={this.state.account} />
          </ConfigPropContainer>
        </div>
        <div className="footer">
          <button className="btn btn-large btn-continue" onClick={this._onFinished}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  _onFinished = () => {
    OnboardingActions.moveToPage('initial-done');
  };
}

module.exports = InitialPreferencesProfilePage;
