import React from 'react';
import path from 'path';
import fs from 'fs';

import { Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import displayedKeybindings from './keymaps/displayed-keybindings';
import CommandItem from './keymaps/command-item';
import { readUserKeymap, writeUserKeymap, clearedKeymap, UserKeymap } from './keymaps/user-keymap';
import { Disposable } from 'event-kit';

export default class PreferencesKeymaps extends React.Component<
  { config: any },
  { templates: string[]; bindings: { [command: string]: [] }; userKeymap: UserKeymap }
> {
  static displayName = 'PreferencesKeymaps';

  _disposable?: Disposable;

  constructor(props) {
    super(props);
    this.state = {
      templates: [],
      bindings: this._getStateFromKeymaps(),
      userKeymap: readUserKeymap(AppEnv.keymaps.getUserKeymapPath()),
    };
    this._loadTemplates();
  }

  componentDidMount() {
    this._disposable = AppEnv.keymaps.onDidReloadKeymap(() => {
      this.setState({
        bindings: this._getStateFromKeymaps(),
        userKeymap: readUserKeymap(AppEnv.keymaps.getUserKeymapPath()),
      });
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
      let templates = files.filter((filename) => {
        return path.extname(filename) === '.json';
      });
      templates = templates.map((filename) => {
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
    require('@electron/remote').shell.showItemInFolder(keymapsFile);
  }

  _onDeleteUserKeymap() {
    const chosen = require('@electron/remote').dialog.showMessageBoxSync({
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

  _onClear(commands: string[]) {
    const keymapPath = AppEnv.keymaps.getUserKeymapPath();
    writeUserKeymap(keymapPath, clearedKeymap(readUserKeymap(keymapPath), commands));
  }

  _onClearAll = () => {
    const chosen = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'info',
      message: localized('Are you sure?'),
      detail: localized(
        'Remove every shortcut in this list? Add back the ones you want with +, or use Restore Defaults.'
      ),
      buttons: [localized('Cancel'), localized('Clear All')],
    });
    if (chosen === 1) {
      this._onClear(displayedKeybindings.flatMap((section) => section.items.map(([c]) => c)));
    }
  };

  _renderBindingsSection = (section: { title: string; items: string[][] }) => {
    return (
      <section key={`section-${section.title}`}>
        <Flexbox className="shortcut-section-title">
          <div style={{ flex: 1 }}>{section.title}</div>
          <a
            className="clear-section"
            onClick={() => this._onClear(section.items.map(([command]) => command))}
          >
            {localized('Clear')}
          </a>
        </Flexbox>
        {section.items.map(([command, label]) => {
          return (
            <CommandItem
              key={command}
              command={command}
              label={label}
              bindings={this.state.bindings[command]}
              customized={command in this.state.userKeymap}
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
                value={this.props.config.get('core.keymapTemplate')}
                onChange={(event) =>
                  this.props.config.set('core.keymapTemplate', event.target.value)
                }
              >
                {this.state.templates.map((template) => {
                  return (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  );
                })}
              </select>
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn" style={{ marginRight: 8 }} onClick={this._onClearAll}>
              {localized('Clear All')}
            </button>
            <button className="btn" onClick={this._onDeleteUserKeymap}>
              {localized('Restore Defaults')}
            </button>
          </Flexbox>
          <p style={{ maxWidth: 600 }}>
            {localized(
              'You can choose a shortcut set to use keyboard shortcuts of familiar email clients. To add a shortcut, click + next to a command and press the keys.'
            )}
          </p>
          <div className="two-columns-flexbox">
            <div style={{ flex: 1 }}>
              {displayedKeybindings.slice(0, 3).map(this._renderBindingsSection)}
            </div>
            <div style={{ width: 30 }} />
            <div style={{ flex: 1 }}>
              {displayedKeybindings.slice(3).map(this._renderBindingsSection)}
            </div>
          </div>
        </section>
        <section>
          <h2>{localized('Customization')}</h2>
          <p>
            {localized(
              'Add shortcuts above with +. For even more control, you can edit the shortcuts file directly below.'
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
