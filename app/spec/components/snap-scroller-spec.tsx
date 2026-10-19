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
import { holdGlides } from '../fixtures/hold-glides';

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
    const el = scrollerEl();
    el.scrollTop += 10 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scrollend'));
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

  it('lines up on a unit edge when a scroll comes to rest between two', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    const start = el.scrollTop;
    // Off, so the browser's own snapping can't do the lining up this checks.
    el.style.scrollSnapType = 'none';
    el.scrollTop = start + 3.4 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scrollend'));

    expect(el.scrollTop).toBe(start + 3 * (el.clientHeight / 6));
  });

  it('leaves a glide alone when an earlier scroll ends on its way, until a wheel takes over', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    const start = el.scrollTop;
    holdGlides(el);
    mount({ date: calendarDateFromParts(2026, 11, 1), animate: true });
    el.style.scrollSnapType = 'none';
    el.scrollTop = start + 0.4 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scrollend'));
    expect(el.scrollTop).toBe(start + 0.4 * (el.clientHeight / 6));
    expect(onScrollEnd).not.toHaveBeenCalled();

    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    el.dispatchEvent(new Event('scrollend'));
    expect(el.scrollTop).toBe(start);
  });

  it("lets go of a glide once it lands, so a later scroll's end gets through", function () {
    const scroller = mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    const start = el.scrollTop;
    const row = el.clientHeight / 6;
    holdGlides(el);
    mount({ date: calendarDateFromParts(2026, 11, 1), animate: true });
    expect(formatCalendarDate(scroller.headedTo())).toBe(weekOf(2026, 11, 1));

    for (const rows of [5, 2]) {
      el.scrollTop = start + rows * row;
      el.dispatchEvent(new Event('scroll'));
      el.dispatchEvent(new Event('scrollend'));
    }
    expect(onScrollEnd.calls.map((c) => formatCalendarDate(c.args[0]))).toEqual([
      weekOf(2026, 11, 1),
      weekOf(2026, 10, 11),
    ]);
    expect(formatCalendarDate(scroller.headedTo())).toBe(weekOf(2026, 10, 11));
  });

  it('waits on no glide when a new target is where it already rests', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    const start = el.scrollTop;
    mount({ date: calendarDateFromParts(2026, 10, 2), animate: true });

    el.scrollTop = start + 2 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scrollend'));
    expect(onScrollEnd).toHaveBeenCalledWith(
      calendarDateFromUnix(moment(weekOf(2026, 10, 11)).unix())
    );
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

  it('jumps to a unit not drawn yet, where a glide would stop at the last one drawn', function () {
    // From Sun 27 Sep, six weeks are drawn either side of the six in view.
    const sevenBack = calendarDateFromParts(2026, 8, 9);
    const twelveOn = calendarDateFromParts(2026, 12, 20);
    const landings = [sevenBack, twelveOn].map((date) => {
      ReactDOM.unmountComponentAtNode(host);
      mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
      const scrollTo = spyOn(scrollerEl(), 'scrollTo').andCallThrough();
      mount({ date, animate: true });
      return [scrollTo.mostRecentCall.args[0].behavior, firstUnitStart()];
    });
    expect(landings).toEqual([
      ['instant', weekOf(2026, 8, 9)],
      ['instant', weekOf(2026, 12, 20)],
    ]);
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
    // How far a real glide gets before the resize depends on the machine.
    const el = scrollerEl();
    holdGlides(el);
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

    it('stays inside the scroll size Chromium allows when a day is very wide', function () {
      host.style.width = '3200px';
      mount(
        { date: calendarDateFromParts(2026, 10, 14), animate: false },
        { ...across, visibleUnits: 1 }
      );
      expect(scrollerEl().scrollWidth).toBeLessThan(2 ** 24);
      expect(firstUnitStart('horizontal')).toBe('2026-10-14');
    });

    it('recenters where a scroll comes to rest near an end, keeping that day in view', function () {
      mount({ date: calendarDateFromParts(2026, 10, 14), animate: false }, across);
      const el = scrollerEl();
      const centered = el.scrollLeft;
      // Off, or the browser snaps a jump this far back onto the days drawn before it.
      el.style.scrollSnapType = 'none';
      // 354 days on, a few weeks from the end of the year either side of the target.
      el.scrollLeft = centered + 354 * 100;
      el.dispatchEvent(new Event('scroll'));
      el.dispatchEvent(new Event('scrollend'));

      expect(firstUnitStart('horizontal')).toBe('2027-10-03');
      expect(el.scrollLeft).toBe(centered);
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
