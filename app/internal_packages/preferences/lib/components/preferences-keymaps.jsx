import React from 'react';
import PropTypes from 'prop-types';
import path from 'path';
import fs from 'fs';
import { remote } from 'electron';
import { Flexbox } from 'mailspring-component-kit';

import displayedKeybindings from './keymaps/displayed-keybindings';
import CommandItem from './keymaps/command-item';

export class PreferencesKeymapsHearder extends React.Component {
  static displayName = 'PreferencesKeymapsHearder';

  static propTypes = {
    config: PropTypes.object,
  };

  constructor() {
    super();
    this.state = {
      templates: [],
    };
    this._loadTemplates();
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

  _onDeleteUserKeymap() {
    const chosen = remote.dialog.showMessageBoxSync(AppEnv.getCurrentWindow(), {
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

  render() {
    return (
      <div>
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
                onChange={event => this.props.config.set('core.keymapTemplate', event.target.value)}
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
    );
  }
}

export function PreferencesKeymapsContent() {
  const KeymapsContentGroups = displayedKeybindings.map(keybinding => {
    const groupItem = keybinding.items.map(([command, label]) => ({
      label: label,
      component: () => <CommandItem key={command} command={command} label={label} />,
      keywords: [],
    }));
    return {
      groupName: keybinding.title,
      groupItem: groupItem,
    };
  });
  return KeymapsContentGroups;
}
