import _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Disposable } from 'rx-core';

interface KeyCommandsRegionProps {
  children: React.ReactNode;
  tabIndex?: number;
  className?: string;
  localHandlers?: object;
  globalHandlers?: object;
  onFocusIn?: (...args: any[]) => any;
  onFocusOut?: (...args: any[]) => any;
}
interface KeyCommandsRegionState {
  focused: boolean;
}

/*
Public: Easily respond to keyboard shortcuts

A keyboard shortcut has two parts to it:

1. A mapping between keyboard actions and a command
2. A mapping between a command and a callback handler


#// Mapping keys to commands (not handled by this component)

The **keyboard -> command** mapping is defined in a separate `.cson` file.
A majority of the commands your component would want to listen to you have
already been defined by core Mailspring defaults, as well as custom user
overrides. See 'keymaps/base.cson' for more information.

You can define additional, custom keyboard -> command mappings in your own
package-specific keymap `.cson` file. The file can be named anything but
must exist in a folder called `keymaps` in the root of your package's
directory.


#// Mapping commands to callbacks (handled by this component)

When a keystroke sequence matches a binding in a given context, a custom
DOM event with a type based on the command is dispatched on the target of
the keyboard event.

That custom DOM event (whose type is the command you want to listen to)
will propagate up from its original target. That original target may or
may not be a descendent of your <KeyCommandsRegion> component.

Frequently components will want to listen to a keyboard command regardless
of where it was fired from. For those, use the `globalHandlers` prop. The
DOM event will NOT be passed to `globalHandlers` callbacks.

Components may also want to listen to keyboard commands that originate
within one of their descendents. For those use the `localHandlers` prop.
The DOM event WILL be passed to `localHandlers` callback because it is
sometimes valuable to call `stopPropagataion` on the custom command event.

Props:

- `localHandlers` A mapping between key commands and callbacks for key command events that originate within a descendent of this component.
- `globalHandlers` A mapping between key commands and callbacks for key
commands that originate from anywhere and are global in scope.
- `className` The unique class name that shows up in your keymap.cson

Example:

In `my-package/lib/my-component.jsx`:

```js
class MyComponent extends React.Component {
  render() {
    return (
      <KeyCommandsRegion
        globalHandlers={{
          "core:moveDown": this.onMoveDown
          "core:selectItem": this.onSelectItem
        }}
        className="my-component"
      >
        <div>... sweet component ...</div>
      </KeyCommandsRegion>
    );
  }
}
```

In `my-package/keymaps/my-package.cson`:

```js
".my-component":
  "command+t": "selectItem"
  "command+enter": "sendMessage"
```
*/
export class KeyCommandsRegion extends React.Component<
  KeyCommandsRegionProps,
  KeyCommandsRegionState
> {
  static displayName = 'KeyCommandsRegion';

  static propTypes = {
    className: PropTypes.string,
    localHandlers: PropTypes.object,
    globalHandlers: PropTypes.object,
    onFocusIn: PropTypes.func,
    onFocusOut: PropTypes.func,
  };

  static defaultProps = {
    className: '',
    localHandlers: null,
    globalHandlers: null,
    onFocusIn: () => {},
    onFocusOut: () => {},
  };

  _lastFocusElement: HTMLElement = null;
  _losingFocusToElement: HTMLElement = null;
  _losingFocusFrames: number = 0;
  _lostFocusToElement: HTMLElement = null;
  _localDisposable?: Disposable;
  _globalDisposable?: Disposable;
  _goingout: boolean = false;

  state = {
    focused: false,
  };

  componentDidMount() {
    this._setupListeners(this.props);

    const el = ReactDOM.findDOMNode(this);
    if (el && document.activeElement && el.contains(document.activeElement)) {
      this.setState({ focused: true });
    }
  }

  componentWillReceiveProps(newProps) {
    if (
      newProps.localHandlers !== this.props.localHandlers ||
      newProps.globalHandlers !== this.props.globalHandlers
    ) {
      this._unmountListeners();
      this._setupListeners(newProps);
    }
  }

  componentWillUnmount() {
    this._losingFocusToElement = null;
    this._unmountListeners();
  }

  // When the {KeymapManager} finds a valid keymap in a `.cson` file, it
  // will create a CustomEvent with the command name as its type. That
  // custom event will be fired at the originating target and propogate
  // updwards until it reaches the root window level.

  // An event is scoped in the `.cson` files. Since we use that to
  // determine which keymappings can fire a particular command in a
  // particular scope, we simply need to listen at the root window level
  // here for all commands coming in.
  _setupListeners({
    localHandlers,
    globalHandlers,
  }: { localHandlers?: any; globalHandlers?: any } = {}) {
    const $el = ReactDOM.findDOMNode(this) as Element;
    $el.addEventListener('focusin', this._onFocusIn);
    $el.addEventListener('focusout', this._onFocusOut);

    if (globalHandlers) {
      this._globalDisposable = AppEnv.commands.add(document.body, globalHandlers);
    }
    if (localHandlers) {
      this._localDisposable = AppEnv.commands.add($el, localHandlers);
    }

    window.addEventListener('browser-window-blur', this._onWindowBlur);
  }

  _unmountListeners() {
    if (this._globalDisposable) {
      this._globalDisposable.dispose();
      this._globalDisposable = null;
    }
    if (this._localDisposable) {
      this._localDisposable.dispose();
      this._localDisposable = null;
    }
    const $el = ReactDOM.findDOMNode(this);
    $el.removeEventListener('focusin', this._onFocusIn);
    $el.removeEventListener('focusout', this._onFocusOut);
    window.removeEventListener('browser-window-blur', this._onWindowBlur);
    this._goingout = false;
  }

  _onWindowBlur = () => {
    this.setState({ focused: false });
  };

  _onFocusIn = event => {
    this._lastFocusElement = event.target;
    this._losingFocusToElement = null;
    if (this.state.focused === false) {
      this.props.onFocusIn(event);
    }
    this.setState({ focused: true });
  };

  _onFocusOut = event => {
    this._lastFocusElement = event.target;
    this._losingFocusToElement = event.relatedTarget;

    // Focus could be lost for a moment and programatically restored. To support
    // old machines with slow CPUs, it's important we wait N frames rather than X
    // msec to see if focus is restored before declaring it "out" for good.
    const attempt = () => {
      if (!this._losingFocusToElement) {
        this._losingFocusFrames = 0;
        return;
      }

      this._losingFocusFrames -= 1;
      if (this._losingFocusFrames === 0) {
        this._onDefinitelyFocusedOut();
      } else {
        window.requestAnimationFrame(attempt);
      }
    };

    if (!this._losingFocusFrames) {
      window.requestAnimationFrame(attempt);
    }
    this._losingFocusFrames = 10; // at 60fps, roughly 150ms
  };

  _onDefinitelyFocusedOut = () => {
    if (!this._losingFocusToElement) {
      return;
    }
    if (!this.state.focused) {
      return;
    }

    const sel = document.getSelection();
    const activeEl = document.activeElement;

    // This happens when component that used to have the focus is
    // unmounted. An example is the url input field of the
    // FloatingToolbar in the Composer's Contenteditable
    if (ReactDOM.findDOMNode(this).contains(activeEl)) {
      return;
    }

    // In some scenarios, focus has left an element but it is still /selected/.
    // This can be really confusing, so we guard against it here.

    // To Repro: From the composer body, click the thread list column.
    // Then keep typing. Notice how the blurred body still accepts the input.
    if (sel && sel.focusNode && !activeEl.parentElement.contains(sel.focusNode)) {
      document.getSelection().empty();
    }

    this.props.onFocusOut(this._lastFocusElement);
    this.setState({ focused: false });
    this._losingFocusToElement = null;
  };

  render() {
    const classname = classNames({
      'key-commands-region': true,
      focused: this.state.focused,
    });
    const otherProps = _.omit(this.props, Object.keys(KeyCommandsRegion.propTypes));

    return (
      <div className={`${classname} ${this.props.className}`} {...otherProps}>
        {this.props.children}
      </div>
    );
  }
}
