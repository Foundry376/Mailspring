import React from 'react';
import moment from 'moment';
import classnames from 'classnames';
import { CalendarDate, addCalendarDays, calendarDaysBetween, weekStartOf } from '../calendar-date';

type Axis = 'vertical' | 'horizontal';
type Unit = 'week' | 'day';

// Chromium caps a scroller at 2^24 px (16,777,216, measured in Electron 44), and a Day view column
// can be several thousand px wide, so a day strip spans a year each side of where it was aimed.
const RANGE_UNITS: Record<Unit, number> = { week: Math.round((15 * 365) / 7), day: 366 };

const unitDays = (unit: Unit) => (unit === 'week' ? 7 : 1);
const unitCount = (unit: Unit) => 2 * RANGE_UNITS[unit] + 1;

function unitStartOf(date: CalendarDate, unit: Unit) {
  return unit === 'week' ? weekStartOf(date, moment.localeData().firstDayOfWeek()) : date;
}

function rangeAround(date: CalendarDate, unit: Unit) {
  return addCalendarDays(unitStartOf(date, unit), -RANGE_UNITS[unit] * unitDays(unit));
}

function indexIn(rangeStart: CalendarDate, date: CalendarDate, unit: Unit) {
  return Math.floor(calendarDaysBetween(rangeStart, date) / unitDays(unit));
}

function unitStartAt(rangeStart: CalendarDate, index: number, unit: Unit) {
  return addCalendarDays(rangeStart, index * unitDays(unit));
}

/** Whether `index` can be first in view with `margin` units to spare at either end of the range. */
function withinRange(index: number, unit: Unit, visibleUnits: number, margin = 0) {
  return index >= margin && index <= unitCount(unit) - visibleUnits - margin;
}

function recenteredOn(date: CalendarDate, unit: Unit) {
  const centered = RANGE_UNITS[unit];
  return {
    rangeStart: rangeAround(date, unit),
    firstVisibleIndex: centered,
    pendingScroll: { index: centered, smooth: false },
  };
}

export interface SnapScrollTarget {
  date: CalendarDate;
  animate: boolean;
}

interface SnapScrollerProps {
  className?: string;
  axis: Axis;
  unit: Unit;
  visibleUnits: number;
  /** The unit holding `date` becomes the first in view on mount, and whenever a new target is passed. */
  scrollTarget: SnapScrollTarget;
  /**
   * Children share the strip evenly, `unitSize` px each; a single child marks its own unit edges as
   * snap points. `unitSize` is 0 until the strip has been measured.
   */
  renderUnits: (
    unitStarts: CalendarDate[],
    firstVisible: CalendarDate,
    unitSize: number
  ) => React.ReactNode;
  onFirstVisibleChange: (firstVisible: CalendarDate) => void;
  onScrollEnd?: (firstVisible: CalendarDate) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface SnapScrollerState {
  prevScrollTarget: SnapScrollTarget;
  rangeStart: CalendarDate;
  firstVisibleIndex: number;
  unitSize: number;
  pendingScroll: { index: number; smooth: boolean } | null;
}

/**
 * The leading spacer, which also settles the scroll. As the first child it commits before the
 * units, so a unit that reveals itself as it mounts measures where the scroll lands, not where it was.
 */
class LeadSpacer extends React.Component<{ style: React.CSSProperties; onCommit: () => void }> {
  componentDidMount() {
    this.props.onCommit();
  }

  componentDidUpdate() {
    this.props.onCommit();
  }

  render() {
    return <div style={this.props.style} />;
  }
}

/**
 * Weeks or days as one continuous strip that scrolls along an axis and comes to rest on a unit
 * edge. Only the units near the viewport are drawn; spacers stand in for the rest of the range.
 */
export class SnapScroller extends React.Component<SnapScrollerProps, SnapScrollerState> {
  static displayName = 'SnapScroller';

  /** The dates drawn for a first unit in view, `end` exclusive. */
  static drawnFrom(firstVisible: CalendarDate, visibleUnits: number, unit: Unit) {
    // A one-day screen needs more than its own width each side to keep up with a fling.
    const overscan = Math.max(visibleUnits, 3);
    return {
      first: addCalendarDays(firstVisible, -overscan * unitDays(unit)),
      end: addCalendarDays(firstVisible, (visibleUnits + overscan) * unitDays(unit)),
    };
  }

  static getDerivedStateFromProps(
    props: SnapScrollerProps,
    state: SnapScrollerState
  ): Partial<SnapScrollerState> | null {
    const target = props.scrollTarget;
    if (target === state.prevScrollTarget) return null;
    const { unit, visibleUnits } = props;
    const index = indexIn(state.rangeStart, target.date, unit);
    if (!withinRange(index, unit, visibleUnits)) {
      return { prevScrollTarget: target, ...recenteredOn(target.date, unit) };
    }
    const drawn = SnapScroller.drawnFrom(
      unitStartAt(state.rangeStart, state.firstVisibleIndex, unit),
      visibleUnits,
      unit
    );
    // Chromium aims a glide at the nearest unit drawn when it sets off, so one past them jumps.
    const smooth =
      target.animate && state.unitSize > 0 && target.date >= drawn.first && target.date < drawn.end;
    return {
      prevScrollTarget: target,
      pendingScroll: { index, smooth },
      // A jump draws the destination's units now, so it doesn't paint an empty viewport.
      firstVisibleIndex: smooth ? state.firstVisibleIndex : index,
    };
  }

  _el = React.createRef<HTMLDivElement>();
  _resizeObserver: ResizeObserver;
  _appliedScroll: SnapScrollerState['pendingScroll'] = null;
  _glideIndex: number | null = null;
  _reportedFirst: CalendarDate;

  constructor(props: SnapScrollerProps) {
    super(props);
    this.state = {
      prevScrollTarget: props.scrollTarget,
      unitSize: 0,
      ...recenteredOn(props.scrollTarget.date, props.unit),
    };
    this._reportedFirst = this._firstVisible(this.state.firstVisibleIndex);
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

  _scrollPosition() {
    const el = this._el.current;
    // A right-to-left scroller counts scrollLeft down from 0.
    return this.props.axis === 'vertical' ? el.scrollTop : Math.abs(el.scrollLeft);
  }

  _scrollTo(position: number, smooth: boolean) {
    const el = this._el.current;
    const behavior = smooth ? 'smooth' : 'instant';
    if (this.props.axis === 'vertical') {
      el.scrollTo({ top: position, behavior });
    } else {
      const rtl = getComputedStyle(el).direction === 'rtl';
      el.scrollTo({ left: rtl ? -position : position, behavior });
    }
  }

  _isAt(index: number) {
    return Math.abs(this._scrollPosition() - index * this.state.unitSize) <= 1;
  }

  _scrolledIndex() {
    const { unitSize, firstVisibleIndex } = this.state;
    return unitSize ? Math.round(this._scrollPosition() / unitSize) : firstVisibleIndex;
  }

  _firstVisible(index: number) {
    return unitStartAt(this.state.rangeStart, index, this.props.unit);
  }

  /** The first unit in view once the glide under way lands, or now when there's none. */
  headedTo() {
    return this._firstVisible(this._glideIndex ?? this.state.firstVisibleIndex);
  }

  _reportFirst(index: number) {
    const firstVisible = this._firstVisible(index);
    if (firstVisible === this._reportedFirst) return;
    this._reportedFirst = firstVisible;
    this.props.onFirstVisibleChange(firstVisible);
  }

  _measure = () => {
    const el = this._el.current;
    const length = this.props.axis === 'vertical' ? el.clientHeight : el.clientWidth;
    const unitSize = length / this.props.visibleUnits;
    if (unitSize === this.state.unitSize) return;
    // Snapping holds a resting unit in place as units change size, but a glide is headed for a
    // pixel offset worked out at the old size, so land it on its unit instead.
    this.setState((state) => ({
      unitSize,
      pendingScroll:
        this._glideIndex === null
          ? state.pendingScroll
          : { index: this._glideIndex, smooth: false },
    }));
  };

  _onCommit = () => {
    this._reportFirst(this.state.firstVisibleIndex);
    const { pendingScroll, unitSize } = this.state;
    if (!this._el.current || !unitSize || pendingScroll === this._appliedScroll) return;
    this._appliedScroll = pendingScroll;
    const { index, smooth } = pendingScroll;
    // A scroll to where the strip already is fires no scrollend to end a glide.
    this._glideIndex = smooth && !this._isAt(index) ? index : null;
    this._scrollTo(index * unitSize, smooth);
  };

  _onScroll = () => {
    const index = this._scrolledIndex();
    if (index !== this.state.firstVisibleIndex) {
      this.setState({ firstVisibleIndex: index });
    }
  };

  _onWheel = (event: React.WheelEvent) => {
    const { deltaX, deltaY } = event;
    const [along, across] = this.props.axis === 'vertical' ? [deltaY, deltaX] : [deltaX, deltaY];
    // A wheel across the axis, like the hour grid's inside a day strip, leaves the glide running.
    if (Math.abs(along) > Math.abs(across)) {
      this._glideIndex = null;
    }
  };

  _onScrollEnd = () => {
    const index = this._scrolledIndex();
    // An earlier scroll can end after a glide has set off, and acting on it would stop the glide.
    if (this._glideIndex !== null && index !== this._glideIndex) return;
    this._glideIndex = null;
    // A jump made while a glide is still running can stop between unit edges, and snapping only
    // follows the user's scrolls. The correction ends with its own scrollend.
    const { unitSize } = this.state;
    if (unitSize && !this._isAt(index)) {
      this._scrollTo(index * unitSize, false);
      return;
    }
    const firstVisible = this._firstVisible(index);
    this.props.onScrollEnd?.(firstVisible);
    // Recentered at rest, where it's invisible, so scrolling never meets the end of the range.
    const { unit, visibleUnits } = this.props;
    if (!withinRange(index, unit, visibleUnits, 3 * visibleUnits)) {
      this.setState(recenteredOn(firstVisible, unit));
    }
  };

  render() {
    const { className, axis, unit, visibleUnits, renderUnits, onClick } = this.props;
    const { rangeStart, firstVisibleIndex, unitSize } = this.state;
    const firstVisible = this._firstVisible(firstVisibleIndex);
    const drawn = SnapScroller.drawnFrom(firstVisible, visibleUnits, unit);
    const firstIndex = Math.max(0, indexIn(rangeStart, drawn.first, unit));
    const lastIndex = Math.min(unitCount(unit), indexIn(rangeStart, drawn.end, unit));

    const unitStarts: CalendarDate[] = [];
    for (let i = firstIndex; i < lastIndex; i++) {
      unitStarts.push(unitStartAt(rangeStart, i, unit));
    }
    const length = axis === 'vertical' ? 'height' : 'width';

    return (
      <div
        ref={this._el}
        className={classnames('snap-scroller', axis, className)}
        onScroll={this._onScroll}
        onWheel={this._onWheel}
        onClick={onClick}
      >
        <LeadSpacer style={{ [length]: firstIndex * unitSize }} onCommit={this._onCommit} />
        <div
          className="snap-scroller-span"
          style={{ [length]: (lastIndex - firstIndex) * unitSize }}
        >
          {renderUnits(unitStarts, firstVisible, unitSize)}
        </div>
        <div style={{ [length]: (unitCount(unit) - lastIndex) * unitSize }} />
      </div>
    );
  }
}
