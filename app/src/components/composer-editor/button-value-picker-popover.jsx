import React from 'react';

export default class ButtonValuePickerPopover extends React.Component {
  static displayName = 'ButtonValuePickerPopover';

  constructor(props) {
    super(props);
    this.state = {
      value: ''
    };
  }

  onChange = e => {
    this.setState({ value: e.target.value });
  };
  onConfirm = e => {
    e.preventDefault();
    if (this.props.onConfirm) {
      this.props.onConfirm(this.state.value);
    }
  };

  componentDidMount() {
    this.setState({ value: this.props.value });
    setTimeout(() => {
      if (this._inputEl) {
        this._inputEl.focus();
        this._inputEl.select();
      }
    });
  }

  render() {
    return (
      <div className="RichEditor-toolbar" style={{ width: 210, height: 44 }} tabIndex="-1">
        <div className="link-picker">
          <div className="dropdown">
            <input
              type="text"
              ref={el => (this._inputEl = el)}
              placeholder={this.props.config.placeholder}
              value={this.state.value}
              onBlur={this.props.onBlur}
              onChange={this.onChange}
              onKeyDown={e => {
                if (e.which === 13) {
                  this.onConfirm(e);
                }
              }}
            />
            <button onMouseDown={this.onConfirm}>{this.props.active ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    );
  }
}
