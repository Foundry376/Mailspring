import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
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

// The calendar's key commands (arrows move, Delete removes) dispatch on document.activeElement,
// so a movable event the user has just pressed must be the active element.
function mountMovableEvent(Component: any, extraProps: object) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  ReactDOM.render(
    React.createElement(Component, {
      event: occurrence,
      focused: false,
      selected: false,
      isCalendarReadOnly: false,
      onClick: () => {},
      onDoubleClick: () => {},
      onFocused: () => {},
      onDragStart: () => {},
      ...extraProps,
    }),
    host
  );
  const node = host.querySelector('[tabindex]') as HTMLElement;
  return {
    node,
    unmount: () => {
      ReactDOM.unmountComponentAtNode(host);
      host.remove();
    },
  };
}

// A real press is preceded by the pointer arriving, which is what arms the drag hit zone.
function pressToStartDrag(node: HTMLElement) {
  ReactTestUtils.Simulate.mouseMove(node, { clientX: 1, clientY: 1 } as any);
  ReactTestUtils.Simulate.mouseDown(node, { button: 0 } as any);
}

const cases: Array<[string, any, object]> = [
  [
    'CalendarEvent',
    CalendarEvent,
    { direction: 'vertical', scopeStart: START, scopeEnd: START + 86400 },
  ],
  ['MonthViewEvent', MonthViewEvent, {}],
];

for (const [name, Component, extraProps] of cases) {
  describe(`${name} pressed to start a drag`, () => {
    let mounted: ReturnType<typeof mountMovableEvent>;

    beforeEach(() => {
      mounted = mountMovableEvent(Component, extraProps);
    });

    afterEach(() => mounted.unmount());

    it('is the active element, so the keyboard move and delete commands reach the calendar', () => {
      pressToStartDrag(mounted.node);

      expect(document.activeElement).toBe(mounted.node);
    });

    it('takes focus without being scrolled into view', () => {
      const focus = spyOn(mounted.node, 'focus');

      pressToStartDrag(mounted.node);

      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });
  });
}
