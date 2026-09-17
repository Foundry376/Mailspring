import React from 'react';
import ReactDOM from 'react-dom';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { MonthViewEvent } from '../internal_packages/main-calendar/lib/core/month-view-event';
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

// `onFocused` opens the event's popover, so how often it fires is user-visible: once as focus
// arrives is a popover; once per re-render is a popover that keeps reopening itself.
function mountAndRerender(
  Component: any,
  extraProps: object,
  onFocused: jasmine.Spy
): { calls: () => number; unmount: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const render = (title: string) =>
    ReactDOM.render(
      React.createElement(Component, {
        event: { ...occurrence, title },
        focused: true,
        selected: false,
        onClick: () => {},
        onDoubleClick: () => {},
        onFocused,
        ...extraProps,
      }),
      host
    );
  render('Planning');
  // Two unrelated re-renders of an event that is already focused.
  render('Planning (renamed)');
  render('Planning (renamed again)');
  return {
    calls: () => onFocused.calls.length,
    unmount: () => {
      ReactDOM.unmountComponentAtNode(host);
      host.remove();
    },
  };
}

describe('a focused calendar event announces focus once, not on every render', function () {
  it('CalendarEvent calls onFocused only as focus arrives', function () {
    const onFocused = jasmine.createSpy('onFocused');
    const scopeStart = Date.UTC(2026, 5, 23, 0, 0, 0) / 1000;
    const mounted = mountAndRerender(
      CalendarEvent,
      {
        order: 1,
        concurrentEvents: 1,
        fixedSize: -1,
        direction: 'vertical',
        scopeStart,
        scopeEnd: scopeStart + 86400,
      },
      onFocused
    );
    expect(mounted.calls()).toBe(1);
    mounted.unmount();
  });

  it('MonthViewEvent calls onFocused only as focus arrives', function () {
    const onFocused = jasmine.createSpy('onFocused');
    const mounted = mountAndRerender(MonthViewEvent, {}, onFocused);
    expect(mounted.calls()).toBe(1);
    mounted.unmount();
  });
});
