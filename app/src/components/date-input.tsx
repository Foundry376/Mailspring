/* eslint jsx-a11y/tabindex-no-positive: 0 */
import classnames from 'classnames';
import React, { Component } from 'react';
import { localized, DateUtils } from 'mailspring-exports';
import PropTypes from 'prop-types';

type DateInputProps = {
  className?: string;
  dateFormat: string;
  onDateInterpreted?: (...args: any[]) => any;
  onDateSubmitted?: (...args: any[]) => any;
};
type DateInputState = { inputValue: string; inputDate: null } & any;

class DateInput extends Component<DateInputProps, DateInputState> {
  static displayName = 'DateInput';

  static propTypes = {
    className: PropTypes.string,
    dateFormat: PropTypes.string.isRequired,
    onDateInterpreted: PropTypes.func,
    onDateSubmitted: PropTypes.func,
  };

  static defaultProps = {
    onDateInterpreted: () => {},
    onDateSubmitted: () => {},
  };

  _mounted: boolean = false;

  constructor(props) {
    super(props);
    this.state = props.initialTestState || {
      inputDate: null,
      inputValue: '',
    };
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  onInputKeyDown = event => {
    const { key, target: { value } } = event;
    if (value.length > 0 && ['Enter', 'Return'].includes(key)) {
      // This prevents onInputChange from being fired
      event.stopPropagation();
      const date = DateUtils.futureDateFromString(value);
      this.props.onDateSubmitted(date, value);
    }
  };

  onInputChange = event => {
    const { target: { value } } = event;
    const nextDate = DateUtils.futureDateFromString(value);
    if (nextDate) {
      this.props.onDateInterpreted(nextDate.clone(), value);
    }
    this.setState({ inputDate: nextDate, inputValue: value });
  };

  clearInput() {
    setImmediate(() => {
      if (!this._mounted) {
        return;
      }
      this.setState({ inputValue: '', inputDate: null });
    });
  }

  render() {
    const { className } = this.props;
    const { inputDate, inputValue } = this.state;
    const classes = classnames({
      'nylas-date-input': true,
      [className]: className != null,
    });
    const formatted = (
      <span className="date-interpretation">
        {DateUtils.format(this.state.inputDate, this.props.dateFormat)}
      </span>
    );
    const dateInterpretation = inputDate ? formatted : <span />;

    return (
      <div className={classes}>
        <input
          tabIndex={1}
          type="text"
          value={inputValue}
          placeholder={localized("Or, 'next Monday at 2PM'")}
          onKeyDown={this.onInputKeyDown}
          onChange={this.onInputChange}
        />
        {dateInterpretation}
      </div>
    );
  }
}

export default DateInput;
