import React from 'react';
import ReactDOM from 'react-dom';

import { CalendarMenuCommands } from '../internal_packages/main-calendar/lib/calendar-menu-commands';
import PopoverStore from '../src/flux/stores/popover-store';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

describe('CalendarMenuCommands', function () {
  let host: HTMLDivElement;
  let onNavigatePrevious: jasmine.Spy;
  let onNavigateNext: jasmine.Spy;
  let onScrollHours: jasmine.Spy;

  const render = (hasSelectedEvents: boolean, view = CalendarView.WEEK) =>
    ReactDOM.render(
      <CalendarMenuCommands
        onChangeView={() => {}}
        onChangeFocusedMoment={() => {}}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        onScrollHours={onScrollHours}
        onDeleteEvent={() => {}}
        onRefreshCalendars={() => {}}
        hasSelectedEvents={hasSelectedEvents}
        view={view}
      >
        <div />
      </CalendarMenuCommands>,
      host
    );

  beforeEach(function () {
    onNavigatePrevious = jasmine.createSpy('onNavigatePrevious');
    onNavigateNext = jasmine.createSpy('onNavigateNext');
    onScrollHours = jasmine.createSpy('onScrollHours');
    host = document.createElement('div');
    document.body.appendChild(host);
    (document.activeElement as HTMLElement)?.blur?.();
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('steps through time on the arrows, when no event is selected', function () {
    render(false);
    AppEnv.commands.dispatch('core:move-left');
    AppEnv.commands.dispatch('core:move-right');
    expect(onNavigatePrevious.callCount).toBe(1);
    expect(onNavigateNext.callCount).toBe(1);
  });

  it('steps through months on up and down in Month view, and scrolls the hours in Week', function () {
    render(false, CalendarView.MONTH);
    AppEnv.commands.dispatch('core:previous-item');
    AppEnv.commands.dispatch('core:next-item');
    expect(onNavigatePrevious.callCount).toBe(1);
    expect(onNavigateNext.callCount).toBe(1);

    render(false, CalendarView.WEEK);
    AppEnv.commands.dispatch('core:previous-item');
    AppEnv.commands.dispatch('core:next-item');
    expect(onNavigatePrevious.callCount).toBe(1);
    expect(onNavigateNext.callCount).toBe(1);
    expect(onScrollHours.calls.map((c) => c.args)).toEqual([[-1], [1]]);

    render(true, CalendarView.MONTH);
    AppEnv.commands.dispatch('core:previous-item');
    expect(onNavigatePrevious.callCount).toBe(1);
  });

  it('leaves those keys to the selected event', function () {
    render(true);
    AppEnv.commands.dispatch('core:move-left');
    AppEnv.commands.dispatch('core:move-right');
    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).not.toHaveBeenCalled();
  });

  it('leaves those keys alone while a card or editor is open', function () {
    render(false, CalendarView.MONTH);
    PopoverStore.isOpen = true;
    try {
      AppEnv.commands.dispatch('core:move-left');
      AppEnv.commands.dispatch('core:move-right');
      AppEnv.commands.dispatch('core:previous-item');
      AppEnv.commands.dispatch('core:next-item');
    } finally {
      PopoverStore.isOpen = false;
    }
    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).not.toHaveBeenCalled();
  });
});
