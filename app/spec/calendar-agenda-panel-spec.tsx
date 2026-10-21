import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import Rx from 'rx-lite';
import { Actions, CalendarDate, CalendarDateUtils } from 'mailspring-exports';

import { AgendaPanel } from '../internal_packages/main-calendar/lib/core/agenda-panel';
import { ResizableRegion } from '../src/components/resizable-region';
import { AgendaContainer } from '../internal_packages/main-calendar/lib/core/agenda-container';
import {
  MailspringCalendar,
  MailspringCalendarViewProps,
} from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { calendarDateFromUnix, formatCalendarDate } from '../src/calendar-date';
import { allDayOccurrence, calendarViewProps } from './fixtures/calendar-view-props';

describe('AgendaPanel', function () {
  let host: HTMLDivElement;
  let buildObservable: jasmine.Spy;

  const render = (overrides: Partial<MailspringCalendarViewProps> = {}) =>
    ReactDOM.render(
      <AgendaPanel
        {...calendarViewProps({ dataSource: { buildObservable } as any, ...overrides })}
      />,
      host
    );
  const queried = () => {
    const { startUnix, endUnix } = buildObservable.mostRecentCall.args[0];
    return [startUnix, endUnix].map((unix) => formatCalendarDate(calendarDateFromUnix(unix)));
  };
  const day = (offset: number) => moment().startOf('day').add(offset, 'days');
  const days = () => Array.from(host.querySelectorAll('.agenda-day'));

  beforeEach(function () {
    buildObservable = jasmine
      .createSpy('buildObservable')
      .andCallFake(() => Rx.Observable.just({ events: [] }));
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('queries the two weeks from today, wherever the calendar is focused', function () {
    render({ focusedMoment: moment([2020, 0, 1]) });
    expect(queried()).toEqual([day(0).format('YYYY-MM-DD'), day(13).format('YYYY-MM-DD')]);
  });

  it('requeries without the calendars hidden', function () {
    render();
    render({ disabledCalendars: ['cal-1'] });
    expect(buildObservable.callCount).toBe(2);
    expect(buildObservable.mostRecentCall.args[0].disabledCalendars).toEqual(['cal-1']);
  });

  it('stops listening to its query once unmounted', function () {
    const query = new Rx.Subject<{ events: [] }>();
    buildObservable.andCallFake(() => query);
    render();
    expect(query.hasObservers()).toBe(true);

    ReactDOM.unmountComponentAtNode(host);
    expect(query.hasObservers()).toBe(false);
  });

  const timedOn = (title: string, offset: number, hour: number, minutes: number) => {
    const start = day(offset).hour(hour).unix();
    return {
      ...allDayOccurrence(title, day(offset).format('YYYY-MM-DD')),
      isAllDay: false,
      start,
      end: start + minutes * 60,
    } as TimedOccurrence;
  };
  const listing = (events: object[]) => {
    buildObservable.andCallFake(() => Rx.Observable.just({ events }));
    render();
  };

  it('lists only the days with something on, today in blue', function () {
    listing([timedOn('Standup', 0, 9, 30), timedOn('Review', 3, 14, 60)]);
    expect(days().map((d) => d.querySelector('.agenda-day-header').textContent)).toEqual([
      day(0).format('ddd MMM D'),
      day(3).format('ddd MMM D'),
    ]);
    expect(days()[0].querySelector('.is-today')).not.toBe(null);
    expect(days()[1].querySelector('.is-today')).toBe(null);
  });

  it('moves on a day at midnight, while open', function () {
    let dayChanged: (today: CalendarDate) => void;
    spyOn(CalendarDateUtils, 'onDayChange').andCallFake((_today, onChange) => {
      dayChanged = onChange;
      return { dispose() {} };
    });
    listing([timedOn('Standup', 0, 9, 30), timedOn('Review', 1, 14, 60)]);
    expect(host.querySelector('.is-today').textContent).toBe(day(0).format('ddd MMM D'));

    dayChanged(CalendarDateUtils.calendarDateFromUnix(day(1).unix()));

    expect(host.querySelector('.is-today').textContent).toBe(day(1).format('ddd MMM D'));
    expect(queried()).toEqual([day(1).format('YYYY-MM-DD'), day(14).format('YYYY-MM-DD')]);
  });

  it('stops watching for midnight once closed', function () {
    const dispose = jasmine.createSpy('dispose');
    spyOn(CalendarDateUtils, 'onDayChange').andReturn({ dispose });
    render();
    ReactDOM.unmountComponentAtNode(host);
    expect(dispose).toHaveBeenCalled();
  });

  it('says so once when the two weeks are empty', function () {
    listing([]);
    expect(days().length).toBe(0);
    expect(host.querySelector('.agenda-no-events').textContent).toBe('No events');
  });

  it('lists all-day events first, each title above its times and length', function () {
    const timed = timedOn('Standup', 1, 9, 30);
    listing([timed, allDayOccurrence('Offsite', day(1).format('YYYY-MM-DD'))]);

    const rows = Array.from(days()[0].querySelectorAll('.agenda-event-details')).map((row) =>
      Array.from(row.children).map((line) => line.textContent)
    );
    const range = `${moment.unix(timed.start).format('h')}–${moment.unix(timed.end).format('h:mm A')}`;
    expect(rows).toEqual([
      ['Offsite', 'All day'],
      ['Standup', `${range} 30m`],
    ]);
  });
});

describe('MailspringCalendar agenda panel', function () {
  const savedConfig = (values: { [key: string]: unknown }) =>
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => values[key]);

  it('opens the default view, with the panel open, for a view saved as Agenda', function () {
    savedConfig({ 'mailspring.calendarView': 'Agenda' });
    const calendar: any = new MailspringCalendar({} as any);
    expect(calendar.state.view).toBe(CalendarView.WEEK);
    expect(calendar.state.agendaOpen).toBe(true);
  });

  it('keeps the panel closed for someone who closed it', function () {
    savedConfig({ 'mailspring.calendarAgendaOpen': false });
    const calendar: any = new MailspringCalendar({} as any);
    expect(calendar.state.agendaOpen).toBe(false);
  });

  it('keeps a saved view that still exists, and the panel as it was left', function () {
    savedConfig({ 'mailspring.calendarView': 'Month', 'mailspring.calendarAgendaOpen': true });
    const calendar: any = new MailspringCalendar({} as any);
    expect(calendar.state.view).toBe(CalendarView.MONTH);
    expect(calendar.state.agendaOpen).toBe(true);
  });

  const panelsIn = (element: React.ReactNode): React.ReactElement[] => {
    if (!React.isValidElement(element)) return [];
    const props = element.props as { children?: React.ReactNode };
    const nested = React.Children.toArray(props.children).flatMap(panelsIn);
    return element.type === AgendaContainer ? [element, ...nested] : nested;
  };

  const shownCalendar = () => {
    const calendar: any = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.calendarsLoaded = true;
    calendar.state.calendars = [{ id: 'cal-1' }];
    return calendar;
  };

  it('hides and shows the panel beside the view, and remembers it', function () {
    const set = spyOn(AppEnv.config, 'set');
    const calendar = shownCalendar();
    expect(panelsIn(calendar.render()).length).toBe(1);

    calendar.onToggleAgenda();

    expect(panelsIn(calendar.render()).length).toBe(0);
    expect(set).toHaveBeenCalledWith('mailspring.calendarAgendaOpen', false);
  });

  it('lets the panel be dragged between 200 and 300px wide, starting at 240', function () {
    const store = spyOn(AppEnv, 'storeColumnWidth');
    const region = () => shownCalendar()._renderAgendaPanel();
    expect(region().type).toBe(ResizableRegion);
    expect(region().props.minWidth).toBe(200);
    expect(region().props.maxWidth).toBe(300);
    expect(region().props.initialWidth).toBe(240);

    region().props.onResize(280);
    expect(store).toHaveBeenCalledWith({ id: 'CalendarAgenda', width: 280 });
    spyOn(AppEnv, 'getColumnWidth').andCallFake((id) =>
      id === 'CalendarAgenda' ? 280 : undefined
    );
    expect(region().props.initialWidth).toBe(280);
  });

  it('selects the clicked event in the grid too, and shows it there', function () {
    const focus = spyOn(Actions, 'focusCalendarEvent');
    const calendar = shownCalendar();
    const start = moment([2026, 9, 22, 9]).unix();
    const standup = { id: `standup-e${start}`, isAllDay: false, start, end: start + 1800 };
    calendar.state.selectedEvents = [{ id: 'earlier-pick' }];

    panelsIn(calendar.render())[0].props.onEventClick({}, standup);

    expect(focus).toHaveBeenCalledWith({ id: standup.id, start });
    expect(calendar.state.selectedEvents).toEqual([standup]);
    expect(panelsIn(calendar.render())[0].props.selectedEvents).toEqual([standup]);
  });

  it('leaves the panel out while there are no calendars to show', function () {
    const calendar: any = new MailspringCalendar({} as any);
    calendar.state.calendarsLoaded = true;
    expect(calendar.state.agendaOpen).toBe(true);
    expect(panelsIn(calendar.render()).length).toBe(0);
  });
});
