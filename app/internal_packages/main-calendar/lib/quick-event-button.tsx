import React from 'react';
import ReactDOM from 'react-dom';
import { Actions, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
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
        className="btn btn-toolbar item-compose"
        title={localized('Create new event')}
        onClick={this.onClick}
      >
        <RetinaImg name="toolbar-compose.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
