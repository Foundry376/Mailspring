import React from 'react';
import PropTypes from 'prop-types';
import { localized, DefaultClientHelper, SystemStartService } from 'mailspring-exports';
import { shell } from 'electron';

import ConfigSchemaItem from './config-schema-item';

interface DefaultMailClientItemState {
  defaultClient: boolean | 'unknown';
}

const DELAY_FOR_SHEET_ANIMATION = 25;

const helper = new DefaultClientHelper();
const service = new SystemStartService();

class DefaultMailClientItem extends React.Component<{}, DefaultMailClientItemState> {
  _mounted: boolean = false;

  state: DefaultMailClientItemState = { defaultClient: helper.available() ? false : 'unknown' };

  async componentDidMount() {
    this._mounted = true;

    if (helper.available()) {
      await Promise.delay(DELAY_FOR_SHEET_ANIMATION);
      if (!this._mounted) return;
      helper.isRegisteredForURLScheme('mailto', registered => {
        if (!this._mounted) return;
        this.setState({ defaultClient: registered });
      });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  toggleDefaultMailClient = event => {
    if (this.state.defaultClient) {
      this.setState({ defaultClient: false });
      helper.resetURLScheme('mailto');
    } else {
      this.setState({ defaultClient: true });
      helper.registerForURLScheme('mailto');
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
            {localized('Use Mailspring as default mail client')}
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
        <label htmlFor="default-client">{localized('Use Mailspring as default mail client')}</label>
      </div>
    );
  }
}

class LaunchSystemStartItem extends React.Component {
  _service = new SystemStartService();
  state = {
    available: false,
    launchOnStart: false,
  };

  _mounted: boolean;

  async componentDidMount() {
    this._mounted = true;

    const available = await service.checkAvailability();
    if (!this._mounted) return;
    this.setState({ available });

    if (available) {
      const launchOnStart = service.doesLaunchOnSystemStart();
      if (!this._mounted) return;
      this.setState({ launchOnStart });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  _toggleLaunchOnStart = event => {
    if (this.state.launchOnStart) {
      this.setState({ launchOnStart: false });
      service.dontLaunchOnSystemStart();
    } else {
      this.setState({ launchOnStart: true });
      service.configureToLaunchOnSystemStart();
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
        <label htmlFor="launch-on-start">{localized('Launch on system start')}</label>
      </div>
    );
  }
}

const WorkspaceSection = props => {
  return (
    <section>
      <DefaultMailClientItem />

      <LaunchSystemStartItem />

      <ConfigSchemaItem
        configSchema={props.configSchema.properties.workspace.properties.systemTray}
        keyPath="core.workspace.systemTray"
        config={props.config}
      />

      <ConfigSchemaItem
        configSchema={props.configSchema.properties.workspace.properties.showImportant}
        keyPath="core.workspace.showImportant"
        config={props.config}
      />

      <ConfigSchemaItem
        configSchema={props.configSchema.properties.workspace.properties.showUnreadForAllCategories}
        keyPath="core.workspace.showUnreadForAllCategories"
        config={props.config}
      />

      <ConfigSchemaItem
        configSchema={props.configSchema.properties.workspace.properties.use24HourClock}
        keyPath="core.workspace.use24HourClock"
        config={props.config}
      />

      <ConfigSchemaItem
        configSchema={props.configSchema.properties.workspace.properties.interfaceZoom}
        keyPath="core.workspace.interfaceZoom"
        config={props.config}
      />

      <div className="platform-note platform-linux-only">
        {localized(
          `"Launch on system start" only works in XDG-compliant desktop environments. To enable the Mailspring icon in the system tray, you may need to install libappindicator.`
        )}
      </div>
    </section>
  );
};

WorkspaceSection.propTypes = {
  config: PropTypes.object,
  configSchema: PropTypes.object,
};

export default WorkspaceSection;
