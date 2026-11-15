import Rx from 'rx-lite';
import { Calendar, Event } from 'mailspring-exports';

import { CalendarDataSource } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

describe('CalendarDataSource', function () {
  let calendars: Rx.Subject<Calendar[]>;
  let events: Rx.Subject<Event[]>;
  let emitted: number;

  const calendar = (fields: Partial<Calendar>) =>
    new Calendar({
      id: 'cal-1',
      accountId: 'acc-1',
      path: '/a@b.com/',
      ownership: 'mine',
      ...fields,
    });

  beforeEach(function () {
    calendars = new Rx.Subject<Calendar[]>();
    events = new Rx.Subject<Event[]>();
    spyOn(Rx.Observable, 'fromQuery').andCallFake((query: any) =>
      query._klass === Calendar ? calendars : events
    );
    emitted = 0;
    new CalendarDataSource()
      .buildObservable({ startUnix: 0, endUnix: 86400, disabledCalendars: [] })
      .subscribe(() => emitted++);
    events.onNext([]);
    calendars.onNext([calendar({}), calendar({ id: 'cal-2', path: '/c@d.com/' })]);
  });

  it('does not re-expand when a sync re-persists calendars unchanged', function () {
    // A calendar sync writes every Calendar row to record its sync state, several times over.
    // A replaced row can also come back in a different order.
    calendars.onNext([calendar({ id: 'cal-2', path: '/c@d.com/' }), calendar({})]);
    calendars.onNext([calendar({}), calendar({ id: 'cal-2', path: '/c@d.com/' })]);
    expect(emitted).toBe(1);
  });

  it('re-expands when what expansion reads from a calendar changes', function () {
    calendars.onNext([calendar({ readOnly: true })]);
    calendars.onNext([calendar({ readOnly: true, ownership: 'other' })]);
    expect(emitted).toBe(3);
  });
});
