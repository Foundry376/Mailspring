import fs from 'fs';
import {
  React,
  PropTypes,
  AccountStore,
  SendActionsStore,
  DefaultClientHelper,
  SystemStartService,
} from 'mailspring-exports';
import { ListensToFluxStore, Menu, ButtonDropdown } from 'mailspring-component-kit';
import ConfigSchemaItem from './config-schema-item';

export class DefaultMailClientItem extends React.Component {
  constructor() {
    super();
    this._helper = new DefaultClientHelper();
    if (this._helper.available()) {
      this.state = { defaultClient: false };
      this._helper.isRegisteredForURLScheme('mailto', registered => {
        if (this._mounted) this.setState({ defaultClient: registered });
      });
    } else {
      this.state = { defaultClient: 'unknown' };
    }
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  toggleDefaultMailClient = event => {
    if (this.state.defaultClient) {
      this.setState({ defaultClient: false });
      this._helper.resetURLScheme('mailto');
    } else {
      this.setState({ defaultClient: true });
      this._helper.registerForURLScheme('mailto');
    }
    event.target.blur();
  };

  render() {
    if (this.state.defaultClient === 'unknown') {
      return (
        <div className="item">
          <div
            style={{ marginBottom: 12 }}
            className="btn btn-small"
            onClick={() =>
              shell.openExternal('https://foundry376.zendesk.com/hc/en-us/articles/115002281851')
            }
          >
            {this.props.label}
          </div>
        </div>
      );
    }

    return (
      <div className="item">
        <input
          type="checkbox"
          id="default-client"
          checked={this.state.defaultClient}
          onChange={this.toggleDefaultMailClient}
        />
        <label htmlFor="default-client">{this.props.label}</label>
      </div>
    );
  }
}

export class LaunchSystemStartItem extends React.Component {
  constructor() {
    super();
    this.state = {
      available: false,
      launchOnStart: false,
    };
    this._service = new SystemStartService();
  }

  componentDidMount() {
    this._mounted = true;
    this._service.checkAvailability().then(available => {
      if (this._mounted) {
        this.setState({ available });
      }
      if (!available || !this._mounted) return;
      this._service.doesLaunchOnSystemStart().then(launchOnStart => {
        if (this._mounted) {
          this.setState({ launchOnStart });
        }
      });
    });
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _toggleLaunchOnStart = event => {
    if (this.state.launchOnStart) {
      this.setState({ launchOnStart: false });
      this._service.dontLaunchOnSystemStart();
    } else {
      this.setState({ launchOnStart: true });
      this._service.configureToLaunchOnSystemStart();
    }
    event.target.blur();
  };

  render() {
    if (!this.state.available) return false;
    return (
      <div className="item">
        <input
          type="checkbox"
          id="launch-on-start"
          checked={this.state.launchOnStart}
          onChange={this._toggleLaunchOnStart}
        />
        <label htmlFor="launch-on-start">{this.props.label}</label>
      </div>
    );
  }
}

function getDefaultSendAccountSchema(configSchema) {
  const accounts = AccountStore.accounts();
  // const sendActions = SendActionsStore.sendActions()
  const defaultAccountIdForSend = {
    type: 'string',
    default: 'selected-mailbox',
    enum: ['selected-mailbox'].concat(accounts.map(acc => acc.id)),
    enumLabels: ['Automatically select best account'].concat(
      accounts.map(acc => acc.me().toString())
    ),
  };

  Object.assign(configSchema.properties.sending.properties, {
    defaultAccountIdForSend,
  });
  AppEnv.config.setDefaults('core.sending.defaultAccountIdForSend', 'selected-mailbox');
  return configSchema.properties.sending.properties.defaultAccountIdForSend;
}

function DefaultSendAccount(props) {
  const { config, defaultSendAccount, label } = props;

  return (
    <ConfigSchemaItem
      config={config}
      label={label}
      configSchema={defaultSendAccount}
      keyPath="core.sending.defaultAccountIdForSend"
    />
  );
}

DefaultSendAccount.displayName = 'DefaultSendAccount';
DefaultSendAccount.propTypes = {
  config: PropTypes.object,
  defaultSendAccount: PropTypes.object,
  label: PropTypes.string,
};

export const DefaultAccountSending = ListensToFluxStore(DefaultSendAccount, {
  stores: [AccountStore, SendActionsStore],
  getStateFromStores(props) {
    const { configSchema } = props;
    return {
      defaultSendAccount: getDefaultSendAccountSchema(configSchema),
    };
  },
});

export class DownloadSelection extends React.Component {
  static displayName = 'DownloadSelection';

  constructor() {
    super();
    this.state = {
      items: [
        ['Downloads', 'Downloads'],
        ['Ask me every time', 'Ask me every time'],
        ['Choose a folder...', 'Choose a folder...'],
      ],
      fixedOptions: ['Downloads', 'Ask me every time'],
    };
  }

  _onChangeValue = ([value]) => {
    const { fixedOptions } = this.state;
    if (fixedOptions.indexOf(value) >= 0) {
      this.props.config.set(this.props.keyPath, value);
      this._dropdownComponent.toggleDropdown();
    } else {
      this._dropdownComponent.toggleDropdown();
      const openDirOption = {
        properties: ['openDirectory'],
      };
      const path = this.props.config.get(this.props.keyPath);
      if (typeof path === 'string' && fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
        openDirOption['defaultPath'] = path;
      } else {
        const userPath = AppEnv.getUserDirPath();
        if (userPath) {
          openDirOption['defaultPath'] = userPath + '/Downloads';
        }
      }
      AppEnv.showOpenDialog(openDirOption, newPaths => {
        if (newPaths && newPaths.length > 0) {
          this.props.config.set(this.props.keyPath, newPaths[0]);
        }
      });
    }
  };

  _getSelectedMenuItem = () => {
    const { fixedOptions } = this.state;
    const selected = this.props.config.get(this.props.keyPath);
    if (fixedOptions.indexOf(selected) >= 0) {
      return <span key={selected}>{selected}</span>;
    } else {
      return <span key={'chooseFolder'}>{selected}</span>;
    }
  };

  render() {
    const { items } = this.state;
    const menu = (
      <Menu
        items={items}
        itemKey={item => item}
        itemContent={([value]) => <span key={value}>{value}</span>}
        onSelect={this._onChangeValue}
      />
    );

    return (
      <div className="item">
        <label>{this.props.label}:</label>
        <ButtonDropdown
          ref={cm => {
            this._dropdownComponent = cm;
          }}
          primaryItem={this._getSelectedMenuItem()}
          menu={menu}
        />
      </div>
    );
  }
}
