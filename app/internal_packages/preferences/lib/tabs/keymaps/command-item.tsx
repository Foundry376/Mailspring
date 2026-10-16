import React from 'react';
import { Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import {
  readUserKeymap,
  writeUserKeymap,
  withBinding,
  withoutBinding,
  pressedKeys,
} from './user-keymap';
import { renderKeystrokes } from './keystrokes';
import { ShortcutRecorder } from './shortcut-recorder';

interface CommandKeybindingProps {
  bindings: string[];
  label: string;
  command: string;
  /** Whether the user keymap sets this command's keys, so it can be reset to the template's. */
  customized: boolean;
  /** The keys the user added to this command, beyond its default keys. */
  added: string[];
  /** For each of this command's keys that another command also runs on, those commands. */
  conflicts: { [binding: string]: { command: string; label: string }[] };
  onRemoveFrom: (command: string, binding: string) => void;
}
interface CommandKeybindingState {
  recording: boolean;
}

export default class CommandKeybinding extends React.Component<
  CommandKeybindingProps,
  CommandKeybindingState
> {
  _addButtonRef = React.createRef<HTMLButtonElement>();

  constructor(props) {
    super(props);
    this.state = { recording: false };
  }

  _onStartRecording = () => {
    this.setState({ recording: true });
  };

  // Focus goes back to the + button: left on the body, the next key would reach the mail list.
  _stopRecording = ({ refocus }: { refocus: boolean }) => {
    this.setState({ recording: false }, () => {
      if (refocus) {
        this._addButtonRef.current.focus();
      }
    });
  };

  /** Writes this command's keys to the user keymap, or removes its entry when given null. */
  _saveBindings(bindings: string[] | null) {
    const keymapPath = AppEnv.keymaps.getUserKeymapPath();
    const keymap = readUserKeymap(keymapPath);
    if (bindings) {
      keymap[this.props.command] = bindings;
    } else {
      delete keymap[this.props.command];
    }
    try {
      writeUserKeymap(keymapPath, keymap);
    } catch (err) {
      AppEnv.showErrorDialog(
        localized(`Mailspring was unable to modify your keymaps at %@.`, keymapPath) +
          ' ' +
          err.toString()
      );
    }
  }

  _onRecord = (binding: string) => {
    this._saveBindings(withBinding(this.props.bindings, binding));
    this._stopRecording({ refocus: true });
  };

  _onRemove = (binding: string) => {
    this._saveBindings(withoutBinding(this.props.bindings, binding, process.platform));
  };

  _onReset = () => {
    this._saveBindings(null);
  };

  // Shown on the command the key was added to, which is the change the user can take back.
  _renderConflict = (binding: string) => {
    const others = this.props.conflicts[binding];
    const names = others.map((o) => o.label).join(', ');
    return (
      <div key={binding} className="shortcut-conflict">
        {renderKeystrokes(binding, 0)} {localized('also runs %@.', names)}{' '}
        <a
          className="remove-from-others"
          onClick={() => others.forEach((o) => this.props.onRemoveFrom(o.command, binding))}
        >
          {localized('Remove from %@', names)}
        </a>{' '}
        <a className="remove-here" onClick={() => this._onRemove(binding)}>
          {localized('Remove here')}
        </a>
      </div>
    );
  };

  render() {
    const { recording } = this.state;
    const { bindings, customized, added, conflicts } = this.props;

    let value: React.ReactChild | React.ReactChild[] = localized('None');
    if (bindings.length > 0) {
      // Templates may list mod+a and ctrl+a for one command; they are the same key
      // on Windows and Linux, so dedupe by what the user would actually press.
      const byKey = new Map(bindings.map((b) => [pressedKeys(b, process.platform), b]));
      value = [...byKey.values()].map((binding, idx) => (
        <span
          key={binding}
          className={conflicts[binding] ? 'shortcut-chip conflict' : 'shortcut-chip'}
          title={
            conflicts[binding]
              ? localized('Also runs %@', conflicts[binding].map((o) => o.label).join(', '))
              : undefined
          }
        >
          {renderKeystrokes(binding, idx)}
          <button
            className="remove-shortcut"
            title={localized('Remove')}
            onClick={() => this._onRemove(binding)}
          >
            ×
          </button>
        </span>
      ));
    }

    return (
      <Flexbox className={recording ? 'shortcut recording' : 'shortcut'}>
        <div className="col-left">
          {customized && (
            <span className="changed-dot" title={localized('Changed from the default')} />
          )}
          <span className="shortcut-name">{this.props.label}</span>
        </div>
        <div className="col-right">
          <div className="values">{value}</div>
          {recording ? (
            <ShortcutRecorder
              placeholder={localized('Press a shortcut, Esc to cancel')}
              onRecord={this._onRecord}
              onCancel={this._stopRecording}
            />
          ) : (
            <button
              className="btn btn-small add-shortcut"
              ref={this._addButtonRef}
              title={localized('Add a shortcut')}
              onClick={this._onStartRecording}
            >
              + {localized('Add')}
            </button>
          )}
          {customized && !recording && (
            <a className="reset-shortcut" onClick={this._onReset}>
              {localized('Reset')}
            </a>
          )}
          {added.filter((binding) => conflicts[binding]).map(this._renderConflict)}
        </div>
      </Flexbox>
    );
  }
}
