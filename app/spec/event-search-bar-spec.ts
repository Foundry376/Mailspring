import React from 'react';
import ReactDOMServer from 'react-dom/server';
import moment from 'moment';
import 'moment/locale/de';
import { EventSearchBar } from '../internal_packages/main-calendar/lib/core/event-search-bar';
import { timedOccurrence } from './fixtures/calendar-view-props';

// The moment/locale import above switches the global locale as it loads.
moment.locale('en');

describe('EventSearchBar results', function () {
  // Built before any locale change: the fixture's first use of CalendarDateUtils loads
  // date-utils, which sets moment's locale from navigator.language.
  const planning = timedOccurrence('planning', '2026-03-03T15:00:00', '2026-03-03T16:30:00');
  const render = () => {
    const bar: any = new EventSearchBar({});
    bar.state = { ...bar.state, suggestions: [planning], focused: true };
    return ReactDOMServer.renderToStaticMarkup(bar.render());
  };
  afterEach(() => moment.locale('en'));

  it("lists each result with its day and times in the locale's clock", function () {
    moment.locale('en');
    expect(render()).toContain('Tue, Mar 3 · 3:00 PM - 4:30 PM');
    moment.locale('de');
    expect(render()).toContain(
      `${moment('2026-03-03T15:00:00').format('ddd, MMM D')} · 15:00 - 16:30`
    );
  });
});
