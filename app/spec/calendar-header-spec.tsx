import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';

import { CalendarHeader } from '../internal_packages/main-calendar/lib/core/calendar-header';
import CalendarHeaderStore, {
  ViewHeader,
} from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

describe('CalendarHeader', function () {
  let host: HTMLDivElement;
  const viewHeader = (over: Partial<ViewHeader> = {}): ViewHeader => ({
    title: 'October 2026',
    arrows: 'vertical',
    prevAction: () => {},
    nextAction: () => {},
    todayAction: () => {},
    ...over,
  });
  const controls = (over = {}) => ({
    view: CalendarView.MONTH,
    onChangeView: () => {},
    agendaOpen: false,
    onToggleAgenda: () => {},
    ...over,
  });
  const title = () => host.querySelector('.header-controls .title')?.textContent;

  beforeEach(function () {
    CalendarHeaderStore.setViewHeader(null);
    CalendarHeaderStore.setControls(null);
    host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(<CalendarHeader />, host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    CalendarHeaderStore.setViewHeader(null);
    CalendarHeaderStore.setControls(null);
  });

  it('shows nothing until a view and the calendar have handed it what to show', function () {
    expect(host.querySelector('.header-controls')).toBe(null);
    CalendarHeaderStore.setViewHeader(viewHeader());
    expect(host.querySelector('.header-controls')).toBe(null);
    CalendarHeaderStore.setControls(controls());
    expect(title()).toBe('October 2026');
    expect(host.querySelector('select').value).toBe(CalendarView.MONTH);
  });

  it('follows the title, view and agenda as they change', function () {
    CalendarHeaderStore.setViewHeader(viewHeader());
    CalendarHeaderStore.setControls(controls());
    CalendarHeaderStore.setViewHeader(viewHeader({ title: 'November 2026' }));
    CalendarHeaderStore.setControls(controls({ view: CalendarView.WEEK, agendaOpen: true }));
    expect(title()).toBe('November 2026');
    expect(host.querySelector('select').value).toBe(CalendarView.WEEK);
    expect(host.querySelector('.agenda-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it("runs the view's latest actions, handed over without a redraw", function () {
    const prevAction = jasmine.createSpy('prevAction');
    const onToggleAgenda = jasmine.createSpy('onToggleAgenda');
    CalendarHeaderStore.setViewHeader(viewHeader());
    CalendarHeaderStore.setControls(controls());
    CalendarHeaderStore.setViewHeader(viewHeader({ prevAction }));
    CalendarHeaderStore.setControls(controls({ onToggleAgenda }));

    ReactTestUtils.Simulate.click(host.querySelector('.prev'));
    ReactTestUtils.Simulate.click(host.querySelector('.agenda-toggle'));
    expect(prevAction).toHaveBeenCalled();
    expect(onToggleAgenda).toHaveBeenCalled();
  });
});
