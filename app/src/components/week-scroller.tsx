import React from 'react';
import moment from 'moment';
import classnames from 'classnames';
import {
  CalendarDate,
  addCalendarDays,
  calendarDateFromParts,
  calendarDaysBetween,
  dayOfWeek,
  monthStartOf,
} from '../calendar-date';

const MAX_SMOOTH_WEEKS = 8;

/** The first day of the locale's week holding `date`, matching `moment().startOf('week')`. */
function weekStartOf(date: CalendarDate): CalendarDate {
  const firstDay = moment.localeData().firstDayOfWeek();
  return addCalendarDays(date, -((dayOfWeek(date) - firstDay + 7) % 7));
}

// Read per call rather than at module load, so the locale's first day of the week is already set.
function firstWeek() {
  return weekStartOf(calendarDateFromParts(1900, 1, 1));
}

function weekCount() {
  return Math.ceil(calendarDaysBetween(firstWeek(), calendarDateFromParts(2100, 1, 1)) / 7);
}

function weekStartAt(index: number) {
  return addCalendarDays(firstWeek(), index * 7);
}

function indexOf(date: CalendarDate, visibleWeeks: number) {
  const index = Math.floor(calendarDaysBetween(firstWeek(), date) / 7);
  return Math.max(0, Math.min(index, weekCount() - visibleWeeks));
}

export interface WeekScrollTarget {
  date: CalendarDate;
  animate: boolean;
}

interface WeekScrollerProps {
  className?: string;
  visibleWeeks: number;
  /** The week holding `date` becomes the top row on mount, and whenever a new target is passed. */
  scrollTarget: WeekScrollTarget;
  renderWeeks: (weekStarts: CalendarDate[], topWeek: CalendarDate) => React.ReactNode[];
  onTopWeekChange: (topWeek: CalendarDate) => void;
  onScrollEnd?: (topWeek: CalendarDate) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface WeekScrollerState {
  prevScrollTarget: WeekScrollTarget;
  topIndex: number;
  rowHeight: number;
  pendingScroll: { index: number; smooth: boolean } | null;
}

/**
 * The top spacer, which also settles the scroll. As the first child it commits before the rows,
 * so a row that reveals itself as it mounts measures where the scroll lands, not where it was.
 */
class TopSpacer extends React.Component<{ height: number; onCommit: () => void }> {
  componentDidMount() {
    this.props.onCommit();
  }

  componentDidUpdate() {
    this.props.onCommit();
  }

  render() {
    return <div style={{ height: this.props.height }} />;
  }
}

/**
 * Weeks as one continuous list that scrolls vertically and comes to rest on a week edge. Only the
 * rows near the viewport are drawn; spacers stand in for the rest of 1900–2099.
 */
export class WeekScroller extends React.Component<WeekScrollerProps, WeekScrollerState> {
  static displayName = 'WeekScroller';

  static monthShownFrom(topWeek: CalendarDate, visibleWeeks: number): CalendarDate {
    const middleDay = addCalendarDays(topWeek, Math.floor((visibleWeeks * 7) / 2));
    return monthStartOf(middleDay);
  }

  static weeksDrawnFrom(topWeek: CalendarDate, visibleWeeks: number) {
    const overscan = visibleWeeks;
    return {
      first: addCalendarDays(topWeek, -7 * overscan),
      count: visibleWeeks + 2 * overscan,
    };
  }

  static getDerivedStateFromProps(
    props: WeekScrollerProps,
    state: WeekScrollerState
  ): Partial<WeekScrollerState> | null {
    const target = props.scrollTarget;
    if (target === state.prevScrollTarget) return null;
    const index = indexOf(target.date, props.visibleWeeks);
    const smooth =
      target.animate && state.rowHeight > 0 && Math.abs(index - state.topIndex) <= MAX_SMOOTH_WEEKS;
    return {
      prevScrollTarget: target,
      pendingScroll: { index, smooth },
      // A jump draws the destination's rows now, so it doesn't paint an empty viewport.
      topIndex: smooth ? state.topIndex : index,
    };
  }

  _el = React.createRef<HTMLDivElement>();
  _resizeObserver: ResizeObserver;
  _appliedScroll: WeekScrollerState['pendingScroll'] = null;
  _glideIndex: number | null = null;
  _reportedIndex: number;

  constructor(props: WeekScrollerProps) {
    super(props);
    const topIndex = indexOf(props.scrollTarget.date, props.visibleWeeks);
    this.state = {
      prevScrollTarget: props.scrollTarget,
      topIndex,
      rowHeight: 0,
      pendingScroll: { index: topIndex, smooth: false },
    };
    this._reportedIndex = topIndex;
  }

  componentDidMount() {
    const el = this._el.current;
    el.addEventListener('scrollend', this._onScrollEnd);
    this._resizeObserver = new ResizeObserver(this._measure);
    this._resizeObserver.observe(el);
    this._measure();
  }

  componentWillUnmount() {
    this._el.current.removeEventListener('scrollend', this._onScrollEnd);
    this._resizeObserver.disconnect();
  }

  _scrolledIndex() {
    const { rowHeight, topIndex } = this.state;
    return rowHeight ? Math.round(this._el.current.scrollTop / rowHeight) : topIndex;
  }

  _reportTop(index: number) {
    if (index === this._reportedIndex) return;
    this._reportedIndex = index;
    this.props.onTopWeekChange(weekStartAt(index));
  }

  _measure = () => {
    const rowHeight = this._el.current.clientHeight / this.props.visibleWeeks;
    if (rowHeight === this.state.rowHeight) return;
    // Snapping holds a resting row in place as rows change height, but a glide is headed for a
    // pixel offset worked out at the old height, so land it on its week instead.
    this.setState((state) => ({
      rowHeight,
      pendingScroll:
        this._glideIndex === null
          ? state.pendingScroll
          : { index: this._glideIndex, smooth: false },
    }));
  };

  _onCommit = () => {
    this._reportTop(this.state.topIndex);
    const el = this._el.current;
    const { pendingScroll, rowHeight } = this.state;
    if (!el || !rowHeight || pendingScroll === this._appliedScroll) return;
    this._appliedScroll = pendingScroll;
    const { index, smooth } = pendingScroll;
    this._glideIndex = smooth ? index : null;
    el.scrollTo({ top: index * rowHeight, behavior: smooth ? 'smooth' : 'instant' });
  };

  _onScroll = () => {
    const index = this._scrolledIndex();
    if (index !== this.state.topIndex) {
      this.setState({ topIndex: index });
    }
  };

  _onScrollEnd = () => {
    this._glideIndex = null;
    this.props.onScrollEnd?.(weekStartAt(this._scrolledIndex()));
  };

  render() {
    const { className, visibleWeeks, renderWeeks, onClick } = this.props;
    const { topIndex, rowHeight } = this.state;
    const topWeek = weekStartAt(topIndex);
    const drawn = WeekScroller.weeksDrawnFrom(topWeek, visibleWeeks);
    const drawnIndex = calendarDaysBetween(firstWeek(), drawn.first) / 7;
    const firstIndex = Math.max(0, drawnIndex);
    const lastIndex = Math.min(weekCount(), drawnIndex + drawn.count);

    const weekStarts: CalendarDate[] = [];
    for (let i = firstIndex; i < lastIndex; i++) {
      weekStarts.push(weekStartAt(i));
    }
    const rows = renderWeeks(weekStarts, topWeek);

    return (
      <div
        ref={this._el}
        className={classnames('week-scroller', className)}
        onScroll={this._onScroll}
        onClick={onClick}
      >
        <TopSpacer height={firstIndex * rowHeight} onCommit={this._onCommit} />
        {rows.map((row, i) => (
          <div key={firstIndex + i} className="week-scroller-row" style={{ height: rowHeight }}>
            {row}
          </div>
        ))}
        <div style={{ height: (weekCount() - lastIndex) * rowHeight }} />
      </div>
    );
  }
}
