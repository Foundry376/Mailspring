const RetinaImg = require('./retina-img').default;
const { React, ReactDOM, PropTypes } = require('mailspring-exports');
const classnames = require('classnames');

class ButtonDropdown extends React.Component {
  static displayName = 'ButtonDropdown';
  static propTypes = {
    primaryItem: PropTypes.element,
    primaryClick: PropTypes.func,
    bordered: PropTypes.bool,
    menu: PropTypes.element,
    style: PropTypes.object,
    closeOnMenuClick: PropTypes.bool,
    attachment: PropTypes.string,
    disabled: PropTypes.bool,
  };

  static defaultProps = {
    style: {},
    attachment: 'left',
    disabled: false,
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

    const style = {};
    if (this.state.open === 'up') {
      style.bottom = 0;
      style.top = 'auto';
    } else {
      style.top = 0;
      style.bottom = 'auto';
    }

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
            onClick={!this.props.disabled ? this.props.primaryClick : null}
          >
            {this.props.primaryItem}
          </div>
          <div className="secondary-picker" onClick={this.toggleDropdown}>
            <RetinaImg
              name={'more.svg'}
              isIcon
              style={{ width: 24, height: 24 }}
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </div>
          <div className="secondary-items" onMouseDown={this._onMenuClick} style={style}>
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
              name={'arrow-dropdown.svg'}
              isIcon
              style={{ width: 24, height: 24 }}
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </div>
          <div
            className={`secondary-items ${this.props.attachment}`}
            onMouseDown={this._onMenuClick}
            style={style}
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
    } else if (!this.props.disabled) {
      const buttonBottom = ReactDOM.findDOMNode(this).getBoundingClientRect().bottom;
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

module.exports = ButtonDropdown;
