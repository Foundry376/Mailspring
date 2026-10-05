import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import moment from 'moment';
import Rx from 'rx-lite';
import { Calendar } from '../src/flux/models/calendar';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { WeekView } from '../internal_packages/main-calendar/lib/core/week-view';
import { DayView } from '../internal_packages/main-calendar/lib/core/day-view';
import { WeekViewEventColumn } from '../internal_packages/main-calendar/lib/core/week-view-event-column';
import { WeekViewAllDayEvents } from '../internal_packages/main-calendar/lib/core/week-view-all-day-events';
import { setCalendarColors } from '../internal_packages/main-calendar/lib/core/calendar-helpers';

const calendar = (color: string) =>
  new Calendar({ id: 'repaint-cal', accountId: 'a', name: 'Team', color } as any);

describe('repainting the calendar when colours change', function () {
  function viewElement(cal: any) {
    return cal._renderMainContent() as React.ReactElement<{ paintVersion: string }>;
  }
  function loadedCalendar() {
    const cal: any = new MailspringCalendar({} as any);
    cal.state = { ...cal.state, calendarsLoaded: true, calendars: [calendar('#112233')] };
    return cal;
  }

  it("a calendar's new colour changes the view's paint version without remounting it", function () {
    const cal = loadedCalendar();
    const before = viewElement(cal);
    setCalendarColors([calendar('#445566')]);
    const after = viewElement(cal);
    expect(after.type).toBe(before.type);
    expect(before.key).toBe(null);
    expect(after.key).toBe(null);
    expect(after.props.paintVersion).not.toBe(before.props.paintVersion);
  });

  it('a theme change does the same', function () {
    const cal = loadedCalendar();
    const before = viewElement(cal);
    cal.state = { ...cal.state, themeVersion: cal.state.themeVersion + 1 };
    const after = viewElement(cal);
    expect(after.key).toBe(null);
    expect(after.props.paintVersion).not.toBe(before.props.paintVersion);
  });

  it('nothing else changing leaves the paint version alone', function () {
    const cal = loadedCalendar();
    expect(viewElement(cal).props.paintVersion).toBe(viewElement(cal).props.paintVersion);
  });
});

describe('the guarded columns', function () {
  const props: any = {
    events: [],
    allDayEvents: [],
    allDayOverlap: {},
    height: 20,
    focusedEvent: null,
    selectedEvents: [],
    day: moment(),
    dayEnd: 0,
    onEventClick: () => {},
    onEventDoubleClick: () => {},
    onEventFocused: () => {},
    onEventDragStart: () => {},
    dragState: null,
    readOnlyCalendarIds: new Set(),
    paintVersion: '1-0',
  };

  for (const Component of [WeekViewEventColumn, WeekViewAllDayEvents]) {
    it(`${Component.displayName} repaints on a new paint version and on nothing else`, function () {
      const column: any = new (Component as any)(props);
      expect(column.shouldComponentUpdate({ ...props }, column.state)).toBe(false);
      expect(column.shouldComponentUpdate({ ...props, paintVersion: '2-0' }, column.state)).toBe(
        true
      );
    });
  }
});

describe('the week and day views', function () {
  const dataSource = { buildObservable: () => Rx.Observable.just({ events: [] }) };
  const viewProps: any = {
    dataSource,
    disabledCalendars: [],
    focusedMoment: moment(),
    focusedEvent: null,
    selectedEvents: [],
    onChangeView: () => {},
    onChangeFocusedMoment: () => {},
    onCalendarMouseUp: () => {},
    onCalendarMouseDown: () => {},
    onCalendarMouseMove: () => {},
    onCalendarClick: () => {},
    onCalendarDoubleClick: () => {},
    onEventClick: () => {},
    onEventDoubleClick: () => {},
    onEventFocused: () => {},
    onEventDragStart: () => {},
    dragState: null,
    readOnlyCalendarIds: new Set(),
    isCalendarReadOnly: () => false,
    paintVersion: '7-1',
  };
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  for (const View of [WeekView, DayView]) {
    it(`${View.displayName || View.name} hands the paint version to every guarded child`, function () {
      const view = ReactDOM.render(React.createElement(View, viewProps), host) as any;
      const columns = ReactTestUtils.scryRenderedComponentsWithType(view, WeekViewEventColumn);
      const allDay = ReactTestUtils.scryRenderedComponentsWithType(view, WeekViewAllDayEvents);
      expect(columns.length).toBeGreaterThan(0);
      expect(allDay.length).toBeGreaterThan(0);
      for (const child of [...columns, ...allDay]) {
        expect((child.props as any).paintVersion).toBe('7-1');
      }
    });
  }
});
