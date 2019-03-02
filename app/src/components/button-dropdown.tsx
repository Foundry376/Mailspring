import React, { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import RetinaImg from './retina-img';
import { PropTypes } from 'mailspring-exports';
import classnames from 'classnames';

type ButtonDropdownState = {
  open: 'up' | 'down' | false;
};

type ButtonDropdownProps = {
  bordered: boolean;
  primaryTitle?: string;
  primaryItem: React.ReactElement;
  primaryClick?: () => void;
  menu: React.ReactElement;
  style?: CSSProperties;
  closeOnMenuClick?: boolean;
  attachment?: string;
  className?: string;
};

export class ButtonDropdown extends React.Component<ButtonDropdownProps, ButtonDropdownState> {
  static displayName = 'ButtonDropdown';
  static propTypes = {
    primaryItem: PropTypes.element,
    primaryClick: PropTypes.func,
    bordered: PropTypes.bool,
    menu: PropTypes.element,
    style: PropTypes.object,
    closeOnMenuClick: PropTypes.bool,
    attachment: PropTypes.string,
  };

  static defaultProps = {
    style: {},
    attachment: 'left',
  };

  constructor(props) {
    super(props);
    this.state = { open: false };
  }

  render() {
    const classes = classnames({
      'button-dropdown': true,
      'open open-up': this.state.open === 'up',
      'open open-down': this.state.open === 'down',
      bordered: this.props.bordered !== false,
    });

    const menu = this.state.open ? this.props.menu : false;

    if (this.props.primaryClick) {
      return (
        <div
          ref="button"
          onBlur={this._onBlur}
          tabIndex={-1}
          className={`${classes} ${this.props.className || ''}`}
          style={this.props.style}
        >
          <div
            className="primary-item"
            title={this.props.primaryTitle || ''}
            onClick={this.props.primaryClick}
          >
            {this.props.primaryItem}
          </div>
          <div className="secondary-picker" onClick={this.toggleDropdown}>
            <RetinaImg name={'icon-thread-disclosure.png'} mode={RetinaImg.Mode.ContentIsMask} />
          </div>
          <div className="secondary-items" onMouseDown={this._onMenuClick}>
            {menu}
          </div>
        </div>
      );
    } else {
      return (
        <div
          ref="button"
          onBlur={this._onBlur}
          tabIndex={-1}
          className={`${classes} ${this.props.className || ''}`}
          style={this.props.style}
        >
          <div
            className="only-item"
            title={this.props.primaryTitle || ''}
            onClick={this.toggleDropdown}
          >
            {this.props.primaryItem}
            <RetinaImg
              name={'icon-thread-disclosure.png'}
              style={{ marginLeft: 12 }}
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </div>
          <div
            className={`secondary-items ${this.props.attachment}`}
            onMouseDown={this._onMenuClick}
          >
            {menu}
          </div>
        </div>
      );
    }
  }

  toggleDropdown = () => {
    if (this.state.open !== false) {
      this.setState({ open: false });
    } else {
      const buttonBottom = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect()
        .bottom;
      if (buttonBottom + 200 > window.innerHeight) {
        this.setState({ open: 'up' });
      } else {
        this.setState({ open: 'down' });
      }
    }
  };

  _onMenuClick = event => {
    if (this.props.closeOnMenuClick) {
      this.setState({ open: false });
    }
  };

  _onBlur = event => {
    const target = event.nativeEvent.relatedTarget;
    if (target != null && ReactDOM.findDOMNode(this.refs.button).contains(target)) {
      return;
    }
    this.setState({ open: false });
  };
}
