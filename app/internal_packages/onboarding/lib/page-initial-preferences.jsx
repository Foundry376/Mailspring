const React = require('react');
const PropTypes = require('prop-types');
const path = require('path');
const fs = require('fs');
const { RetinaImg, Flexbox, ConfigPropContainer } = require('mailspring-component-kit');
const { localized, AccountStore, IdentityStore } = require('mailspring-exports');
const OnboardingActions = require('./onboarding-actions').default;
const NewsletterSignup = require('./newsletter-signup').default;

// NOTE: Temporarily copied from preferences module
class AppearanceModeOption extends React.Component {
  static propTypes = {
    mode: PropTypes.string.isRequired,
    active: PropTypes.bool,
    onClick: PropTypes.func,
  };

  render() {
    let classname = 'appearance-mode';
    if (this.props.active) {
      classname += ' active';
    }

    const label = {
      list: localized('Reading Pane Off'),
      split: localized('Reading Pane On'),
    }[this.props.mode];

    return (
      <div className={classname} onClick={this.props.onClick}>
        <RetinaImg
          name={`appearance-mode-${this.props.mode}.png`}
          mode={RetinaImg.Mode.ContentIsMask}
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
      this.props.config.set('core.keymapTemplate', templateWithBasename('Gmail'));
    } else if (
      this.props.account.provider === 'eas' ||
      this.props.account.provider === 'office365'
    ) {
      this.props.config.set('core.workspace.mode', 'split');
      this.props.config.set('core.keymapTemplate', templateWithBasename('Outlook'));
    } else {
      this.props.config.set('core.workspace.mode', 'split');
      if (process.platform === 'darwin') {
        this.props.config.set('core.keymapTemplate', templateWithBasename('Apple Mail'));
      } else {
        this.props.config.set('core.keymapTemplate', templateWithBasename('Outlook'));
      }
    }
  };

  render() {
    if (!this.props.config) {
      return false;
    }

    return (
      <div
        style={{
          display: 'flex',
          width: 600,
          marginBottom: 50,
          marginLeft: 150,
          marginRight: 150,
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <p>
            {localized('Do you prefer a single panel layout (like Gmail) or a two panel layout?')}
          </p>
          <Flexbox direction="row" style={{ alignItems: 'center' }}>
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
        <div
          key="divider"
          style={{ marginLeft: 20, marginRight: 20, borderLeft: '1px solid #ccc' }}
        />
        <div style={{ flex: 1 }}>
          <p>
            {localized(
              `We've picked a set of keyboard shortcuts based on your email account and platform. You can also pick another set:`
            )}
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
          <div style={{ paddingTop: 20 }}>
            <NewsletterSignup
              emailAddress={this.props.account.emailAddress}
              name={this.props.account.name}
            />
          </div>
        </div>
      </div>
    );
  }
}

class InitialPreferencesPage extends React.Component {
  static displayName = 'InitialPreferencesPage';

  constructor(props) {
    super(props);
    this.state = { account: AccountStore.accounts()[0] };
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
      <div className="page opaque" style={{ width: 900, height: 620 }}>
        <h1 style={{ paddingTop: 100 }}>{localized(`Welcome to Mailspring`)}</h1>
        <h4 style={{ marginBottom: 60 }}>{localized(`Let's set things up to your liking.`)}</h4>
        <ConfigPropContainer>
          <InitialPreferencesOptions account={this.state.account} />
        </ConfigPropContainer>
        <button className="btn btn-large" style={{ marginBottom: 60 }} onClick={this._onFinished}>
          {localized(`Looks Good!`)}
        </button>
      </div>
    );
  }

  _onFinished = () => {
    if (IdentityStore.hasProFeatures()) {
      require('electron').ipcRenderer.send('account-setup-successful');
    } else {
      OnboardingActions.moveToPage('initial-subscription');
    }
  };
}

module.exports = InitialPreferencesPage;
