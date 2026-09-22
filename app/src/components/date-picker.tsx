import moment, { Moment } from 'moment';
import classnames from 'classnames';
import React from 'react';
import { DateUtils } from 'mailspring-exports';
import { MiniMonthView, TabGroupContext } from 'mailspring-component-kit';

type DatePickerProps = {
  value?: number;
  onChange?: (ms: number) => void;
};
type DatePickerState = {
  focused: boolean;
};

export class DatePicker extends React.Component<DatePickerProps, DatePickerState> {
  static displayName = 'DatePicker';

  static contextType = TabGroupContext;
  context!: React.ContextType<typeof TabGroupContext>;

  static defaultProps = {
    onChange: () => {},
  };

  constructor(props) {
    super(props);
    this.state = { focused: false };
  }

  value() {
    return this.props.value ? moment(this.props.value) : null;
  }

  _onChange(newMoment: Moment) {
    this.props.onChange(newMoment.valueOf());
  }

  // Both ways of changing the day go through here so they cannot disagree about the clock
  // time: the arrow keys always kept it, the mini month used to replace it with midnight.
  _changeDay(day: Moment) {
    const val = this.value();
    if (!val) {
      this._onChange(day);
      return;
    }
    this._onChange(val.year(day.year()).dayOfYear(day.dayOfYear()));
  }

  _moveDay(numDays) {
    this._changeDay(moment(this.props.value).add(numDays, 'days'));
  }

  _onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      this._moveDay(-1);
    } else if (event.key === 'ArrowRight') {
      this._moveDay(1);
    } else if (event.key === 'ArrowUp') {
      this._moveDay(-7);
    } else if (event.key === 'ArrowDown') {
      this._moveDay(7);
    } else if (event.key === 'Enter') {
      this.context?.shiftFocus(1);
    }
  };

  _onFocus = () => {
    this.setState({ focused: true });
  };

  _onBlur = () => {
    this.setState({ focused: false });
  };

  _onSelectDay = (newTimestamp) => {
    this._changeDay(moment(newTimestamp));
    this.context?.shiftFocus(1);
  };

  _renderMiniMonthView() {
    if (this.state.focused) {
      return (
        <div className="mini-month-view-wrap">
          <MiniMonthView onChange={this._onSelectDay} value={this.value()} />
        </div>
      );
    }
    return false;
  }

  render() {
    const className = classnames({
      'day-text': true,
      focused: this.state.focused,
    });

    const val = this.value();
    let dayTxt = 'Click to set date';
    if (val) {
      dayTxt = this.value().format(DateUtils.DATE_FORMAT_llll_NO_TIME);
    }

    return (
      <div
        tabIndex={0}
        className="date-picker"
        onKeyDown={this._onKeyDown}
        onFocus={this._onFocus}
        onBlur={this._onBlur}
      >
        <div className={className}>{dayTxt}</div>
        {this._renderMiniMonthView()}
      </div>
    );
  }
}
