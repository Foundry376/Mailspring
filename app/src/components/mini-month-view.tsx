import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import { calendarDateFromUnix, dayStartUnix, onDayChange } from '../calendar-date';

const VISIBLE_WEEKS = 6;

const CHEVRONS = {
  horizontal: { width: 8, height: 12, previous: 'M7 1L2 6l5 5', next: 'M1 1l5 5-5 5' },
  vertical: { width: 12, height: 8, previous: 'M1 7l5-5 5 5', next: 'M1 1l5 5 5-5' },
};

interface MiniMonthViewProps {
  value: Moment;
  onChange: (moment: Moment) => void;
  /** Which way the month arrows point. Either way, they page a month at a time. */
  arrows?: 'horizontal' | 'vertical';
}

interface MiniMonthViewState {
  shownYear: number;
  shownMonth: number;
  today: Moment;
  /** "Sep 2026", when the full month name doesn't fit beside the arrows. */
  shortTitle: boolean;
}

export class MiniMonthView extends React.Component<MiniMonthViewProps, MiniMonthViewState> {
  static displayName = 'MiniMonthView';

  static defaultProps = { arrows: 'horizontal' };

  private _dayChange?: { dispose(): void };
  private _title = React.createRef<HTMLSpanElement>();
  private _fullTitle = React.createRef<HTMLSpanElement>();
  private _titleObserver?: ResizeObserver;

  constructor(props) {
    super(props);
    this.state = {
      ...this._stateFromProps(props),
      shortTitle: false,
    };
  }

  componentDidMount() {
    this._dayChange = onDayChange(calendarDateFromUnix(this.state.today.unix()), (today) =>
      this.setState({ today: moment.unix(dayStartUnix(today)) })
    );
    this._titleObserver = new ResizeObserver(this._fitTitle);
    this._titleObserver.observe(this._title.current);
  }

  componentDidUpdate(prevProps: MiniMonthViewProps, prevState: MiniMonthViewState) {
    if (
      prevState.shownMonth !== this.state.shownMonth ||
      prevState.shownYear !== this.state.shownYear
    ) {
      this._fitTitle();
    }
    if (!prevProps.value.isSame(this.props.value)) {
      this.setState(this._stateFromProps(this.props));
    }
  }

  componentWillUnmount() {
    this._dayChange?.dispose();
    this._titleObserver?.disconnect();
  }

  _stateFromProps(props: MiniMonthViewProps) {
    return {
      shownYear: props.value.year(),
      shownMonth: props.value.month(),
      today: moment().startOf('day'),
    };
  }

  _isSameDay(m1: Moment, m2: Moment) {
    return m1.dayOfYear() === m2.dayOfYear() && m1.year() === m2.year();
  }

  // Measured, since month names vary in length by month and by language.
  _fitTitle = () => {
    const title = this._title.current;
    const fullTitle = this._fullTitle.current;
    if (!title || !fullTitle) return;
    const shortTitle = fullTitle.offsetWidth > title.clientWidth;
    if (shortTitle !== this.state.shortTitle) this.setState({ shortTitle });
  };

  _onClickDay = (event: React.MouseEvent) => {
    if (event.target instanceof HTMLElement && event.target.dataset.unix) {
      this.props.onChange(moment(Number(event.target.dataset.unix)));
    }
  };

  _renderChevron(direction: 'previous' | 'next') {
    const chevron = CHEVRONS[this.props.arrows];
    return (
      <svg
        width={chevron.width}
        height={chevron.height}
        viewBox={`0 0 ${chevron.width} ${chevron.height}`}
        fill="none"
      >
        <path
          d={chevron[direction]}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  _renderWeek(weekStart: Moment, curMonthNumber: number, key: React.Key) {
    const dayIter = weekStart.clone();
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
        <div className={className} key={weekday} data-unix={dayIter.valueOf()}>
          {dayStr}
        </div>
      );
      dayIter.add(1, 'day');
    }
    return (
      <div className="week" key={key}>
        {dayEls}
      </div>
    );
  }

  _renderDays(month: Moment) {
    // Start from the beginning of the week that contains the 1st of the month
    const weekStart = month.clone().date(1).startOf('week');

    // Always render 6 weeks for consistent height
    const weekEls = [];
    for (let weekIndex = 0; weekIndex < VISIBLE_WEEKS; weekIndex++) {
      weekEls.push(
        this._renderWeek(weekStart.clone().add(weekIndex, 'weeks'), month.month(), weekIndex)
      );
    }
    return (
      <div className="day-grid" onClick={this._onClickDay}>
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
          <span className="month-title" ref={this._title}>
            {month.format(this.state.shortTitle ? 'MMM YYYY' : 'MMMM YYYY')}
          </span>
          <span className="month-title-measure" ref={this._fullTitle} aria-hidden="true">
            {month.format('MMMM YYYY')}
          </span>
          <div className="btn btn-icon" onClick={() => onChangeMonth(-1)}>
            {this._renderChevron('previous')}
          </div>
          <div className="btn btn-icon" onClick={() => onChangeMonth(1)}>
            {this._renderChevron('next')}
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
