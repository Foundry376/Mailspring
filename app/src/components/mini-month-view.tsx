import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';

interface MiniMonthViewProps {
  value: Moment;
  onChange: (moment: Moment) => void;
}

interface MiniMonthViewState {
  shownYear: number;
  shownMonth: number;
  today: Moment;
}

export class MiniMonthView extends React.Component<MiniMonthViewProps, MiniMonthViewState> {
  static displayName = 'MiniMonthView';

  private _todayTimer?: number;

  constructor(props) {
    super(props);
    this.state = this._stateFromProps(props);
  }

  componentDidMount() {
    this._scheduleTodayRefresh();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  componentDidUpdate(prevProps: MiniMonthViewProps) {
    if (!prevProps.value.isSame(this.props.value)) {
      this.setState(this._stateFromProps(this.props));
    }
  }

  componentWillUnmount() {
    if (this._todayTimer !== undefined) window.clearTimeout(this._todayTimer);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  _stateFromProps(props: MiniMonthViewProps) {
    return {
      shownYear: props.value.year(),
      shownMonth: props.value.month(),
      today: moment().startOf('day'),
    };
  }

  _refreshToday = (now = moment()) => {
    const today = now.clone().startOf('day');
    if (!today.isSame(this.state.today, 'day')) {
      this.setState({ today });
    }
    this._scheduleTodayRefresh(now);
  };

  // Wake shortly after local midnight so the `today` highlight moves without a
  // remount. The extra second keeps a timer that fires slightly early from
  // landing on the same day and scheduling a second near-zero wait.
  _scheduleTodayRefresh(now = moment()) {
    if (this._todayTimer !== undefined) window.clearTimeout(this._todayTimer);
    const nextDay = now.clone().add(1, 'day').startOf('day');
    const delay = Math.max(1000, nextDay.diff(now) + 1000);
    this._todayTimer = window.setTimeout(this._refreshToday, delay);
  }

  _onVisibilityChange = () => {
    if (!document.hidden) this._refreshToday();
  };

  _isSameDay(m1: Moment, m2: Moment) {
    return m1.dayOfYear() === m2.dayOfYear() && m1.year() === m2.year();
  }

  _renderDays(month: Moment) {
    const curMonthNumber = month.month();

    // Start from the beginning of the week that contains the 1st of the month
    const dayIter = month.clone().date(1).startOf('week');

    // Always render 6 weeks for consistent height
    const weekEls = [];
    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
      const dayEls = [];
      for (let weekday = 0; weekday < 7; weekday++) {
        const dayStr = dayIter.format('D');
        const className = classnames({
          day: true,
          today: this._isSameDay(dayIter, this.state.today),
          'cur-day': this._isSameDay(dayIter, this.props.value),
          'cur-month': dayIter.month() === curMonthNumber,
        });
        dayEls.push(
          <div className={className} key={`${weekIndex}-${weekday}`} data-unix={dayIter.valueOf()}>
            {dayStr}
          </div>
        );
        dayIter.add(1, 'day');
      }
      weekEls.push(
        <div className="week" key={weekIndex}>
          {dayEls}
        </div>
      );
    }
    return (
      <div
        className="day-grid"
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.dataset.unix) {
            this.props.onChange(moment(Number(event.target.dataset.unix)));
          }
        }}
      >
        {weekEls}
      </div>
    );
  }

  render() {
    const weekdayGen = moment(this.state.shownYear);
    const month = moment([this.state.shownYear, this.state.shownMonth]);

    const onChangeMonth = (delta: number) => {
      const next = month.clone().add(delta, 'months');
      this.setState({ shownYear: next.year(), shownMonth: next.month() });
    };

    return (
      <div className="mini-month-view">
        <div className="header">
          <div className="btn btn-icon" onClick={() => onChangeMonth(-1)}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
              <path
                d="M7 1L2 6l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="month-title">{month.format('MMMM YYYY')}</span>
          <div className="btn btn-icon" onClick={() => onChangeMonth(1)}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
              <path
                d="M1 1l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="legend">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="weekday">
              {weekdayGen.weekday(i).format('dd')}
            </span>
          ))}
        </div>
        {this._renderDays(month)}
      </div>
    );
  }
}
