import React from 'react';
import moment from 'moment';
import classnames from 'classnames';
import {
  CalendarDate,
  addCalendarDays,
  calendarDaysBetween,
  dayOfWeek,
  monthStartOf,
} from '../calendar-date';

type Axis = 'vertical' | 'horizontal';
type Unit = 'week' | 'day';

// Chromium caps a scroller at about 33.5M px, and a Day view column can be 2,000+ px wide, so the
// range runs 15 years each side of where it was last aimed rather than across all dates.
const RANGE_DAYS = 15 * 365;

const unitDays = (unit: Unit) => (unit === 'week' ? 7 : 1);
const rangeUnits = (unit: Unit) => Math.round(RANGE_DAYS / unitDays(unit));
const unitCount = (unit: Unit) => 2 * rangeUnits(unit) + 1;

/** The first day of the locale's week holding `date`, matching `moment().startOf('week')`. */
function weekStartOf(date: CalendarDate): CalendarDate {
  const firstDay = moment.localeData().firstDayOfWeek();
  return addCalendarDays(date, -((dayOfWeek(date) - firstDay + 7) % 7));
}

function unitStartOf(date: CalendarDate, unit: Unit) {
  return unit === 'week' ? weekStartOf(date) : date;
}

function rangeAround(date: CalendarDate, unit: Unit) {
  return addCalendarDays(unitStartOf(date, unit), -rangeUnits(unit) * unitDays(unit));
}

function indexIn(rangeStart: CalendarDate, date: CalendarDate, unit: Unit) {
  return Math.floor(calendarDaysBetween(rangeStart, date) / unitDays(unit));
}

function unitStartAt(rangeStart: CalendarDate, index: number, unit: Unit) {
  return addCalendarDays(rangeStart, index * unitDays(unit));
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
  /** Laid out evenly along the axis, one share per unit start; children land on snap points. */
  renderUnits: (unitStarts: CalendarDate[], firstVisible: CalendarDate) => React.ReactNode;
  onFirstVisibleChange: (firstVisible: CalendarDate) => void;
  onScrollEnd?: (firstVisible: CalendarDate) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface SnapScrollerState {
  prevScrollTarget: SnapScrollTarget;
  rangeStart: CalendarDate;
  topIndex: number;
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

  static monthShownFrom(topWeek: CalendarDate, visibleWeeks: number): CalendarDate {
    const middleDay = addCalendarDays(topWeek, Math.floor((visibleWeeks * 7) / 2));
    return monthStartOf(middleDay);
  }

  static drawnFrom(firstVisible: CalendarDate, visibleUnits: number, unit: Unit) {
    // A one-day screen needs more than its own width each side to keep up with a fling.
    const overscan = Math.max(visibleUnits, 3);
    return {
      first: addCalendarDays(firstVisible, -overscan * unitDays(unit)),
      days: (visibleUnits + 2 * overscan) * unitDays(unit),
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
    if (index < 0 || index > unitCount(unit) - visibleUnits) {
      const centered = rangeUnits(unit);
      return {
        prevScrollTarget: target,
        rangeStart: rangeAround(target.date, unit),
        topIndex: centered,
        pendingScroll: { index: centered, smooth: false },
      };
    }
    const smooth =
      target.animate && state.unitSize > 0 && Math.abs(index - state.topIndex) <= 2 * visibleUnits;
    return {
      prevScrollTarget: target,
      pendingScroll: { index, smooth },
      // A jump draws the destination's units now, so it doesn't paint an empty viewport.
      topIndex: smooth ? state.topIndex : index,
    };
  }

  _el = React.createRef<HTMLDivElement>();
  _resizeObserver: ResizeObserver;
  _appliedScroll: SnapScrollerState['pendingScroll'] = null;
  _glideIndex: number | null = null;
  _reportedFirst: CalendarDate;

  constructor(props: SnapScrollerProps) {
    super(props);
    const rangeStart = rangeAround(props.scrollTarget.date, props.unit);
    const topIndex = rangeUnits(props.unit);
    this.state = {
      prevScrollTarget: props.scrollTarget,
      rangeStart,
      topIndex,
      unitSize: 0,
      pendingScroll: { index: topIndex, smooth: false },
    };
    this._reportedFirst = unitStartAt(rangeStart, topIndex, props.unit);
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

  _scrolledIndex() {
    const { unitSize, topIndex } = this.state;
    return unitSize ? Math.round(this._scrollPosition() / unitSize) : topIndex;
  }

  _firstVisible(index: number) {
    return unitStartAt(this.state.rangeStart, index, this.props.unit);
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
    this._reportFirst(this.state.topIndex);
    const { pendingScroll, unitSize } = this.state;
    if (!this._el.current || !unitSize || pendingScroll === this._appliedScroll) return;
    this._appliedScroll = pendingScroll;
    const { index, smooth } = pendingScroll;
    this._glideIndex = smooth ? index : null;
    this._scrollTo(index * unitSize, smooth);
  };

  _onScroll = () => {
    const index = this._scrolledIndex();
    if (index !== this.state.topIndex) {
      this.setState({ topIndex: index });
    }
  };

  _onScrollEnd = () => {
    this._glideIndex = null;
    this.props.onScrollEnd?.(this._firstVisible(this._scrolledIndex()));
  };

  render() {
    const { className, axis, unit, visibleUnits, renderUnits, onClick } = this.props;
    const { rangeStart, topIndex, unitSize } = this.state;
    const firstVisible = this._firstVisible(topIndex);
    const drawn = SnapScroller.drawnFrom(firstVisible, visibleUnits, unit);
    const drawnIndex = indexIn(rangeStart, drawn.first, unit);
    const firstIndex = Math.max(0, drawnIndex);
    const lastIndex = Math.min(unitCount(unit), drawnIndex + drawn.days / unitDays(unit));

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
        onClick={onClick}
      >
        <LeadSpacer style={{ [length]: firstIndex * unitSize }} onCommit={this._onCommit} />
        <div
          className="snap-scroller-span"
          style={{ [length]: (lastIndex - firstIndex) * unitSize }}
        >
          {renderUnits(unitStarts, firstVisible)}
        </div>
        <div style={{ [length]: (unitCount(unit) - lastIndex) * unitSize }} />
      </div>
    );
  }
}
