import React from 'react';
import PropTypes from 'prop-types';
import path from 'path';
import fs from 'fs';
import { remote } from 'electron';
import { Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import displayedKeybindings from './keymaps/displayed-keybindings';
import CommandItem from './keymaps/command-item';
import { Disposable } from 'event-kit';

export default class PreferencesKeymaps extends React.Component<
  { config: any },
  { templates: string[]; bindings: { [command: string]: [] } }
> {
  static displayName = 'PreferencesKeymaps';

  static propTypes = {
    config: PropTypes.object,
  };

  _disposable?: Disposable;

  constructor(props) {
    super(props);
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
    const bindings: { [command: string]: [] } = {};
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
    const chosen = remote.dialog.showMessageBox({
      type: 'info',
      message: localized('Are you sure?'),
      detail: localized('Delete your custom key bindings and reset to the template defaults?'),
      buttons: [localized('Cancel'), localized('Reset')],
    });

    if (chosen === 1) {
      const keymapsFile = AppEnv.keymaps.getUserKeymapPath();
      fs.writeFileSync(keymapsFile, '{}');
    }
  }

  _renderBindingsSection = section => {
    return (
      <section key={`section-${section.title}`}>
        <div className="shortcut-section-title">{section.title}</div>
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
      </section>
    );
  };

  render() {
    return (
      <div className="container-keymaps">
        <section>
          <Flexbox className="container-dropdown">
            <div>{localized('Shortcuts')}</div>
            <div className="dropdown">
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
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={this._onDeleteUserKeymap}>
              {localized('Restore Defaults')}
            </button>
          </Flexbox>
          <p>
            {localized(
              'You can choose a shortcut set to use keyboard shortcuts of familiar email clients. To edit a shortcut, click it in the list below and enter a replacement on the keyboard.'
            )}
          </p>
          {displayedKeybindings.map(this._renderBindingsSection)}
        </section>
        <section>
          <h2>{localized('Customization')}</h2>
          <p>
            {localized(
              'Click shortcuts above to edit them. For even more control, you can edit the shortcuts file directly below.'
            )}
          </p>
          <button className="btn" onClick={this._onShowUserKeymaps}>
            {localized('Edit custom shortcuts')}
          </button>
        </section>
      </div>
    );
  }
}
