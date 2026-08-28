import React from 'react';
import { Disposable } from 'event-kit';

/*
A simple component that, when placed in the render tree, registers
a handler for a global command / shortcut.

Registering a handler for a command in the `global` scope enables the
corresponding item in the app's menu.

A changing command set is handled here rather than by the caller. The previous
advice was to pass a `key` that changes with the commands, which forces React to
discard and rebuild the subtree - fine around a toolbar button, ruinous around
anything large. The calendar wrapped its entire view in one of these and keyed it
on whether an event was selected, so every click destroyed and recreated the whole
grid: the element under the pointer was replaced between the two presses of a
double-click, and double-click stopped working at all.

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
