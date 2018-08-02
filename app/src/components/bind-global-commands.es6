import React from 'react';

/*
A simple component that, when placed in the render tree, registers
a handler for a global command / shortcut. Note that this class does
not implement componentWillReceiveProps and assumes the provided
commands are static. Just use a `key` prop to prevent re-use if
the commands change.

Registering a handler for a command in the `global` scope enables the
corresponding item in the app's menu and also triggers the
ApplicationTouchBar to show the touch bar item (if there is one.)

BG: I wrote this rather than using KeyCommandRegion because the region
class is ancient and actually creates a <div> which disrupts the toolbar
layout.
*/
export default class BindGlobalCommands extends React.Component {
  componentDidMount() {
    this._shortcutDisposable = AppEnv.commands.add(document.body, this.props.commands);
  }

  componentWillUnmount() {
    if (this._shortcutDisposable) {
      this._shortcutDisposable.dispose();
      this._shortcutDisposable = null;
    }
  }

  render() {
    return this.props.children;
  }
}
