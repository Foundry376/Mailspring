import React from 'react';
import ReactDOM from 'react-dom';
import { Actions, localized } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';
import { QuickEventPopover } from './quick-event-popover';

export class QuickEventButton extends React.Component<Record<string, unknown>> {
  static displayName = 'QuickEventButton';

  _openPopover = () => {
    const el = ReactDOM.findDOMNode(this) as HTMLElement;
    if (!el) return;
    const buttonRect = el.getBoundingClientRect();
    Actions.openPopover(<QuickEventPopover />, { originRect: buttonRect, direction: 'down' });
  };

  onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    this._openPopover();
  };

  render() {
    return (
      <BindGlobalCommands commands={{ 'core:add-item': this._openPopover }}>
        <button
          style={{ order: -50 }}
          tabIndex={-1}
          className="btn btn-toolbar item-compose"
          title={localized('Create new event')}
          aria-label={localized('Create new event')}
          onClick={this.onClick}
        >
          <RetinaImg name="toolbar-compose.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
        </button>
      </BindGlobalCommands>
    );
  }
}
