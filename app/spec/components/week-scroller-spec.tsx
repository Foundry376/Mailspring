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

  it('keeps its top week as the viewport changes height', function () {
    const scroller = mount({ date: calendarDateFromParts(2026, 10, 1), animate: false });
    host.style.height = '900px';
    scroller._measure();
    expect(topRowStart()).toBe(weekOf(2026, 10, 1));
  });
});
