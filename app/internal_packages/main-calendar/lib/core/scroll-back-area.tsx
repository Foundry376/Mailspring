import React from 'react';
import { localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';
import { EventOccurrence, occurrenceStartUnix } from './calendar-data-source';

type Direction = 'up' | 'down' | 'left' | 'right';

interface ScrollBackAreaProps {
  /** The event open in the panel; the selected one, so the grid marks it `.selected`. */
  event: EventOccurrence | null;
  /** The axis the view's days run along: across in Day and Week, down in Month. */
  dayAxis: 'horizontal' | 'vertical';
  onReveal: (event: EventOccurrence) => void;
  children: React.ReactNode;
}

interface ScrollBackAreaState {
  direction: Direction | null;
  left: number;
  top: number;
}

const SELECTED_EVENT = '.calendar-event.selected, .month-view-event.selected';
// Single days only: Week's all-day row spans every day drawn, showing or not.
const DAY_CELL = '.month-view-day-cell, [data-calendar-type="day-column"]';
const DAY_SCROLLER = '.month-view-grid, .calendar-area-wrap';
const GRID_TOP = '.event-grid-wrap, .month-view-grid';

const ARROWS = {
  up: SVGIcons.ArrowUp,
  down: SVGIcons.ArrowDown,
  left: SVGIcons.ArrowLeft,
  right: SVGIcons.ArrowRight,
};

function clipsOf(el: Element, root: Element): DOMRect[] {
  const clips: DOMRect[] = [];
  for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      clips.push(node.getBoundingClientRect());
    }
  }
  return clips;
}

/** Which way `rect` lies outside the clips, sideways first; null while any of it shows. */
function sideOutside(rect: DOMRect, clips: DOMRect[]): Direction | null {
  let vertical: Direction | null = null;
  for (const clip of clips) {
    if (rect.right <= clip.left) return 'left';
    if (rect.left >= clip.right) return 'right';
    if (!vertical && rect.bottom <= clip.top) vertical = 'up';
    if (!vertical && rect.top >= clip.bottom) vertical = 'down';
  }
  return vertical;
}

// An event outside the days drawn has no element, so its date is compared with the days showing.
export function scrolledAwayDirection(
  area: Element,
  event: EventOccurrence,
  dayAxis: 'horizontal' | 'vertical'
): Direction | null {
  const elements = Array.from(area.querySelectorAll(SELECTED_EVENT));
  if (elements.length > 0) {
    const sides = elements.map((el) => sideOutside(el.getBoundingClientRect(), clipsOf(el, area)));
    return sides.includes(null) ? null : sides[0];
  }

  const shown = Array.from(area.querySelectorAll<HTMLElement>(DAY_CELL)).filter(
    (cell) => sideOutside(cell.getBoundingClientRect(), clipsOf(cell, area)) === null
  );
  if (shown.length === 0) return null;
  const start = occurrenceStartUnix(event);
  const firstShown = Math.min(...shown.map((cell) => Number(cell.dataset.calendarStart)));
  const lastShown = Math.max(...shown.map((cell) => Number(cell.dataset.calendarEnd)));
  if (start < firstShown) return dayAxis === 'horizontal' ? 'left' : 'up';
  if (start >= lastShown) return dayAxis === 'horizontal' ? 'right' : 'down';
  return null;
}

// Wraps the grid so the grid's element exists by the time this mounts and starts watching it.
export class ScrollBackArea extends React.Component<ScrollBackAreaProps, ScrollBackAreaState> {
  static displayName = 'ScrollBackArea';

  state: ScrollBackAreaState = { direction: null, left: 0, top: 0 };

  _area = React.createRef<HTMLDivElement>();
  _frame: number | null = null;
  _observer?: MutationObserver;
  _resizeObserver?: ResizeObserver;

  componentDidMount() {
    const area = this._area.current;
    area.addEventListener('scroll', this._schedule, true);
    // The grid draws its days and events from its own subscriptions, without a render here.
    this._observer = new MutationObserver(this._schedule);
    this._observer.observe(area, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    this._resizeObserver = new ResizeObserver(this._schedule);
    this._resizeObserver.observe(area);
    this._schedule();
  }

  componentDidUpdate(prevProps: ScrollBackAreaProps) {
    if (prevProps.event !== this.props.event || prevProps.dayAxis !== this.props.dayAxis) {
      this._schedule();
    }
  }

  componentWillUnmount() {
    this._area.current.removeEventListener('scroll', this._schedule, true);
    this._observer?.disconnect();
    this._resizeObserver?.disconnect();
    if (this._frame !== null) cancelAnimationFrame(this._frame);
  }

  _schedule = () => {
    if (this._frame !== null) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._measure();
    });
  };

  _measure() {
    const area = this._area.current;
    const { event, dayAxis } = this.props;
    const direction = event ? scrolledAwayDirection(area, event, dayAxis) : null;
    if (!direction) {
      if (this.state.direction) this.setState({ direction: null });
      return;
    }
    const areaRect = area.getBoundingClientRect();
    const scroller = area.querySelector(DAY_SCROLLER)?.getBoundingClientRect() || areaRect;
    const gridTop = area.querySelector(GRID_TOP)?.getBoundingClientRect().top ?? areaRect.top;
    const left = scroller.left + scroller.width / 2 - areaRect.left;
    const top = gridTop - areaRect.top;
    const { state } = this;
    if (direction !== state.direction || left !== state.left || top !== state.top) {
      this.setState({ direction, left, top });
    }
  }

  render() {
    return (
      <div className="calendar-grid-area" ref={this._area}>
        {this.props.children}
        {this._renderPill()}
      </div>
    );
  }

  _renderPill() {
    const { event } = this.props;
    const { direction, left, top } = this.state;
    if (!event || !direction) return null;
    const title = event.title || localized('(No title)');
    const Arrow = ARROWS[direction];
    return (
      <button
        className="scroll-back-pill"
        style={{ left, top }}
        title={localized('Scroll back to %@', title)}
        onClick={() => this.props.onReveal(event)}
      >
        <Arrow size={14} strokeWidth={2} />
        <span className="scroll-back-pill-title">{title}</span>
      </button>
    );
  }
}
