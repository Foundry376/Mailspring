import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { MonthViewEvent } from '../internal_packages/main-calendar/lib/core/month-view-event';
import {
  DayPlacement,
  eventInDirection,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { EventOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import {
  allDayOccurrence,
  calendarViewProps,
  timedOccurrence,
} from './fixtures/calendar-view-props';

const at = (id: string, day: number, rank: number): DayPlacement => ({
  occurrence: { id } as EventOccurrence,
  day,
  rank,
});

describe('eventInDirection', function () {
  // Day 1 is empty; "multi" covers days 2 and 3.
  const placements = [
    at('a', 0, 100),
    at('multi', 2, -10),
    at('b', 2, 50),
    at('c', 2, 400),
    at('multi', 3, -10),
    at('d', 3, 300),
  ];
  const step = (from: string, direction: 'up' | 'down' | 'left' | 'right') =>
    eventInDirection(placements, from, direction)?.id ?? null;

  it('steps up and down within the day, stopping at its first and last event', function () {
    expect(step('b', 'down')).toBe('c');
    expect(step('b', 'up')).toBe('multi');
    expect(step('c', 'down')).toBe(null);
    expect(step('multi', 'up')).toBe(null);
  });

  it('steps sideways to the nearest event in height, skipping empty days', function () {
    expect(step('a', 'right')).toBe('b');
    expect(step('d', 'left')).toBe('c');
  });

  it('stops at the last day shown', function () {
    expect(step('d', 'right')).toBe(null);
    expect(step('a', 'left')).toBe(null);
  });

  it('steps from the first day of an event over several, never onto itself', function () {
    expect(step('multi', 'right')).toBe('d');
    expect(step('multi', 'down')).toBe('b');
  });

  it('returns nothing for an event not on the grid', function () {
    expect(step('elsewhere', 'down')).toBe(null);
  });
});

describe('TimeGridView.dayPlacements', function () {
  it('puts the all-day row above the hours, and an event past midnight atop its second day', function () {
    const view: any = new TimeGridView({
      ...calendarViewProps({ focusedMoment: moment('2026-11-11T12:00:00') }),
      visibleDays: 7,
    });
    view.state.events = [
      timedOccurrence('standup', '2026-11-11T09:00:00', '2026-11-11T09:30:00'),
      timedOccurrence('late', '2026-11-10T22:00:00', '2026-11-11T01:00:00'),
      allDayOccurrence('holiday', '2026-11-11'),
    ];

    const placements: DayPlacement[] = view.dayPlacements();
    const wednesday = placements
      .filter((p) => p.day === 3)
      .sort((x, y) => x.rank - y.rank)
      .map((p) => p.occurrence.id);
    expect(wednesday).toEqual(['holiday', 'late', 'standup']);
    expect(placements.filter((p) => p.occurrence.id === 'late').map((p) => p.day)).toEqual([2, 3]);
  });
});

// Stands in for Day, Week or Month: its events, and the element focus goes to.
class FakeGrid extends React.Component<{ placements: DayPlacement[] }> {
  dayPlacements() {
    return this.props.placements;
  }
  render() {
    return (
      <div className="calendar-view" tabIndex={-1}>
        {this.props.placements.map((p) => (
          <div key={p.occurrence.id} id={p.occurrence.id} tabIndex={0} />
        ))}
      </div>
    );
  }
}

describe('the arrow keys and Esc with an event selected', function () {
  const first = timedOccurrence('first', '2026-11-11T09:00:00', '2026-11-11T09:30:00');
  const second = timedOccurrence('second', '2026-11-11T11:00:00', '2026-11-11T11:30:00');
  let host: HTMLDivElement;
  let grid: FakeGrid;
  let calendar: any;

  beforeEach(function () {
    spyOn(AppEnv.config, 'set');
    host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(
      <div>
        <FakeGrid
          ref={(g) => (grid = g)}
          placements={[
            { occurrence: first, day: 0, rank: 32400 },
            { occurrence: second, day: 0, rank: 39600 },
          ]}
        />
        <div className="agenda-panel">
          <button id="agenda-row" />
        </div>
      </div>,
      host
    );
    calendar = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.selectedEvents = [first];
    calendar._gridView = () => grid;
    document.getElementById('first').focus();
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('selects the next event that way and moves focus to it', function () {
    calendar._onStepFromSelectedEvent('down');
    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual(['second']);
    expect(document.activeElement.id).toBe('second');
  });

  it('leaves the selection alone while focus is in the agenda', function () {
    document.getElementById('agenda-row').focus();
    calendar._onStepFromSelectedEvent('down');
    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual(['first']);
  });

  it('clears the selection on Esc and moves focus from the event to the grid', function () {
    calendar._onBackToAgenda();
    expect(calendar.state.selectedEvents).toEqual([]);
    expect(document.activeElement.className).toBe('calendar-view');
  });

  it('leaves focus in the agenda on Esc', function () {
    document.getElementById('agenda-row').focus();
    calendar._onBackToAgenda();
    expect(document.activeElement.id).toBe('agenda-row');
  });
});

describe('focus on an event', function () {
  const occurrence = timedOccurrence('planning', '2026-11-11T09:00:00', '2026-11-11T10:00:00');
  const scopeStart = moment('2026-11-11T00:00:00').unix();
  const views: [string, any, object][] = [
    [
      'CalendarEvent',
      CalendarEvent,
      { direction: 'vertical', scopeStart, scopeEnd: scopeStart + 86400 },
    ],
    ['MonthViewEvent', MonthViewEvent, {}],
  ];

  views.forEach(([name, Component, props]) => {
    describe(`in a ${name}`, function () {
      let host: HTMLDivElement;
      let onFocused: jasmine.Spy;
      const render = (selected: boolean) =>
        ReactDOM.render(
          React.createElement(Component, {
            event: occurrence,
            focused: false,
            selected,
            onClick: () => {},
            onDoubleClick: () => {},
            onFocused,
            ...props,
          }),
          host
        );
      const element = () => host.firstElementChild as HTMLElement;

      beforeEach(function () {
        onFocused = jasmine.createSpy('onFocused');
        host = document.createElement('div');
        document.body.appendChild(host);
        (document.activeElement as HTMLElement)?.blur?.();
      });

      afterEach(function () {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
      });

      it('selects it when it comes from the keyboard', function () {
        render(false);
        element().focus();
        expect(onFocused).toHaveBeenCalledWith(occurrence);
      });

      it('leaves selecting to the click when it comes from a press', function () {
        render(false);
        element().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element().focus();
        expect(onFocused).not.toHaveBeenCalled();

        // The press is spent: focus coming back by keyboard selects again.
        element().blur();
        element().focus();
        expect(onFocused.callCount).toBe(1);
      });

      it('does nothing for an event already selected', function () {
        render(true);
        element().focus();
        expect(onFocused).not.toHaveBeenCalled();
      });
    });
  });
});
