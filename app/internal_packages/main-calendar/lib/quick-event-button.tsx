import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';
import { QuickEventPopover } from './quick-event-popover';

interface QuickEventButtonState {
  /** Icon only, when the sidebar's toolbar has no room for the label. */
  compact: boolean;
}

export class QuickEventButton extends React.Component<
  Record<string, unknown>,
  QuickEventButtonState
> {
  static displayName = 'QuickEventButton';

  state: QuickEventButtonState = { compact: false };

  _button = React.createRef<HTMLButtonElement>();
  _labelledWidth = 0;
  _observer?: ResizeObserver;

  componentDidMount() {
    const row = this._button.current?.parentElement;
    if (!row) return;
    this._observer = new ResizeObserver(this._fit);
    this._observer.observe(row);
  }

  componentWillUnmount() {
    this._observer?.disconnect();
  }

  // Measured rather than set at a width, since the label's length varies by language. The row's
  // spare room is whatever its flexible spacers took.
  _fit = () => {
    const button = this._button.current;
    const row = button?.parentElement;
    if (!button || !row) return;
    if (this.state.compact) {
      const spare = Array.from(row.querySelectorAll<HTMLElement>(':scope > .item-spacer')).reduce(
        (sum, spacer) => sum + spacer.offsetWidth,
        0
      );
      if (spare >= this._labelledWidth - button.offsetWidth) this.setState({ compact: false });
    } else if (row.scrollWidth > row.clientWidth) {
      this._labelledWidth = button.offsetWidth;
      this.setState({ compact: true });
    }
  };

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
    const label = localized('New Event');
    const { compact } = this.state;
    return (
      <BindGlobalCommands commands={{ 'core:add-item': this._openPopover }}>
        <button
          ref={this._button}
          tabIndex={-1}
          className="btn item-compose quick-event-button"
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          title={compact ? label : undefined}
          aria-label={compact ? label : undefined}
          onClick={this.onClick}
        >
          <RetinaImg
            name="toolbar-compose.png"
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
          {!compact && <span className="text">{label}</span>}
        </button>
      </BindGlobalCommands>
    );
  }
}
