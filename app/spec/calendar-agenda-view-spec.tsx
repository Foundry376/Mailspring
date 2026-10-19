import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import Rx from 'rx-lite';

import { AgendaView } from '../internal_packages/main-calendar/lib/core/agenda-view';
import { MailspringCalendarViewProps } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { calendarDateFromUnix, formatCalendarDate } from '../src/calendar-date';
import { allDayOccurrence, calendarViewProps } from './fixtures/calendar-view-props';

describe('AgendaView', function () {
  let host: HTMLDivElement;
  let buildObservable: jasmine.Spy;

  const render = (overrides: Partial<MailspringCalendarViewProps>) =>
    ReactDOM.render(
      <AgendaView
        {...calendarViewProps({ dataSource: { buildObservable } as any, ...overrides })}
      />,
      host
    );
  const queried = () => {
    const { startUnix, endUnix } = buildObservable.mostRecentCall.args[0];
    return [startUnix, endUnix].map((unix) => formatCalendarDate(calendarDateFromUnix(unix)));
  };

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

  it('queries the two weeks from the focused day, and again only once they move', function () {
    render({ focusedMoment: moment([2026, 9, 21, 9]) });
    expect(queried()).toEqual(['2026-10-21', '2026-11-03']);

    render({ focusedMoment: moment([2026, 9, 21, 15]) });
    expect(buildObservable.callCount).toBe(1);

    render({ focusedMoment: moment([2026, 9, 22, 9]) });
    expect(queried()).toEqual(['2026-10-22', '2026-11-04']);
  });

  it('requeries without the calendars hidden', function () {
    const focusedMoment = moment([2026, 9, 21]);
    render({ focusedMoment });
    render({ focusedMoment, disabledCalendars: ['cal-1'] });
    expect(buildObservable.callCount).toBe(2);
    expect(buildObservable.mostRecentCall.args[0].disabledCalendars).toEqual(['cal-1']);
  });

  it('stops listening to its query once unmounted', function () {
    const query = new Rx.Subject<{ events: [] }>();
    buildObservable.andCallFake(() => query);
    render({ focusedMoment: moment([2026, 9, 21]) });
    expect(query.hasObservers()).toBe(true);

    ReactDOM.unmountComponentAtNode(host);
    expect(query.hasObservers()).toBe(false);
  });

  it('lists the events the query returns', function () {
    const event = allDayOccurrence('Offsite', '2026-10-22');
    buildObservable.andCallFake(() => Rx.Observable.just({ events: [event] }));
    render({ focusedMoment: moment([2026, 9, 21]) });
    expect(host.querySelector('.agenda-event-title').textContent).toBe('Offsite');
  });
});
