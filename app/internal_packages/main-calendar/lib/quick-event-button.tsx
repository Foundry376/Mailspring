import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { NewItemButton, BindGlobalCommands } from 'mailspring-component-kit';
import { QuickEventPopover } from './quick-event-popover';

export class QuickEventButton extends React.Component<Record<string, unknown>> {
  static displayName = 'QuickEventButton';

  _button = React.createRef<HTMLButtonElement>();

  _openPopover = () => {
    const button = this._button.current;
    if (!button) return;
    Actions.openPopover(<QuickEventPopover />, {
      originRect: button.getBoundingClientRect(),
      direction: 'down',
    });
  };

  onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    this._openPopover();
  };

  render() {
    return (
      <BindGlobalCommands commands={{ 'core:add-item': this._openPopover }}>
        <NewItemButton
          buttonRef={this._button}
          tabIndex={-1}
          label={localized('New Event')}
          onClick={this.onClick}
        />
      </BindGlobalCommands>
    );
  }
}
