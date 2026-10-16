import React from 'react';
import ReactDOM from 'react-dom';

import { CalendarMenuCommands } from '../internal_packages/main-calendar/lib/calendar-menu-commands';
import PopoverStore from '../src/flux/stores/popover-store';

describe('CalendarMenuCommands', function () {
  let host: HTMLDivElement;
  let onNavigatePrevious: jasmine.Spy;
  let onNavigateNext: jasmine.Spy;

  const render = (hasSelectedEvents: boolean) =>
    ReactDOM.render(
      <CalendarMenuCommands
        onChangeView={() => {}}
        onChangeFocusedMoment={() => {}}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        onDeleteEvent={() => {}}
        onRefreshCalendars={() => {}}
        hasSelectedEvents={hasSelectedEvents}
      >
        <div />
      </CalendarMenuCommands>,
      host
    );

  beforeEach(function () {
    onNavigatePrevious = jasmine.createSpy('onNavigatePrevious');
    onNavigateNext = jasmine.createSpy('onNavigateNext');
    host = document.createElement('div');
    document.body.appendChild(host);
    (document.activeElement as HTMLElement)?.blur?.();
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('steps through time on the keys that move an event, when none is selected', function () {
    render(false);
    AppEnv.commands.dispatch('calendar:move-event-left');
    AppEnv.commands.dispatch('calendar:move-event-right');
    expect(onNavigatePrevious.callCount).toBe(1);
    expect(onNavigateNext.callCount).toBe(1);
  });

  it('leaves those keys to the selected event', function () {
    render(true);
    AppEnv.commands.dispatch('calendar:move-event-left');
    AppEnv.commands.dispatch('calendar:move-event-right');
    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).not.toHaveBeenCalled();
  });
  it('leaves those keys alone while a card or editor is open', function () {
    render(false);
    PopoverStore.isOpen = true;
    try {
      AppEnv.commands.dispatch('calendar:move-event-left');
      AppEnv.commands.dispatch('calendar:move-event-right');
    } finally {
      PopoverStore.isOpen = false;
    }
    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).not.toHaveBeenCalled();
  });
});
