import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

import { WeekScroller, WeekScrollTarget } from '../../src/components/week-scroller';
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

class Row extends React.Component<{ start: CalendarDate; onMount?: (el: HTMLElement) => void }> {
  _el = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.props.onMount?.(this._el.current);
  }

  render() {
    return <div ref={this._el} className="row" data-start={formatCalendarDate(this.props.start)} />;
  }
}

describe('WeekScroller', function () {
  let host: HTMLDivElement;
  let onTopWeekChange: jasmine.Spy;
  let onScrollEnd: jasmine.Spy;

  const scrollerEl = () => host.querySelector('.week-scroller') as HTMLElement;

  const topRowStart = () => {
    const top = scrollerEl().getBoundingClientRect().top;
    const row = Array.from(host.querySelectorAll('.row')).find(
      (r) => Math.abs(r.getBoundingClientRect().top - top) < 1
    );
    return row?.getAttribute('data-start');
  };

  const rowHeight = () =>
    (host.querySelector('.week-scroller-row') as HTMLElement).getBoundingClientRect().height;

  // ResizeObserver reports between layout and paint, so two frames covers it.
  const nextFrames = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const mount = (scrollTarget: WeekScrollTarget, onMount?: (el: HTMLElement) => void) => {
    let scroller: WeekScroller = null;
    ReactDOM.render(
      <WeekScroller
        ref={(s) => (scroller = s)}
        visibleWeeks={6}
        scrollTarget={scrollTarget}
        renderWeeks={(starts) => starts.map((s) => <Row start={s} onMount={onMount} />)}
        onTopWeekChange={onTopWeekChange}
        onScrollEnd={onScrollEnd}
      />,
      host
    );
    return scroller;
  };

  beforeEach(function () {
    onTopWeekChange = jasmine.createSpy('onTopWeekChange');
    onScrollEnd = jasmine.createSpy('onScrollEnd');
    host = document.createElement('div');
    host.style.cssText = 'display: flex; flex-direction: column; height: 600px; width: 300px;';
    document.body.appendChild(host);
    const style = document.createElement('style');
    style.id = 'week-scroller-spec';
    style.textContent = '.week-scroller { flex: 1; min-height: 0; }';
    document.head.appendChild(style);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    document.getElementById('week-scroller-spec').remove();
  });

  it('names the month holding the middle of six rows', function () {
    // Sun 27 Sep 2026 to Sat 7 Nov: the 22nd day is 18 Oct.
    const fromSep27 = WeekScroller.monthShownFrom(calendarDateFromParts(2026, 9, 27), 6);
    expect(formatCalendarDate(fromSep27)).toBe('2026-10-01');
    // From 11 Oct, three rows are October's and three November's: the 22nd day is 1 Nov.
    const fromOct11 = WeekScroller.monthShownFrom(calendarDateFromParts(2026, 10, 11), 6);
    expect(formatCalendarDate(fromOct11)).toBe('2026-11-01');
  });

  it('opens with the week holding its target at the top', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    expect(topRowStart()).toBe(weekOf(2026, 10, 1));
  });

  it('scrolls to a far target before the rows there mount', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const offsets: number[] = [];
    const destination = weekOf(2028, 3, 15);
    mount({ date: calendarDateFromParts(2028, 3, 15), animate: true }, (el) => {
      if (el.getAttribute('data-start') === destination) {
        offsets.push(el.getBoundingClientRect().top - scrollerEl().getBoundingClientRect().top);
      }
    });

    // A row opening a card as it mounts measures itself here, so it must already be in view.
    expect(offsets).toEqual([0]);
    expect(onTopWeekChange.mostRecentCall.args[0]).toBe(
      calendarDateFromUnix(moment(destination).unix())
    );
  });

  it('reports the top week as rows scroll past, and where the scroll came to rest', function () {
    mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    const el = scrollerEl();
    el.scrollTop += 3 * (el.clientHeight / 6);
    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scrollend'));

    const threeWeeksOn = moment(weekOf(2026, 10, 1))
      .add(3, 'weeks')
      .unix();
    expect(onTopWeekChange.mostRecentCall.args[0]).toBe(calendarDateFromUnix(threeWeeksOn));
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

    expect(rowHeight()).toBe(150);
    expect(topRowStart()).toBe(weekOf(2026, 10, 1));
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

    expect(rowHeight()).toBe(150);
    expect(topRowStart()).toBe(weekOf(2026, 11, 1));
  });

  describe('in a locale whose weeks start on Monday', function () {
    beforeEach(() => moment.locale('en-gb'));
    afterEach(() => moment.locale('en'));

    it('starts its rows on Monday', function () {
      mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
      expect(topRowStart()).toBe('2026-09-28');
    });
  });
});
