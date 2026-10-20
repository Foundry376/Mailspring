import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';

import { HeaderControls } from '../internal_packages/main-calendar/lib/core/header-controls';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

describe('HeaderControls', function () {
  let host: HTMLDivElement;
  let onChangeView: jasmine.Spy;
  let onToggleAgenda: jasmine.Spy;
  let todayAction: jasmine.Spy;

  const render = (agendaOpen = false) =>
    ReactDOM.render(
      <HeaderControls
        title="September 2026"
        view={CalendarView.MONTH}
        nextAction={() => {}}
        prevAction={() => {}}
        todayAction={todayAction}
        onChangeView={onChangeView}
        agendaOpen={agendaOpen}
        onToggleAgenda={onToggleAgenda}
      />,
      host
    );
  const select = () => host.querySelector('select');
  const toggle = () => host.querySelector('.agenda-toggle');

  beforeEach(function () {
    onChangeView = jasmine.createSpy('onChangeView');
    onToggleAgenda = jasmine.createSpy('onToggleAgenda');
    todayAction = jasmine.createSpy('todayAction');
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('offers Day, Week and Month, showing the current one', function () {
    render();
    expect(Array.from(select().options).map((o) => o.textContent)).toEqual([
      'Day',
      'Week',
      'Month',
    ]);
    expect(select().value).toBe(CalendarView.MONTH);
  });

  it('switches to the view picked', function () {
    render();
    select().value = CalendarView.WEEK;
    ReactTestUtils.Simulate.change(select());
    expect(onChangeView).toHaveBeenCalledWith(CalendarView.WEEK);
  });

  it('puts Today before the view, and the agenda button last', function () {
    render();
    const controls = Array.from(host.querySelectorAll('.side-controls button, select'));
    expect(controls[0].textContent).toBe('Today');
    expect(controls[1]).toBe(select());
    expect(controls[controls.length - 1]).toBe(toggle());

    ReactTestUtils.Simulate.click(controls[0]);
    expect(todayAction).toHaveBeenCalled();
  });

  it('toggles the agenda panel, showing whether it is open', function () {
    render(false);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    ReactTestUtils.Simulate.click(toggle());
    expect(onToggleAgenda).toHaveBeenCalled();

    render(true);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });
});
