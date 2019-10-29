import classnames from 'classnames';
import { React, PropTypes } from 'mailspring-exports';
import RetinaImg from './retina-img';

export default class InputSearch extends React.Component {
  static displayName = 'ButtonDropdown';
  static propTypes = {
    className: PropTypes.string,
    showPreIcon: PropTypes.bool,
    showClearIcon: PropTypes.bool,
    onChange: PropTypes.func,
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    placeholder: PropTypes.string,
    height: PropTypes.number,
  };

  constructor() {
    super();
    this.state = {
      value: '',
    };
    this._input = null;
  }

  _fieldElFocus() {
    if (this._input) {
      this._input.focus();
    }
  }

  _clearInput() {
    this.setState({ value: '' }, () => this._fieldElFocus());
  }

  _onChange = event => {
    const inputValue = event.target.value;
    this.setState({ value: inputValue });
    if (this.props.onChange && typeof this.props.onChange === 'function') {
      this.props.onChange(inputValue);
    }
  };

  render() {
    const {
      className,
      height = 26,
      showPreIcon,
      showClearIcon,
      onFocus,
      onBlur,
      placeholder,
    } = this.props;
    const { value } = this.state;
    const classes = classnames({
      'nylas-input-search': true,
      [className]: className != null,
    });
    return (
      <div className={classes} style={{ height: height, borderRadius: `${height / 5}px` }}>
        {showPreIcon ? (
          <RetinaImg
            isIcon
            name="search.svg"
            className="search-accessory search"
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ height: height / 1.3, width: height / 1.3 }}
            onClick={() => this._fieldElFocus()}
          />
        ) : null}
        <input
          value={value}
          ref={el => (this._input = el)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          onChange={this._onChange}
        />
        {showClearIcon && value.length ? (
          <RetinaImg
            isIcon
            name="close.svg"
            className="search-accessory clear"
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ width: (height / 1.3) * 0.75, height: (height / 1.3) * 0.75 }}
            onClick={() => this._clearInput()}
          />
        ) : null}
      </div>
    );
  }
}
