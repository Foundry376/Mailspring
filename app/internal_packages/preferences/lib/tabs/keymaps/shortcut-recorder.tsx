import React from 'react';

import { keyAndModifiersForEvent } from './mousetrap-keybinding-helpers';
import { bindingFromKeys } from './user-keymap';
import { renderKeystrokes } from './keystrokes';

// Mousetrap waits this long for the next key of a sequence (_resetSequenceTimer in mousetrap.js),
// so a plain key recorded alone is the same key the keymap will later wait for.
const SEQUENCE_TIMEOUT_MS = 1000;

interface ShortcutRecorderProps {
  placeholder: string;
  onRecord: (binding: string) => void;
  /** `refocus` is false when focus has already moved elsewhere. */
  onCancel: (options: { refocus: boolean }) => void;
}

interface ShortcutRecorderState {
  modifiers: string[];
  keys: string[];
}

/**
 * Takes focus and records the next shortcut pressed. Every keymap is suspended while it is
 * mounted, so the keys reach nothing but the recorder.
 */
export class ShortcutRecorder extends React.Component<
  ShortcutRecorderProps,
  ShortcutRecorderState
> {
  _ref = React.createRef<HTMLSpanElement>();
  _sequenceTimer: NodeJS.Timeout = null;

  state = { modifiers: [], keys: [] };

  componentDidMount() {
    AppEnv.keymaps.suspendAllKeymaps();
    this._ref.current.focus();
  }

  componentWillUnmount() {
    clearTimeout(this._sequenceTimer);
    AppEnv.keymaps.resumeAllKeymaps();
  }

  _finish = () => {
    const { keys, modifiers } = this.state;
    this.props.onRecord(bindingFromKeys(keys, modifiers, process.platform));
  };

  _onBlur = () => {
    this.props.onCancel({ refocus: false });
  };

  _onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const [eventKey, eventMods] = keyAndModifiersForEvent(event);
    if (!eventKey || ['mod', 'meta', 'command', 'ctrl', 'alt', 'shift'].includes(eventKey)) {
      return;
    }
    if (eventKey === 'esc') {
      this.props.onCancel({ refocus: true });
      return;
    }

    const keys = [...this.state.keys, eventKey];
    const modifiers = [...new Set([...this.state.modifiers, ...eventMods])];
    this.setState({ keys, modifiers }, () => {
      if (modifiers.length > 0 || keys.length >= 2) {
        this._finish();
      } else {
        this._sequenceTimer = setTimeout(this._finish, SEQUENCE_TIMEOUT_MS);
      }
    });
  };

  render() {
    const { keys, modifiers } = this.state;
    return (
      <span
        className="shortcut-recorder"
        ref={this._ref}
        tabIndex={-1}
        onKeyDown={this._onKeyDown}
        onBlur={this._onBlur}
      >
        {keys.length > 0
          ? renderKeystrokes(bindingFromKeys(keys, modifiers, process.platform), 0)
          : this.props.placeholder}
      </span>
    );
  }
}
