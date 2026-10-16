import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import { CalendarDate, calendarDateFromParts, dayStartUnix } from '../calendar-date';
import { WeekScroller, WeekScrollTarget } from './week-scroller';

const VISIBLE_WEEKS = 6;

const CHEVRONS = {
  horizontal: { width: 8, height: 12, previous: 'M7 1L2 6l5 5', next: 'M1 1l5 5-5 5' },
  vertical: { width: 12, height: 8, previous: 'M1 7l5-5 5 5', next: 'M1 1l5 5 5-5' },
};

interface MiniMonthViewProps {
  value: Moment;
  onChange: (moment: Moment) => void;
  /** Horizontal pages a month at a time; vertical scrolls through weeks continuously. */
  orientation?: 'horizontal' | 'vertical';
}

interface MiniMonthViewState {
  shownYear: number;
  shownMonth: number;
  today: Moment;
  scrollTarget: WeekScrollTarget;
}

function monthStartDate(m: Moment): CalendarDate {
  return calendarDateFromParts(m.year(), m.month() + 1, 1);
}

export class MiniMonthView extends React.Component<MiniMonthViewProps, MiniMonthViewState> {
  static displayName = 'MiniMonthView';

  static defaultProps = { orientation: 'horizontal' };

  private _todayTimer?: number;
  private _glideMonth: Moment | null = null;

  constructor(props) {
    super(props);
    this.state = {
      ...this._stateFromProps(props),
      scrollTarget: { date: monthStartDate(props.value), animate: false },
    };
  }

  componentDidMount() {
    this._scheduleTodayRefresh();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  componentDidUpdate(prevProps: MiniMonthViewProps) {
    if (prevProps.value.isSame(this.props.value)) {
      return;
    }
    if (this.props.orientation === 'vertical') {
      // The title follows the scroll there; setting it now would flash the destination first.
      this.setState({
        scrollTarget: { date: monthStartDate(this.props.value), animate: true },
        today: moment().startOf('day'),
      });
    } else {
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

  _onClickDay = (event: React.MouseEvent) => {
    if (event.target instanceof HTMLElement && event.target.dataset.unix) {
      this.props.onChange(moment(Number(event.target.dataset.unix)));
    }
  };

  _onTopWeekChange = (topWeek: CalendarDate) => {
    const month = moment.unix(dayStartUnix(WeekScroller.monthShownFrom(topWeek, VISIBLE_WEEKS)));
    if (month.year() !== this.state.shownYear || month.month() !== this.state.shownMonth) {
      this.setState({ shownYear: month.year(), shownMonth: month.month() });
    }
  };

  _onScrollEnd = () => {
    this._glideMonth = null;
  };

  _renderChevron(direction: 'previous' | 'next') {
    const chevron = CHEVRONS[this.props.orientation];
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

  _renderScrollingDays(month: Moment) {
    return (
      <WeekScroller
        className="day-grid"
        visibleWeeks={VISIBLE_WEEKS}
        scrollTarget={this.state.scrollTarget}
        renderWeeks={(weekStarts) =>
          weekStarts.map((start) =>
            this._renderWeek(moment.unix(dayStartUnix(start)), month.month(), start)
          )
        }
        onTopWeekChange={this._onTopWeekChange}
        onScrollEnd={this._onScrollEnd}
        onClick={this._onClickDay}
      />
    );
  }

  render() {
    const vertical = this.props.orientation === 'vertical';
    const weekdayGen = moment(this.state.shownYear);
    const month = moment([this.state.shownYear, this.state.shownMonth]);

    const onChangeMonth = (delta: number) => {
      if (vertical) {
        this._glideMonth = (this._glideMonth || month).clone().add(delta, 'months');
        this.setState({ scrollTarget: { date: monthStartDate(this._glideMonth), animate: true } });
      } else {
        const next = month.clone().add(delta, 'months');
        this.setState({ shownYear: next.year(), shownMonth: next.month() });
      }
    };

    return (
      <div className={classnames('mini-month-view', { vertical })}>
        <div className="header">
          <div className="btn btn-icon" onClick={() => onChangeMonth(-1)}>
            {this._renderChevron('previous')}
          </div>
          <span className="month-title">{month.format('MMMM YYYY')}</span>
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
        {vertical ? this._renderScrollingDays(month) : this._renderDays(month)}
      </div>
    );
  }
}
