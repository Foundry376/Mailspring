import React from 'react';
import PropTypes from 'prop-types';
import path from 'path';
import fs from 'fs';
import { remote } from 'electron';
import { Flexbox } from 'mailspring-component-kit';

import displayedKeybindings from './keymaps/displayed-keybindings';
import CommandItem from './keymaps/command-item';

export default class PreferencesKeymaps extends React.Component {
  static displayName = 'PreferencesKeymaps';

  static propTypes = {
    config: PropTypes.object,
  };

  constructor() {
    super();
    this.state = {
      templates: [],
      bindings: this._getStateFromKeymaps(),
    };
    this._loadTemplates();
  }

  componentDidMount() {
    this._disposable = AppEnv.keymaps.onDidReloadKeymap(() => {
      this.setState({ bindings: this._getStateFromKeymaps() });
    });
  }

  componentWillUnmount() {
    this._disposable.dispose();
  }

  _getStateFromKeymaps() {
    const bindings = {};
    for (const section of displayedKeybindings) {
      for (const [command] of section.items) {
        bindings[command] = AppEnv.keymaps.getBindingsForCommand(command) || [];
      }
    }
    return bindings;
  }

  _loadTemplates() {
    const templatesDir = path.join(AppEnv.getLoadSettings().resourcePath, 'keymaps', 'templates');
    fs.readdir(templatesDir, (err, files) => {
      if (!files || !(files instanceof Array)) return;
      let templates = files.filter(filename => {
        return path.extname(filename) === '.json';
      });
      templates = templates.map(filename => {
        return path.parse(filename).name;
      });
      this.setState({ templates: templates });
    });
  }

  _onShowUserKeymaps() {
    const keymapsFile = AppEnv.keymaps.getUserKeymapPath();
    if (!fs.existsSync(keymapsFile)) {
      fs.writeFileSync(keymapsFile, '{}');
    }
    remote.shell.showItemInFolder(keymapsFile);
  }

  _onDeleteUserKeymap() {
    const chosen = remote.dialog.showMessageBox(AppEnv.getCurrentWindow(), {
      type: 'info',
      message: 'Are you sure?',
      detail: 'Delete your custom key bindings and reset to the template defaults?',
      buttons: ['Cancel', 'Reset'],
    });

    if (chosen === 1) {
      const keymapsFile = AppEnv.keymaps.getUserKeymapPath();
      fs.writeFileSync(keymapsFile, '{}');
    }
  }

  _renderBindingsSection = section => {
    return (
      <div className="config-group" key={section.title}>
        <h6>{section.title}</h6>
        {section.items.map(([command, label]) => {
          return (
            <CommandItem
              key={command}
              command={command}
              label={label}
              bindings={this.state.bindings[command]}
            />
          );
        })}
      </div>
    );
  };

  render() {
    return (
      <div className="container-keymaps">
        <div className="config-group">
          <h6>SHORTCUTS</h6>
          <div className="keymaps-note">
            Choose a set of keyboard shortcuts that you would like to use in the app. To customize a
            shortcut, click it in the list below and enter a replacement on your keyboard.
          </div>
          <Flexbox direction="row" className="shortcut-set">
            <div className="item">
              <label>Shortcut set:</label>
              <div className="button-dropdown">
                <select
                  style={{ margin: 0 }}
                  tabIndex={-1}
                  value={this.props.config.get('core.keymapTemplate')}
                  onChange={event =>
                    this.props.config.set('core.keymapTemplate', event.target.value)
                  }
                >
                  {this.state.templates.map(template => {
                    return (
                      <option key={template} value={template}>
                        {template}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <button className="btn" onClick={this._onDeleteUserKeymap}>
              Reset to Defaults
            </button>
          </Flexbox>
        </div>

        {displayedKeybindings.map(this._renderBindingsSection)}
      </div>
    );
  }
}
