import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { DatabaseStore } from 'mailspring-exports';

import { CalendarHeader } from '../internal_packages/main-calendar/lib/core/calendar-header';
import CalendarHeaderStore, {
  ViewNavigation,
} from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

describe('CalendarHeader', function () {
  let host: HTMLDivElement;
  const navigation = (over: Partial<ViewNavigation> = {}): ViewNavigation => ({
    arrows: 'vertical',
    prevAction: () => {},
    nextAction: () => {},
    todayAction: () => {},
    ...over,
  });
  const options = (over = {}) => ({
    view: CalendarView.MONTH,
    onChangeView: () => {},
    agendaOpen: false,
    onToggleAgenda: () => {},
    ...over,
  });

  beforeEach(function () {
    spyOn(DatabaseStore, 'findAll').andReturn(Promise.resolve([]));
    CalendarHeaderStore.setViewNavigation(null);
    CalendarHeaderStore.setCalendarOptions(null);
    host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(<CalendarHeader />, host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    CalendarHeaderStore.setViewNavigation(null);
    CalendarHeaderStore.setCalendarOptions(null);
  });

  it('shows nothing until a view and the calendar have handed it what to show', function () {
    expect(host.querySelector('.header-controls')).toBe(null);
    CalendarHeaderStore.setViewNavigation(navigation());
    expect(host.querySelector('.header-controls')).toBe(null);
    CalendarHeaderStore.setCalendarOptions(options());
    expect(host.querySelector('select').value).toBe(CalendarView.MONTH);
  });

  it('follows the view and agenda as they change', function () {
    CalendarHeaderStore.setViewNavigation(navigation());
    CalendarHeaderStore.setCalendarOptions(options());
    CalendarHeaderStore.setCalendarOptions(options({ view: CalendarView.WEEK, agendaOpen: true }));
    expect(host.querySelector('select').value).toBe(CalendarView.WEEK);
    expect(host.querySelector('.agenda-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('puts search between the arrows and the agenda button', function () {
    CalendarHeaderStore.setViewNavigation(navigation());
    CalendarHeaderStore.setCalendarOptions(options());
    const items = Array.from(host.querySelector('.side-controls').children);
    const at = (selector: string) => items.indexOf(host.querySelector(selector));
    expect(at('.event-search-bar')).toBe(at('.nav-arrows') + 1);
    expect(at('.agenda-toggle')).toBe(at('.event-search-bar') + 1);
  });

  it("runs the view's latest actions, handed over without a redraw", function () {
    const prevAction = jasmine.createSpy('prevAction');
    const onToggleAgenda = jasmine.createSpy('onToggleAgenda');
    CalendarHeaderStore.setViewNavigation(navigation());
    CalendarHeaderStore.setCalendarOptions(options());
    CalendarHeaderStore.setViewNavigation(navigation({ prevAction }));
    CalendarHeaderStore.setCalendarOptions(options({ onToggleAgenda }));

    ReactTestUtils.Simulate.click(host.querySelector('.prev'));
    ReactTestUtils.Simulate.click(host.querySelector('.agenda-toggle'));
    expect(prevAction).toHaveBeenCalled();
    expect(onToggleAgenda).toHaveBeenCalled();
  });
});
