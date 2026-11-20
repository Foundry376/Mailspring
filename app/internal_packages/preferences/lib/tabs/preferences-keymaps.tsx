import React from 'react';
import path from 'path';
import fs from 'fs';

import { Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import displayedKeybindings from './keymaps/displayed-keybindings';
import CommandItem from './keymaps/command-item';
import {
  readUserKeymap,
  writeUserKeymap,
  clearedKeymap,
  withoutBinding,
  addedBindings,
  findConflicts,
  Conflicts,
  UserKeymap,
} from './keymaps/user-keymap';

const LABELS: { [command: string]: string } = Object.fromEntries(
  displayedKeybindings.flatMap((section) =>
    section.items.map(([command, label]) => [command, label])
  )
);
import { matchesQuery, runsOnKey } from './keymaps/shortcut-search';
import { ShortcutRecorder } from './keymaps/shortcut-recorder';
import { formatKeystrokes, renderKeystrokes } from './keymaps/keystrokes';
import { Disposable } from 'event-kit';

export default class PreferencesKeymaps extends React.Component<
  { config: any },
  {
    templates: string[];
    bindings: { [command: string]: [] };
    userKeymap: UserKeymap;
    query: string;
    /** The key whose commands are listed, after Find by key. */
    keyQuery: string | null;
    findingKey: boolean;
    show: 'all' | 'changed' | 'conflicts';
  }
> {
  static displayName = 'PreferencesKeymaps';

  _disposable?: Disposable;

  constructor(props) {
    super(props);
    this.state = {
      templates: [],
      bindings: this._getStateFromKeymaps(),
      userKeymap: readUserKeymap(AppEnv.keymaps.getUserKeymapPath()),
      query: '',
      keyQuery: null,
      findingKey: false,
      show: 'all',
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

  /** Keys the user added to each command they changed, which the conflict check is about. */
  _addedBindings(all: { [command: string]: string[] }) {
    const added: { [command: string]: string[] } = {};
    for (const command of Object.keys(this.state.userKeymap)) {
      added[command] = addedBindings(
        all[command] || [],
        AppEnv.keymaps.getDefaultBindingsForCommand(command),
        process.platform
      );
    }
    return added;
  }

  _onRemoveFrom = (command: string, binding: string) => {
    const keymapPath = AppEnv.keymaps.getUserKeymapPath();
    const keymap = readUserKeymap(keymapPath);
    keymap[command] = withoutBinding(
      AppEnv.keymaps.getBindingsForCommand(command),
      binding,
      process.platform
    );
    writeUserKeymap(keymapPath, keymap);
  };

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

  /** Whether the list shows only some commands, from a search or the Show menu. */
  _isNarrowed() {
    return !!(this.state.query.trim() || this.state.keyQuery || this.state.show !== 'all');
  }

  _isShown(command: string, conflicts: Conflicts) {
    const { show, userKeymap } = this.state;
    if (show === 'changed') {
      return command in userKeymap;
    }
    if (show === 'conflicts') {
      return command in conflicts;
    }
    return true;
  }

  _visibleItems(section: { items: string[][] }, conflicts: Conflicts) {
    const { query, keyQuery, bindings } = this.state;
    return section.items.filter(
      ([command, label]) =>
        this._isShown(command, conflicts) &&
        (keyQuery
          ? runsOnKey(bindings[command], keyQuery, process.platform)
          : matchesQuery(label, bindings[command], query, process.platform))
    );
  }

  _renderSearch(conflicts: Conflicts) {
    const { query, keyQuery, findingKey, show, userKeymap } = this.state;
    const listed = displayedKeybindings.flatMap((section) => section.items.map(([c]) => c));
    const changedCount = listed.filter((c) => c in userKeymap).length;
    const conflictCount = listed.filter((c) => c in conflicts).length;
    let field: React.ReactNode;
    if (findingKey) {
      field = (
        <ShortcutRecorder
          placeholder={localized('Press the keys to look up, Esc to cancel')}
          onRecord={(key) => this.setState({ keyQuery: key, findingKey: false })}
          onCancel={() => this.setState({ findingKey: false })}
        />
      );
    } else if (keyQuery) {
      field = (
        <span className="shortcut-key-query">
          {localized('Runs on')} {renderKeystrokes(keyQuery, 0)}
          <button
            className="clear-key-query"
            title={localized('Clear')}
            onClick={() => this.setState({ keyQuery: null })}
          >
            ×
          </button>
        </span>
      );
    } else {
      field = (
        <input
          type="search"
          className="shortcut-search-input"
          placeholder={localized('Search commands or keys')}
          value={query}
          onChange={(e) => this.setState({ query: e.target.value })}
        />
      );
    }
    return (
      <Flexbox className="shortcut-search">
        {field}
        <select
          className="shortcut-show"
          value={show}
          onChange={(e) =>
            this.setState({ show: e.target.value as 'all' | 'changed' | 'conflicts' })
          }
        >
          <option value="all">{localized('Show all')}</option>
          <option value="changed">{localized('Changed (%@)', changedCount)}</option>
          <option value="conflicts">{localized('Conflicts (%@)', conflictCount)}</option>
        </select>
        <button
          className="btn find-by-key"
          disabled={findingKey}
          onClick={() => this.setState({ findingKey: true, keyQuery: null, query: '' })}
        >
          {localized('Find by key')}
        </button>
      </Flexbox>
    );
  }

  _renderBindingsSection = (
    section: { title: string; items: string[][] },
    conflicts: Conflicts,
    added: { [command: string]: string[] }
  ) => {
    const items = this._visibleItems(section, conflicts);
    if (items.length === 0) {
      return null;
    }
    return (
      <section key={`section-${section.title}`}>
        <Flexbox className="shortcut-section-title">
          <div style={{ flex: 1 }}>{section.title}</div>
          {!this._isNarrowed() && (
            <a
              className="clear-section"
              onClick={() => this._onClear(section.items.map(([command]) => command))}
            >
              {localized('Clear')}
            </a>
          )}
        </Flexbox>
        {items.map(([command, label]) => {
          return (
            <CommandItem
              key={command}
              command={command}
              label={label}
              bindings={this.state.bindings[command]}
              customized={command in this.state.userKeymap}
              added={added[command] || []}
              conflicts={Object.fromEntries(
                Object.entries(conflicts[command] || {}).map(([binding, others]) => [
                  binding,
                  others.map((other) => ({ command: other, label: LABELS[other] || other })),
                ])
              )}
              onRemoveFrom={this._onRemoveFrom}
              singleKeysOff={!this.props.config.get('core.keymapSingleKeys')}
            />
          );
        })}
      </section>
    );
  };

  render() {
    const all = AppEnv.keymaps.getBindingsForAllCommands();
    const added = this._addedBindings(all);
    const conflicts = findConflicts(all, added, process.platform);
    const conflictCount = Object.keys(added).reduce(
      (count, command) => count + added[command].filter((b) => conflicts[command]?.[b]).length,
      0
    );
    const renderSection = (section) => this._renderBindingsSection(section, conflicts, added);

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
          {conflictCount > 0 && (
            <a
              className="shortcut-conflict-count"
              onClick={() => this.setState({ show: 'conflicts', query: '', keyQuery: null })}
            >
              {conflictCount === 1
                ? localized('1 shortcut you added also runs another command.')
                : localized('%@ shortcuts you added also run other commands.', conflictCount)}
            </a>
          )}
          <label className="single-key-switch">
            <input
              type="checkbox"
              checked={!!this.props.config.get('core.keymapSingleKeys')}
              onChange={(e) => this.props.config.set('core.keymapSingleKeys', e.target.checked)}
            />
            {localized('Single-key shortcuts, like E to archive')}
          </label>
          <div className="single-key-switch-note">
            {localized(
              'Turn these off to keep keys pressed without Ctrl, Alt or Cmd from running commands, for example while dictating.'
            )}
          </div>
          {this._renderSearch(conflicts)}
          <div className="shortcut-sections">{displayedKeybindings.map(renderSection)}</div>
          {displayedKeybindings.every(
            (section) => this._visibleItems(section, conflicts).length === 0
          ) && (
            <div className="shortcut-no-matches">
              {this.state.keyQuery
                ? localized('Nothing runs on %@.', formatKeystrokes(this.state.keyQuery))
                : localized('No shortcuts match.')}
            </div>
          )}
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
