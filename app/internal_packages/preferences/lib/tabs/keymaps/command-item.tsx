import React from 'react';
import { Flexbox } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';

import { keyAndModifiersForEvent } from './mousetrap-keybinding-helpers';
import { readUserKeymap, writeUserKeymap, bindingFromKeys, withBinding } from './user-keymap';

// Mousetrap waits this long for the next key of a sequence (_resetSequenceTimer in mousetrap.js),
// so a plain key recorded alone is the same key the keymap will later wait for.
const SEQUENCE_TIMEOUT_MS = 1000;

interface CommandKeybindingProps {
  bindings: string[];
  label: string;
  command: string;
}
interface CommandKeybindingState {
  recording: boolean;
  modifiers: string[];
  keys: string[];
}

export default class CommandKeybinding extends React.Component<
  CommandKeybindingProps,
  CommandKeybindingState
> {
  _recorderRef = React.createRef<HTMLSpanElement>();
  _addButtonRef = React.createRef<HTMLButtonElement>();
  _sequenceTimer: NodeJS.Timeout = null;

  constructor(props) {
    super(props);

    this.state = {
      recording: false,
      modifiers: [],
      keys: [],
    };
  }

  componentWillUnmount() {
    if (this.state.recording) {
      clearTimeout(this._sequenceTimer);
      AppEnv.keymaps.resumeAllKeymaps();
    }
  }

  _formatKeystrokes(original: string) {
    // macOS shows menu-bar glyphs (⌘⇧D); Windows and Linux spell shortcuts out
    // (Ctrl+Shift+D), and their users don't read ^ or ⌥ as modifier keys.
    const isMac = process.platform === 'darwin';
    const modifiers: [RegExp, string][] = isMac
      ? [
          [/\+(?!$)/gi, ''],
          [/command/gi, '⌘'],
          [/meta/gi, '⌘'],
          [/alt/gi, '⌥'],
          [/shift/gi, '⇧'],
          [/ctrl/gi, '^'],
          [/mod/gi, '⌘'],
        ]
      : [
          [/alt/gi, 'Alt'],
          [/shift/gi, 'Shift'],
          [/ctrl/gi, 'Ctrl'],
          [/mod/gi, 'Ctrl'],
        ];
    let clean = original;
    for (const [regexp, char] of modifiers) {
      clean = clean.replace(regexp, char);
    }

    if (isMac) {
      // ⌘⇧c => ⌘⇧C
      if (clean !== original) {
        clean = clean.toUpperCase();
      }
      // backspace => Backspace
      if (original.length > 1 && clean === original) {
        clean = clean[0].toUpperCase() + clean.slice(1);
      }
      return clean;
    }

    // ctrl+shift+d => Ctrl+Shift+D, alt+backspace => Alt+Backspace
    return clean
      .split('+')
      .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
      .join('+');
  }

  _renderKeystrokes = (keystrokes: string, idx: number) => {
    const elements = [];
    const splitKeystrokes = keystrokes.split(' ');
    splitKeystrokes.forEach((keystroke, kidx) => {
      elements.push(<span key={kidx}>{this._formatKeystrokes(keystroke)}</span>);
      if (kidx < splitKeystrokes.length - 1) {
        elements.push(
          <span className="then" key={`then${kidx}`}>
            {` ${localized('then')} `}
          </span>
        );
      }
    });
    return (
      <span key={`keystrokes-${idx}`} className="shortcut-value">
        {elements}
      </span>
    );
  };

  // Keymaps are suspended while recording, so the keys pressed reach nothing but the recorder.
  _onStartRecording = () => {
    AppEnv.keymaps.suspendAllKeymaps();
    this.setState({ recording: true, keys: [], modifiers: [] }, () =>
      this._recorderRef.current.focus()
    );
  };

  // Focus goes back to the + button: left on the body, the next key would reach the mail list.
  _stopRecording({ refocus }: { refocus: boolean }) {
    clearTimeout(this._sequenceTimer);
    AppEnv.keymaps.resumeAllKeymaps();
    this.setState({ recording: false, keys: [], modifiers: [] }, () => {
      if (refocus) {
        this._addButtonRef.current.focus();
      }
    });
  }

  _onRecorderBlur = () => {
    if (this.state.recording) {
      this._stopRecording({ refocus: false });
    }
  };

  _onFinishRecording = () => {
    const { keys, modifiers } = this.state;
    const binding = bindingFromKeys(keys, modifiers, process.platform);
    const keymapPath = AppEnv.keymaps.getUserKeymapPath();
    const keymap = readUserKeymap(keymapPath);
    keymap[this.props.command] = withBinding(this.props.bindings, binding);
    try {
      writeUserKeymap(keymapPath, keymap);
    } catch (err) {
      AppEnv.showErrorDialog(
        localized(`Mailspring was unable to modify your keymaps at %@.`, keymapPath) +
          ' ' +
          err.toString()
      );
    }
    this._stopRecording({ refocus: true });
  };

  _onRecorderKey = (event: React.KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const [eventKey, eventMods] = keyAndModifiersForEvent(event);
    if (!eventKey || ['mod', 'meta', 'command', 'ctrl', 'alt', 'shift'].includes(eventKey)) {
      return;
    }
    if (eventKey === 'esc') {
      this._stopRecording({ refocus: true });
      return;
    }

    const keys = [...this.state.keys, eventKey];
    const modifiers = [...new Set([...this.state.modifiers, ...eventMods])];
    this.setState({ keys, modifiers }, () => {
      if (modifiers.length > 0 || keys.length >= 2) {
        this._onFinishRecording();
      } else {
        this._sequenceTimer = setTimeout(this._onFinishRecording, SEQUENCE_TIMEOUT_MS);
      }
    });
  };

  _renderRecorder() {
    const { keys, modifiers } = this.state;
    return (
      <span
        className="shortcut-recorder"
        ref={this._recorderRef}
        tabIndex={-1}
        onKeyDown={this._onRecorderKey}
        onBlur={this._onRecorderBlur}
      >
        {keys.length > 0
          ? this._renderKeystrokes(bindingFromKeys(keys, modifiers, process.platform), 0)
          : localized('Press a shortcut, Esc to cancel')}
      </span>
    );
  }

  render() {
    const { recording } = this.state;
    const { bindings } = this.props;

    let value: React.ReactChild | React.ReactChild[] = 'None';
    if (bindings.length > 0) {
      // Templates may list mod+a and ctrl+a for one command; they are the same key
      // on Windows and Linux, so dedupe by what the user would actually press.
      const mod = process.platform === 'darwin' ? 'command' : 'ctrl';
      const byKey = new Map(bindings.map((b) => [b.replace(/\bmod\b/g, mod), b]));
      value = [...byKey.values()].map(this._renderKeystrokes);
    }

    return (
      <Flexbox className={recording ? 'shortcut recording' : 'shortcut'}>
        <div className="col-left shortcut-name">{this.props.label}</div>
        <div className="col-right">
          <div className="values">{value}</div>
          {recording ? (
            this._renderRecorder()
          ) : (
            <button
              className="btn btn-small add-shortcut"
              ref={this._addButtonRef}
              title={localized('Add a shortcut')}
              onClick={this._onStartRecording}
            >
              +
            </button>
          )}
        </div>
      </Flexbox>
    );
  }
}
