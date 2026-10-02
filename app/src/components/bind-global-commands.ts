import React from 'react';
import { Disposable } from 'event-kit';

/*
A simple component that, when placed in the render tree, registers
a handler for a global command / shortcut.

Registering a handler for a command in the `global` scope enables the
corresponding item in the app's menu.

Handlers are registered once as stable dispatchers that read `props` when the
command fires, so a re-render with fresh closures needs no re-binding. Only a
change to the *set* of command names re-registers, because that set is what
decides which menu items are enabled.

BG: I wrote this rather than using KeyCommandRegion because the region
class is ancient and actually creates a <div> which disrupts the toolbar
layout.
*/
export default class BindGlobalCommands extends React.Component<{
  commands: { [command: string]: () => void };
}> {
  _shortcutDisposable?: Disposable;
  _boundNames = '';

  componentDidMount() {
    this._bind();
  }

  componentDidUpdate() {
    if (this._namesOf(this.props.commands) !== this._boundNames) {
      this._bind();
    }
  }

  componentWillUnmount() {
    if (this._shortcutDisposable) {
      this._shortcutDisposable.dispose();
      this._shortcutDisposable = null;
    }
  }

  _namesOf(commands: { [command: string]: () => void }) {
    return Object.keys(commands).sort().join('\n');
  }

  _bind() {
    if (this._shortcutDisposable) {
      this._shortcutDisposable.dispose();
    }
    const dispatchers: { [command: string]: () => void } = {};
    for (const name of Object.keys(this.props.commands)) {
      // Reads the handler at call time, so the registration survives re-renders that
      // rebuild the commands object with new closures.
      dispatchers[name] = () => {
        const handler = this.props.commands[name];
        if (handler) handler();
      };
    }
    this._boundNames = this._namesOf(this.props.commands);
    this._shortcutDisposable = AppEnv.commands.add(document.body, dispatchers);
  }

  render() {
    return this.props.children;
  }
}
