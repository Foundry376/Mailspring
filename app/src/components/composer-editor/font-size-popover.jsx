import React from 'react';

export default class FontSizePopover extends React.Component {
  static displayName = 'FontSizePopover';

  constructor(props) {
    super(props);
  }

  onSelect = (value) => {
    if (this.props.onSelect) {
      this.props.onSelect(value);
    }
  };

  renderOptions() {
    return this.props.options.map(option => {
      let className = `option ${option.name.toLowerCase()} `;
      if (this.props.selectedValue === option.value) {
        className += 'selected';
      }
      return <div key={option.value} className={className}
                  onClick={this.onSelect.bind(this, option.value)}>{option.name}</div>;
    });
  }

  render() {
    return (
      <div className="font-size-popover" tabIndex="-1">
        {this.renderOptions()}
      </div>
    );
  }
}
