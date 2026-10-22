import React from 'react';
import classnames from 'classnames';
import { RetinaImg } from './retina-img';

interface LabelledToolbarButtonProps {
  label: string;
  iconName: string;
  className?: string;
  /** Tooltip and accessible name at every width; otherwise the label, once only the icon shows. */
  title?: string;
  tabIndex?: number;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** For callers that need the button itself, e.g. to anchor a popover. */
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

interface LabelledToolbarButtonState {
  /** Icon only, when the toolbar has no room for the label. */
  compact: boolean;
}

/*
Public: A toolbar button with an icon and a label, which shows only the icon when its toolbar
row runs out of room.

Section: Component Kit
*/
export default class LabelledToolbarButton extends React.Component<
  LabelledToolbarButtonProps,
  LabelledToolbarButtonState
> {
  static displayName = 'LabelledToolbarButton';

  state: LabelledToolbarButtonState = { compact: false };

  _button = this.props.buttonRef || React.createRef<HTMLButtonElement>();
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

  render() {
    const { label, iconName, className, tabIndex, onClick } = this.props;
    const { compact } = this.state;
    const title = this.props.title || (compact ? label : undefined);
    return (
      <button
        ref={this._button}
        tabIndex={tabIndex}
        className={classnames('btn btn-toolbar', className)}
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        title={title}
        aria-label={title}
        onClick={onClick}
      >
        <RetinaImg name={iconName} mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
        {!compact && <span className="text">{label}</span>}
      </button>
    );
  }
}
