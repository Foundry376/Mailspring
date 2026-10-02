import React from 'react';
import ReactDOM from 'react-dom';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const START = Date.UTC(2026, 5, 23, 14, 0, 0) / 1000;

const occurrence: TimedOccurrence = {
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

describe('focusing a calendar event', function () {
  it('clears focusedEvent once the event has announced itself', function () {
    const calendar: any = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.focusedEvent = { id: occurrence.id, start: START };

    calendar._onEventFocused(occurrence);

    // Left set, componentDidUpdate re-runs the reveal on any later render, and a remounted
    // event announces itself again.
    expect(calendar.state.focusedEvent).toBe(null);
  });

  it('reveals the event by the shortest scroll rather than centring it', function () {
    const calls: any[] = [];
    const proto = Element.prototype as any;
    const original = proto.scrollIntoViewIfNeeded;
    proto.scrollIntoViewIfNeeded = function (centerIfNeeded: boolean) {
      calls.push(centerIfNeeded);
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const scopeStart = Date.UTC(2026, 5, 23, 0, 0, 0) / 1000;
    try {
      ReactDOM.render(
        React.createElement(CalendarEvent as any, {
          event: occurrence,
          focused: true,
          selected: false,
          order: 1,
          concurrentEvents: 1,
          fixedSize: -1,
          direction: 'vertical',
          scopeStart,
          scopeEnd: scopeStart + 86400,
          onClick: () => {},
          onDoubleClick: () => {},
          onFocused: () => {},
        }),
        host
      );
      expect(calls).toEqual([false]);
    } finally {
      ReactDOM.unmountComponentAtNode(host);
      host.remove();
      proto.scrollIntoViewIfNeeded = original;
    }
  });
});
