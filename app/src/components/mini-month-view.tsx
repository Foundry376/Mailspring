import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import {
  CalendarDate,
  calendarDateFromParts,
  dayStartUnix,
  monthShownFrom,
  onDayChange,
} from '../calendar-date';
import { SnapScroller, SnapScrollTarget } from './snap-scroller';

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
  scrollTarget: SnapScrollTarget;
}

function monthStartDate(m: Moment): CalendarDate {
  return calendarDateFromParts(m.year(), m.month() + 1, 1);
}

export class MiniMonthView extends React.Component<MiniMonthViewProps, MiniMonthViewState> {
  static displayName = 'MiniMonthView';

  static defaultProps = { orientation: 'horizontal' };

  private _dayChange?: { dispose(): void };
  private _scroller = React.createRef<SnapScroller>();

  constructor(props) {
    super(props);
    this.state = {
      ...this._stateFromProps(props),
      scrollTarget: { date: monthStartDate(props.value), animate: false },
    };
  }

  componentDidMount() {
    // Moves the `today` highlight at midnight without a remount.
    this._dayChange = onDayChange((today) =>
      this.setState({ today: moment.unix(dayStartUnix(today)) })
    );
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
    this._dayChange?.dispose();
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

  _onClickDay = (event: React.MouseEvent) => {
    if (event.target instanceof HTMLElement && event.target.dataset.unix) {
      this.props.onChange(moment(Number(event.target.dataset.unix)));
    }
  };

  _monthShownFrom(topWeek: CalendarDate) {
    return moment.unix(dayStartUnix(monthShownFrom(topWeek, VISIBLE_WEEKS)));
  }

  _onTopWeekChange = (topWeek: CalendarDate) => {
    const month = this._monthShownFrom(topWeek);
    if (month.year() !== this.state.shownYear || month.month() !== this.state.shownMonth) {
      this.setState({ shownYear: month.year(), shownMonth: month.month() });
    }
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
      <SnapScroller
        ref={this._scroller}
        className="day-grid"
        axis="vertical"
        unit="week"
        visibleUnits={VISIBLE_WEEKS}
        scrollTarget={this.state.scrollTarget}
        renderUnits={(weekStarts) =>
          weekStarts.map((start) =>
            this._renderWeek(moment.unix(dayStartUnix(start)), month.month(), start)
          )
        }
        onFirstVisibleChange={this._onTopWeekChange}
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
        const target = this._monthShownFrom(this._scroller.current.headedTo()).add(delta, 'months');
        this.setState({ scrollTarget: { date: monthStartDate(target), animate: true } });
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
