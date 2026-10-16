import React from 'react';
import moment from 'moment';
import classnames from 'classnames';
import {
  CalendarDate,
  addCalendarDays,
  calendarDateFromParts,
  calendarDaysBetween,
} from '../calendar-date';

/** Further than this, a scroll jumps rather than animating through every row between. */
const MAX_SMOOTH_WEEKS = 8;

const MS_PER_DAY = 86400000;

function dayOfWeek(date: CalendarDate) {
  // Epoch day 0, 1970-01-01, was a Thursday.
  return (((date + 4) % 7) + 7) % 7;
}

/** The first day of the locale's week holding `date`, matching `moment().startOf('week')`. */
function weekStartOf(date: CalendarDate): CalendarDate {
  const firstDay = moment.localeData().firstDayOfWeek();
  return addCalendarDays(date, -((dayOfWeek(date) - firstDay + 7) % 7));
}

function monthStartOf(date: CalendarDate): CalendarDate {
  const d = new Date(date * MS_PER_DAY);
  return calendarDateFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
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
  /** Glide there when it's nearby. A reveal jumps, so what it opens measures where it lands. */
  animate: boolean;
}

interface WeekScrollerProps {
  className?: string;
  /** Rows that fill the viewport; each takes that share of its height. */
  visibleWeeks: number;
  /** The week holding `date` becomes the top row on mount, and whenever a new target is passed. */
  scrollTarget: WeekScrollTarget;
  /** One row per week start, in order. */
  renderWeeks: (weekStarts: CalendarDate[]) => React.ReactNode[];
  onTopWeekChange?: (topWeek: CalendarDate) => void;
  /** Once a scroll, the user's or a target's, comes to rest. */
  onScrollEnd?: (topWeek: CalendarDate) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface WeekScrollerState {
  scrollTarget: WeekScrollTarget;
  topIndex: number;
  rowHeight: number;
  pendingScroll: { index: number; smooth: boolean } | null;
}

/**
 * The top spacer, which also settles the scroll. As the scroller's first child it commits before
 * the rows, so a row that reveals itself as it mounts (a searched-for event opening its card)
 * measures where the scroll leaves it rather than where it was.
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

  /**
   * The month a title over the rows names: the one holding the middle day. Six rows aligned on a
   * month's first week always put the middle day between its 16th and 22nd.
   */
  static monthShownFrom(topWeek: CalendarDate, visibleWeeks: number): CalendarDate {
    return monthStartOf(addCalendarDays(topWeek, Math.floor((visibleWeeks * 7) / 2)));
  }

  /** A viewport's worth on each side of the visible rows, so a fling doesn't outrun rendering. */
  static weeksDrawnFrom(topWeek: CalendarDate, visibleWeeks: number) {
    return {
      first: addCalendarDays(topWeek, -7 * visibleWeeks),
      count: visibleWeeks * 3,
    };
  }

  static getDerivedStateFromProps(
    props: WeekScrollerProps,
    state: WeekScrollerState
  ): Partial<WeekScrollerState> | null {
    const target = props.scrollTarget;
    if (target === state.scrollTarget) return null;
    const index = indexOf(target.date, props.visibleWeeks);
    const smooth =
      target.animate && state.rowHeight > 0 && Math.abs(index - state.topIndex) <= MAX_SMOOTH_WEEKS;
    return {
      scrollTarget: target,
      pendingScroll: { index, smooth },
      // A jump draws the destination's rows now, so it doesn't paint an empty viewport.
      topIndex: smooth ? state.topIndex : index,
    };
  }

  _el = React.createRef<HTMLDivElement>();
  _resizeObserver?: ResizeObserver;
  _appliedScroll: WeekScrollerState['pendingScroll'] = null;
  _reportedIndex: number;

  constructor(props: WeekScrollerProps) {
    super(props);
    const topIndex = indexOf(props.scrollTarget.date, props.visibleWeeks);
    this.state = {
      scrollTarget: props.scrollTarget,
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
    this._el.current?.removeEventListener('scrollend', this._onScrollEnd);
    this._resizeObserver?.disconnect();
  }

  _scrolledIndex() {
    const el = this._el.current;
    const { rowHeight, topIndex } = this.state;
    return el && rowHeight ? Math.round(el.scrollTop / rowHeight) : topIndex;
  }

  _reportTop(index: number) {
    if (index === this._reportedIndex) return;
    this._reportedIndex = index;
    this.props.onTopWeekChange?.(weekStartAt(index));
  }

  _measure = () => {
    const el = this._el.current;
    if (!el) return;
    const rowHeight = el.clientHeight / this.props.visibleWeeks;
    if (rowHeight === this.state.rowHeight) return;
    // Rows change height with the viewport, so hold the same week at the top.
    this.setState((state) => ({
      rowHeight,
      pendingScroll:
        state.pendingScroll !== this._appliedScroll
          ? state.pendingScroll
          : { index: state.topIndex, smooth: false },
    }));
  };

  _onCommit = () => {
    this._reportTop(this.state.topIndex);
    const el = this._el.current;
    const { pendingScroll, rowHeight } = this.state;
    if (!el || !rowHeight || pendingScroll === this._appliedScroll) return;
    this._appliedScroll = pendingScroll;
    const { index, smooth } = pendingScroll;
    el.scrollTo({ top: index * rowHeight, behavior: smooth ? 'smooth' : 'instant' });
  };

  _onScroll = () => {
    const index = this._scrolledIndex();
    if (index !== this.state.topIndex) {
      this.setState({ topIndex: index });
    }
  };

  _onScrollEnd = () => {
    this.props.onScrollEnd?.(weekStartAt(this._scrolledIndex()));
  };

  render() {
    const { className, visibleWeeks, renderWeeks, onClick } = this.props;
    const { topIndex, rowHeight } = this.state;
    const drawn = WeekScroller.weeksDrawnFrom(weekStartAt(topIndex), visibleWeeks);
    const drawnIndex = calendarDaysBetween(firstWeek(), drawn.first) / 7;
    const firstIndex = Math.max(0, drawnIndex);
    const lastIndex = Math.min(weekCount(), drawnIndex + drawn.count);

    const weekStarts: CalendarDate[] = [];
    for (let i = firstIndex; i < lastIndex; i++) {
      weekStarts.push(weekStartAt(i));
    }
    const rows = renderWeeks(weekStarts);

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
