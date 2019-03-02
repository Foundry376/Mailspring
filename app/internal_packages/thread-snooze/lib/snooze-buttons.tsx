import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { Actions, FocusedPerspectiveStore, Thread } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';
import SnoozePopover from './snooze-popover';

interface SnoozeButtonProps {
  className: string;
  threads: Thread[];
  direction: string;
  shouldRenderIconImg: boolean;
  getBoundingClientRect: (inst: any) => ClientRect;
}

class SnoozeButton extends Component<SnoozeButtonProps> {
  static propTypes = {
    className: PropTypes.string,
    threads: PropTypes.array,
    direction: PropTypes.string,
    shouldRenderIconImg: PropTypes.bool,
    getBoundingClientRect: PropTypes.func,
  };

  static defaultProps = {
    className: 'btn btn-toolbar',
    direction: 'down',
    shouldRenderIconImg: true,
    getBoundingClientRect: inst =>
      (ReactDOM.findDOMNode(inst) as HTMLElement).getBoundingClientRect(),
  };

  onClick = (event?: React.MouseEvent<any>) => {
    if (event) {
      event.stopPropagation();
    }
    const { threads, direction, getBoundingClientRect } = this.props;
    const buttonRect = getBoundingClientRect(this);
    Actions.openPopover(<SnoozePopover threads={threads} />, {
      originRect: buttonRect,
      direction: direction,
    });
  };

  render() {
    return (
      <button
        title="Snooze"
        tabIndex={-1}
        className={`snooze-button ${this.props.className}`}
        onClick={this.onClick}
      >
        {this.props.shouldRenderIconImg ? (
          <RetinaImg name="toolbar-snooze.png" mode={RetinaImg.Mode.ContentIsMask} />
        ) : null}
      </button>
    );
  }
}

export class QuickActionSnooze extends Component<{ thread: Thread }> {
  static displayName = 'QuickActionSnooze';

  static propTypes = {
    thread: PropTypes.object,
  };

  static containerRequired = false;

  getBoundingClientRect = () => {
    // Grab the parent node because of the zoom applied to this button. If we
    // took this element directly, we'd have to divide everything by 2
    const element = ReactDOM.findDOMNode(this).parentNode as HTMLElement;
    const { height, width, top, bottom, left, right } = element.getBoundingClientRect();

    // The parent node is a bit too much to the left, lets adjust this.
    return { height, width, top, bottom, right, left: left + 5 };
  };

  render() {
    if (!FocusedPerspectiveStore.current().isInbox()) {
      return <span />;
    }
    return (
      <SnoozeButton
        direction="left"
        threads={[this.props.thread]}
        className="btn action action-snooze"
        shouldRenderIconImg={false}
        getBoundingClientRect={this.getBoundingClientRect}
      />
    );
  }
}

export class ToolbarSnooze extends Component<{ items: Thread[] }> {
  static displayName = 'ToolbarSnooze';

  static propTypes = {
    items: PropTypes.array,
  };

  static containerRequired = false;

  _btn: SnoozeButton;

  render() {
    if (!FocusedPerspectiveStore.current().isInbox()) {
      return <span />;
    }
    return (
      <BindGlobalCommands commands={{ 'core:snooze-item': () => this._btn.onClick() }}>
        <SnoozeButton threads={this.props.items} ref={b => (this._btn = b)} />
      </BindGlobalCommands>
    );
  }
}
