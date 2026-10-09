import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import {
  CalendarEventArgs,
  CalendarEventContainer,
} from '../internal_packages/main-calendar/lib/core/calendar-event-container';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { MonthViewEvent } from '../internal_packages/main-calendar/lib/core/month-view-event';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const START = Date.UTC(2026, 5, 23, 14, 0, 0) / 1000;

const occurrence = {
  id: 'e1-e0',
  accountId: 'a',
  calendarId: 'c',
  title: 'Planning',
  location: '',
  description: '',
  isAllDay: false,
  isCancelled: false,
  isPending: false,
  isException: false,
  isRecurring: false,
  organizer: null,
  attendees: [],
  start: START,
  end: START + 3600,
} as TimedOccurrence;

const eventProps = {
  event: occurrence,
  focused: false,
  selected: false,
  isCalendarReadOnly: false,
  onClick: () => {},
  onDoubleClick: () => {},
  onFocused: () => {},
  onDragStart: () => {},
};

// The grid's mouse handler with the given children inside it, the way every view renders it.
function mountGrid(onCalendarContextMenu: jasmine.Spy, children: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  ReactDOM.render(
    <CalendarEventContainer
      onCalendarMouseDown={() => {}}
      onCalendarMouseMove={() => {}}
      onCalendarMouseUp={() => {}}
      onCalendarContextMenu={onCalendarContextMenu}
    >
      {children}
    </CalendarEventContainer>,
    host
  );
  return {
    host,
    unmount: () => {
      ReactDOM.unmountComponentAtNode(host);
      host.remove();
    },
  };
}

describe('right-clicking the calendar grid', function () {
  let onCalendarContextMenu: jasmine.Spy;
  let mounted: ReturnType<typeof mountGrid>;

  beforeEach(() => {
    onCalendarContextMenu = jasmine.createSpy('onCalendarContextMenu');
  });
  afterEach(() => mounted.unmount());

  it('reaches the calendar with the same hit-test every other grid handler gets', function () {
    mounted = mountGrid(onCalendarContextMenu, <div className="empty-space" />);
    const space = mounted.host.querySelector('.empty-space') as HTMLElement;
    ReactTestUtils.Simulate.contextMenu(space, { button: 2 } as any);
    expect(onCalendarContextMenu.calls.length).toBe(1);
    const args = onCalendarContextMenu.mostRecentCall.args[0] as CalendarEventArgs;
    expect(args.mouseEvent.type).toBe('contextmenu');
    expect(args.time).toBe(null); // nothing under the pointer that carries a time
  });

  it('stays with a week-grid event when the right-click lands on one', function () {
    mounted = mountGrid(
      onCalendarContextMenu,
      <CalendarEvent
        {...eventProps}
        direction="vertical"
        scopeStart={START}
        scopeEnd={START + 86400}
      />
    );
    const node = mounted.host.querySelector('.calendar-event') as HTMLElement;
    ReactTestUtils.Simulate.contextMenu(node, { button: 2 } as any);
    expect(onCalendarContextMenu).not.toHaveBeenCalled();
  });

  it('stays with a month-cell event when the right-click lands on one', function () {
    mounted = mountGrid(onCalendarContextMenu, <MonthViewEvent {...eventProps} />);
    const node = mounted.host.querySelector('.month-view-event-title') as HTMLElement;
    ReactTestUtils.Simulate.contextMenu(node, { button: 2 } as any);
    expect(onCalendarContextMenu).not.toHaveBeenCalled();
  });
});

describe('the grid menu', function () {
  const argsAt = (time: number | null) =>
    ({ time, mouseEvent: { clientX: 10, clientY: 20 }, containerType: 'event-column' }) as any;

  function calendar() {
    const cal: any = new MailspringCalendar({} as any);
    spyOn(cal, '_showGridMenu');
    spyOn(cal, '_createEventAt');
    return cal;
  }

  it('offers New Event over a grid slot, and creates the event at that slot', function () {
    const cal = calendar();
    const args = argsAt(START);
    cal._onCalendarContextMenu(args);
    expect(cal._showGridMenu.calls.length).toBe(1);
    const template = cal._showGridMenu.mostRecentCall.args[0];
    expect(template.map((item) => item.label)).toEqual(['New Event']);
    template[0].click();
    expect(cal._createEventAt).toHaveBeenCalledWith(args);
  });

  it('shows nothing where there is no time under the pointer', function () {
    const cal = calendar();
    cal._onCalendarContextMenu(argsAt(null));
    expect(cal._showGridMenu).not.toHaveBeenCalled();
  });

  it('is the same creation a double-click makes', function () {
    const cal = calendar();
    const args = argsAt(START);
    cal._onCalendarDoubleClick(args);
    expect(cal._createEventAt).toHaveBeenCalledWith(args);
  });
});
