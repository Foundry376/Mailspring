/* eslint global-require: 0*/
import React from 'react';
import PropTypes from 'prop-types';
import rimraf from 'rimraf';
import { localized } from 'mailspring-exports';
import ConfigSchemaItem from './config-schema-item';
import WorkspaceSection from './workspace-section';
import SendingSection from './sending-section';

class PreferencesGeneral extends React.Component {
  static displayName = 'PreferencesGeneral';

  static propTypes = {
    config: PropTypes.object,
    configSchema: PropTypes.object,
  };

  _onReboot = () => {
    const app = require('electron').remote.app;
    app.relaunch();
    app.quit();
  };

  _onResetAccountsAndSettings = () => {
    rimraf(AppEnv.getConfigDirPath(), { disableGlob: true }, err => {
      if (err) {
        return AppEnv.showErrorDialog(
          localized(
            `Could not reset accounts and settings. Please delete the folder %@ manually.\n\n%@`,
            AppEnv.getConfigDirPath(),
            err.toString()
          )
        );
      }
      this._onReboot();
    });
  };

  _onResetEmailCache = () => {
    const ipc = require('electron').ipcRenderer;
    ipc.send('command', 'application:reset-database', {});
  };

  render() {
    return (
      <div className="container-general" style={{ maxWidth: 600 }}>
        <WorkspaceSection config={this.props.config} configSchema={this.props.configSchema} />

        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.notifications}
          keyName={localized('Notifications')}
          keyPath="core.notifications"
          config={this.props.config}
        />

        <div className="platform-note platform-linux-only">
          {localized(
            'Mailspring desktop notifications on Linux require Zenity. You may need to install it with your package manager.'
          )}
        </div>

        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.reading}
          keyName={localized('Reading')}
          keyPath="core.reading"
          config={this.props.config}
        />

        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.composing}
          keyName={localized('Composing')}
          keyPath="core.composing"
          config={this.props.config}
        />

        <SendingSection config={this.props.config} configSchema={this.props.configSchema} />

        <ConfigSchemaItem
          configSchema={this.props.configSchema.properties.attachments}
          keyName={localized('Attachments')}
          keyPath="core.attachments"
          config={this.props.config}
        />

        <div className="local-data">
          <h6>{localized('Local Data')}</h6>
          <div className="btn" onClick={this._onResetEmailCache}>
            {localized('Reset Cache')}
          </div>
          <div className="btn" onClick={this._onResetAccountsAndSettings}>
            {localized('Reset Accounts and Settings')}
          </div>
        </div>
      </div>
    );
  }
}

export default PreferencesGeneral;
