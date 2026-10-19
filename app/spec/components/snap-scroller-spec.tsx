import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

import { SnapScroller, SnapScrollTarget } from '../../src/components/snap-scroller';
import {
  CalendarDate,
  calendarDateFromParts,
  calendarDateFromUnix,
  formatCalendarDate,
} from '../../src/calendar-date';

// Rows start on the locale's first day of the week, so expectations are built the same way.
const weekOf = (y: number, m: number, d: number) =>
  moment([y, m - 1, d])
    .startOf('week')
    .format('YYYY-MM-DD');

class Unit extends React.Component<{ start: CalendarDate; onMount?: (el: HTMLElement) => void }> {
  _el = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.props.onMount?.(this._el.current);
  }

  render() {
    return (
      <div ref={this._el} className="unit" data-start={formatCalendarDate(this.props.start)} />
    );
  }
}

// ResizeObserver reports between layout and paint, so two frames covers it.
const nextFrames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe('SnapScroller', function () {
  let host: HTMLDivElement;
  let onFirstVisibleChange: jasmine.Spy;
  let onScrollEnd: jasmine.Spy;

  const scrollerEl = () => host.querySelector('.snap-scroller') as HTMLElement;

  const unitSize = (axis: 'vertical' | 'horizontal' = 'vertical') => {
    const rect = (host.querySelector('.unit') as HTMLElement).getBoundingClientRect();
    return axis === 'vertical' ? rect.height : rect.width;
  };

  /** The unit at the scroller's leading edge: its top, or its start side across. */
  const firstUnitStart = (axis: 'vertical' | 'horizontal' = 'vertical') => {
    const edge = scrollerEl().getBoundingClientRect();
    const rtl = getComputedStyle(scrollerEl()).direction === 'rtl';
    const unit = Array.from(host.querySelectorAll('.unit')).find((u) => {
      const rect = u.getBoundingClientRect();
      if (axis === 'vertical') return Math.abs(rect.top - edge.top) < 1;
      return rtl ? Math.abs(rect.right - edge.right) < 1 : Math.abs(rect.left - edge.left) < 1;
    });
    return unit?.getAttribute('data-start');
  };

  const mount = (
    scrollTarget: SnapScrollTarget,
    {
      axis = 'vertical',
      unit = 'week',
      visibleUnits = 6,
      onMount,
    }: {
      axis?: 'vertical' | 'horizontal';
      unit?: 'week' | 'day';
      visibleUnits?: number;
      onMount?: (el: HTMLElement) => void;
    } = {}
  ) => {
    let scroller: SnapScroller = null;
    ReactDOM.render(
      <SnapScroller
        ref={(s) => (scroller = s)}
        axis={axis}
        unit={unit}
        visibleUnits={visibleUnits}
        scrollTarget={scrollTarget}
        renderUnits={(starts) => starts.map((s) => <Unit key={s} start={s} onMount={onMount} />)}
        onFirstVisibleChange={onFirstVisibleChange}
        onScrollEnd={onScrollEnd}
      />,
      host
    );
    return scroller;
  };

  beforeEach(function () {
    onFirstVisibleChange = jasmine.createSpy('onFirstVisibleChange');
    onScrollEnd = jasmine.createSpy('onScrollEnd');
    host = document.createElement('div');
    host.style.cssText = 'display: flex; flex-direction: column; height: 600px; width: 700px;';
    document.body.appendChild(host);
    const style = document.createElement('style');
    style.id = 'snap-scroller-spec';
    style.textContent = '.snap-scroller { flex: 1; min-height: 0; }';
    document.head.appendChild(style);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    document.getElementById('snap-scroller-spec').remove();
  });

  it('names the month holding the middle of six rows', function () {
    // Sun 27 Sep 2026 to Sat 7 Nov: the 22nd day is 18 Oct.
    const fromSep27 = SnapScroller.monthShownFrom(calendarDateFromParts(2026, 9, 27), 6);
    expect(formatCalendarDate(fromSep27)).toBe('2026-10-01');
    // From 11 Oct, three rows are October's and three November's: the 22nd day is 1 Nov.
    const fromOct11 = SnapScroller.monthShownFrom(calendarDateFromParts(2026, 10, 11), 6);
    expect(formatCalendarDate(fromOct11)).toBe('2026-11-01');
  });

  it('opens with the week holding its target at the top', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    expect(firstUnitStart()).toBe(weekOf(2026, 10, 1));
  });

  it('scrolls to a far target before the rows there mount', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const offsets: number[] = [];
    const destination = weekOf(2028, 3, 15);
    mount(
      { date: calendarDateFromParts(2028, 3, 15), animate: true },
      {
        onMount: (el) => {
          if (el.getAttribute('data-start') === destination) {
            offsets.push(el.getBoundingClientRect().top - scrollerEl().getBoundingClientRect().top);
          }
        },
      }
    );

    // A row opening a card as it mounts measures itself here, so it must already be in view.
    expect(offsets).toEqual([0]);
    expect(onFirstVisibleChange.mostRecentCall.args[0]).toBe(
      calendarDateFromUnix(moment(destination).unix())
    );
  });

  it('jumps to a target outside the range it was drawn around', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    mount({ date: calendarDateFromParts(2071, 6, 10), animate: true });
    expect(firstUnitStart()).toBe(weekOf(2071, 6, 10));
    mount({ date: calendarDateFromParts(1950, 2, 1), animate: true });
    expect(firstUnitStart()).toBe(weekOf(1950, 2, 1));
  });

  it('reports the first unit in view as units scroll past, and where the scroll came to rest', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    el.scrollTop += 3 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scrollend'));

    const threeWeeksOn = moment(weekOf(2026, 10, 1))
      .add(3, 'weeks')
      .unix();
    expect(onFirstVisibleChange.mostRecentCall.args[0]).toBe(calendarDateFromUnix(threeWeeksOn));
    expect(onScrollEnd.mostRecentCall.args[0]).toBe(calendarDateFromUnix(threeWeeksOn));
  });

  it('glides to a nearby target', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    spyOn(el, 'scrollTo').andCallThrough();
    mount({ date: calendarDateFromParts(2026, 11, 1), animate: true });

    const { top, behavior } = (el.scrollTo as jasmine.Spy).mostRecentCall.args[0];
    expect(behavior).toBe('smooth');
    expect(top).toBe(el.scrollTop + 5 * (el.clientHeight / 6));
  });

  it('keeps its top week as the viewport changes height', async function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    host.style.height = '900px';
    await nextFrames();

    expect(unitSize()).toBe(150);
    expect(firstUnitStart()).toBe(weekOf(2026, 10, 1));
  });

  it('lands a glide on its week when the viewport changes height on the way', async function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    await nextFrames();
    // Holds the glide in flight: how far a real one gets before the resize depends on the machine.
    const el = scrollerEl();
    const scrollTo = el.scrollTo.bind(el);
    spyOn(el, 'scrollTo').andCallFake((options: ScrollToOptions) => {
      if (options.behavior !== 'smooth') scrollTo(options);
    });
    mount({ date: calendarDateFromParts(2026, 11, 1), animate: true });
    host.style.height = '900px';
    await nextFrames();

    expect(unitSize()).toBe(150);
    expect(firstUnitStart()).toBe(weekOf(2026, 11, 1));
  });

  describe('across, by day', function () {
    const across = { axis: 'horizontal' as const, unit: 'day' as const, visibleUnits: 7 };

    it('opens with its target day first, and reports days as they scroll past', function () {
      mount({ date: calendarDateFromParts(2026, 10, 14), animate: false }, across);
      expect(unitSize('horizontal')).toBe(100);
      expect(firstUnitStart('horizontal')).toBe('2026-10-14');

      const el = scrollerEl();
      el.scrollLeft += 3 * 100;
      el.dispatchEvent(new Event('scroll'));
      expect(formatCalendarDate(onFirstVisibleChange.mostRecentCall.args[0])).toBe('2026-10-17');
    });

    it('starts from the right in a right-to-left layout', function () {
      host.dir = 'rtl';
      mount({ date: calendarDateFromParts(2026, 10, 14), animate: false }, across);
      expect(firstUnitStart('horizontal')).toBe('2026-10-14');

      const el = scrollerEl();
      el.scrollLeft -= 2 * 100;
      el.dispatchEvent(new Event('scroll'));
      expect(formatCalendarDate(onFirstVisibleChange.mostRecentCall.args[0])).toBe('2026-10-16');
    });
  });

  describe('in a locale whose weeks start on Monday', function () {
    beforeEach(() => moment.locale('en-gb'));
    afterEach(() => moment.locale('en'));

    it('starts its rows on Monday', function () {
      mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
      expect(firstUnitStart()).toBe('2026-09-28');
    });
  });
});
