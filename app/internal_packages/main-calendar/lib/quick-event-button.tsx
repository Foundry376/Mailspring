import React from 'react';
import ReactDOM from 'react-dom';
import { Actions } from 'mailspring-exports';
import { QuickEventPopover } from './quick-event-popover';

export class QuickEventButton extends React.Component<Record<string, unknown>> {
  static displayName = 'QuickEventButton';

  onClick = event => {
    event.stopPropagation();
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(<QuickEventPopover />, { originRect: buttonRect, direction: 'down' });
  };

  render() {
    return (
      <button
        style={{ order: -50 }}
        tabIndex={-1}
        className="btn btn-toolbar"
        onClick={this.onClick}
      >
        +
      </button>
    );
  }
}
