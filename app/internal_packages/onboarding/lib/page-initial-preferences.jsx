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
      list: 'One Panel',
      split: 'Two Panels',
    }[this.props.mode];

    return (
      <div className={classname} onClick={this.props.onClick}>
        <RetinaImg
          name={`appearance-mode-${this.props.mode}${active}.png`}
          mode={RetinaImg.Mode.ContentPreserve}
        />
        <div>{label}</div>
      </div>
    );
  }
}

class InitialPreferencesOptions extends React.Component {
  static propTypes = { config: PropTypes.object };

  constructor(props) {
    super(props);
    this.state = { templates: [] };
    this._loadTemplates();
  }

  _loadTemplates = () => {
    const templatesDir = path.join(AppEnv.getLoadSettings().resourcePath, 'keymaps', 'templates');
    fs.readdir(templatesDir, (err, files) => {
      if (!files || !(files instanceof Array)) {
        return;
      }
      let templates = files.filter(
        filename => path.extname(filename) === '.cson' || path.extname(filename) === '.json'
      );
      templates = templates.map(filename => path.parse(filename).name);
      this.setState({ templates });
      this._setConfigDefaultsForAccount(templates);
    });
  };

  _setConfigDefaultsForAccount = templates => {
    if (!this.props.account) {
      return;
    }

    const templateWithBasename = name => templates.find(t => t.indexOf(name) === 0);

    if (this.props.account.provider === 'gmail') {
      this.props.config.set('core.workspace.mode', 'list');
      this.props.config.set('core.keymapTemplate', templateWithBasename('Edison'));
    } else if (
      this.props.account.provider === 'eas' ||
      this.props.account.provider === 'office365'
    ) {
      this.props.config.set('core.workspace.mode', 'split');
      this.props.config.set('core.keymapTemplate', templateWithBasename('Edison'));
    } else {
      this.props.config.set('core.workspace.mode', 'split');
      if (process.platform === 'darwin') {
        this.props.config.set('core.keymapTemplate', templateWithBasename('Edison'));
      } else {
        this.props.config.set('core.keymapTemplate', templateWithBasename('Edison'));
      }
    }
  };

  render() {
    if (!this.props.config) {
      return false;
    }

    return (
      <div className="preferences">
        <div>
          <h1>How do you want to view your inbox?</h1>
          <p>This will be the default view for your<br />mailbox lists.</p>
          <Flexbox direction="row" style={{ alignItems: 'center', width: 418 }}>
            {['list', 'split'].map(mode => (
              <AppearanceModeOption
                mode={mode}
                key={mode}
                active={this.props.config.get('core.workspace.mode') === mode}
                onClick={() => this.props.config.set('core.workspace.mode', mode)}
              />
            ))}
          </Flexbox>
        </div>
        <div style={{ flex: 1, display: 'none' }}>
          <p>
            We've picked a set of keyboard shortcuts based on your email account and platform. You
            can also pick another set:
          </p>
          <select
            style={{ margin: 0 }}
            value={this.props.config.get('core.keymapTemplate')}
            onChange={event => this.props.config.set('core.keymapTemplate', event.target.value)}
          >
            {this.state.templates.map(template => (
              <option key={template} value={template}>
                {template}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }
}

class InitialPreferencesPage extends React.Component {
  static displayName = 'InitialPreferencesPage';

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
            <InitialPreferencesOptions account={this.state.account} />
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

module.exports = InitialPreferencesPage;
