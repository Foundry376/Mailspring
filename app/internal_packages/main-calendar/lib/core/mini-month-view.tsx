import _ from 'underscore';
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
}

export class MiniMonthView extends React.Component<MiniMonthViewProps, MiniMonthViewState> {
  static displayName = 'MiniMonthView';

  today = moment();

  constructor(props) {
    super(props);
    this.state = this._stateFromProps(props);
  }

  componentWillReceiveProps(newProps) {
    this.setState(this._stateFromProps(newProps));
  }

  _stateFromProps(props: MiniMonthViewProps) {
    return {
      shownYear: props.value.year(),
      shownMonth: props.value.month(),
    };
  }

  _isSameDay(m1: Moment, m2: Moment) {
    return m1.dayOfYear() === m2.dayOfYear() && m1.year() === m2.year();
  }

  _renderDays(month: Moment) {
    const curMonthNumber = month.month();

    const dayIter = month.clone().date(1);
    const startWeek = dayIter.week();
    const endWeek = moment(dayIter)
      .date(dayIter.daysInMonth())
      .week();

    const weekEls = [];
    for (let week = startWeek; week <= endWeek; week++) {
      dayIter.week(week); // Locale aware!
      const dayEls = [];
      for (let weekday = 0; weekday < 7; weekday++) {
        dayIter.weekday(weekday); // Locale aware!
        const dayStr = dayIter.format('D');
        const className = classnames({
          day: true,
          today: this._isSameDay(dayIter, this.today),
          'cur-day': this._isSameDay(dayIter, this.props.value),
          'cur-month': dayIter.month() === curMonthNumber,
        });
        dayEls.push(
          <div className={className} key={`${week}-${weekday}`} data-unix={dayIter.valueOf()}>
            {dayStr}
          </div>
        );
      }
      weekEls.push(
        <div className="week" key={week}>
          {dayEls}
        </div>
      );
    }
    return (
      <div
        className="day-grid"
        onClick={event => {
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
            &lsaquo;
          </div>
          <span className="month-title">{month.format('MMMM YYYY')}</span>
          <div className="btn btn-icon" onClick={() => onChangeMonth(1)}>
            &rsaquo;
          </div>
        </div>
        <div className="legend">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
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
