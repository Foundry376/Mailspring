import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { MonthViewEvent } from '../internal_packages/main-calendar/lib/core/month-view-event';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
import { layoutWeekBars } from '../internal_packages/main-calendar/lib/core/month-view-helpers';
import {
  ArrowDirection,
  DayPlacement,
  eventInDirection,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { addCalendarDays, calendarDateFromUnix } from '../src/calendar-date';
import { EventOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import {
  allDayOccurrence,
  calendarViewProps,
  timedOccurrence,
} from './fixtures/calendar-view-props';

const at = (id: string, dayIndex: number, top: number, order = 1, bottom = top): DayPlacement => ({
  occurrence: { id } as EventOccurrence,
  dayIndex,
  top,
  bottom,
  order,
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
  const step = (from: string, direction: ArrowDirection) =>
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

  describe('with events starting together', function () {
    // Day 1: two rows of two side by side; one event on each day either side.
    const row = [
      at('before', 0, 100),
      at('left', 1, 100, 1),
      at('right', 1, 100, 2),
      at('after', 1, 200, 1),
      at('afterRight', 1, 200, 2),
      at('next', 2, 100),
    ];
    const stepIn = (from: string, direction: ArrowDirection) =>
      eventInDirection(row, from, direction)?.id ?? null;

    it('crosses the row on Left and Right before leaving the day', function () {
      expect(stepIn('left', 'right')).toBe('right');
      expect(stepIn('right', 'left')).toBe('left');
      expect(stepIn('right', 'right')).toBe('next');
      expect(stepIn('left', 'left')).toBe('before');
    });

    it('steps past the row on Up and Down, landing in the same place along the next', function () {
      expect(stepIn('left', 'down')).toBe('after');
      expect(stepIn('right', 'down')).toBe('afterRight');
      expect(stepIn('after', 'up')).toBe('left');
      expect(stepIn('afterRight', 'up')).toBe('right');
    });

    it('enters a row from the side the arrow comes from', function () {
      expect(stepIn('before', 'right')).toBe('left');
      expect(stepIn('next', 'left')).toBe('right');
    });
  });

  describe('into a day with events overlapping this one', function () {
    // Minutes into the day. Day 1: "early" 9:00-10:00 on the left, two 9:30-10:00 beside it.
    const days = [
      at('race', 0, 570, 1, 630),
      at('early', 1, 540, 1, 600),
      at('middle', 1, 570, 2, 600),
      at('last', 1, 570, 3, 600),
      at('beside', 2, 575, 1, 590),
    ];
    const stepIn = (from: string, direction: ArrowDirection) =>
      eventInDirection(days, from, direction)?.id ?? null;

    it('goes on to the next overlapping event beside it before leaving the day', function () {
      expect(stepIn('early', 'right')).toBe('middle');
      expect(stepIn('middle', 'right')).toBe('last');
      expect(stepIn('last', 'right')).toBe('beside');
      expect(stepIn('middle', 'left')).toBe('early');
    });

    it('lands on the overlapping event nearest the side it comes in from', function () {
      expect(stepIn('race', 'right')).toBe('early');
      expect(stepIn('beside', 'left')).toBe('last');
    });

    it('falls back to the nearest start when none overlaps, an end touching a start included', function () {
      const touching = [
        at('after', 0, 600, 1, 660),
        at('long', 1, 540, 1, 600),
        at('short', 1, 580, 2, 600),
      ];
      expect(eventInDirection(touching, 'after', 'right').id).toBe('short');
    });
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
      .filter((p) => p.dayIndex === 3)
      .sort((x, y) => x.top - y.top)
      .map((p) => p.occurrence.id);
    expect(wednesday).toEqual(['holiday', 'late', 'standup']);
    const daysOf = (id: string) =>
      placements.filter((p) => p.occurrence.id === id).map((p) => p.dayIndex);
    expect(daysOf('late')).toEqual([2, 3]);
    expect(daysOf('holiday')).toEqual([3]);

    const span = (id: string) => {
      const p = placements.find((x) => x.occurrence.id === id && x.dayIndex === 3);
      return [p.top, p.bottom];
    };
    expect(span('standup')).toEqual([9 * 3600, 9.5 * 3600]);
    expect(span('late')).toEqual([0, 3600]);
  });

  it('places events starting together on one row, left to right', function () {
    const view: any = new TimeGridView({
      ...calendarViewProps({ focusedMoment: moment('2026-11-11T12:00:00') }),
      visibleDays: 7,
    });
    view.state.events = [
      timedOccurrence('standup', '2026-11-11T09:00:00', '2026-11-11T09:30:00'),
      timedOccurrence('sync', '2026-11-11T09:00:00', '2026-11-11T10:00:00'),
    ];

    const [a, b] = view.dayPlacements();
    expect(a.top).toBe(b.top);
    expect([a.order, b.order].sort()).toEqual([1, 2]);
  });
});

describe('MonthView.dayPlacements', function () {
  it('counts days on through the weeks, leaving out bars under "+N more" and previews', function () {
    const view: any = new MonthView(calendarViewProps());
    const events = [
      allDayOccurrence('span', '2026-11-06', '2026-11-09'),
      allDayOccurrence('a', '2026-11-10'),
      allDayOccurrence('b', '2026-11-10'),
      allDayOccurrence('c', '2026-11-10'),
      { ...allDayOccurrence('preview', '2026-11-03'), isDragPreview: true },
    ];
    const sunday = calendarDateFromUnix(moment('2026-11-01T12:00:00').unix());
    const week = (offset: number) =>
      Array.from({ length: 7 }, (_, i) => addCalendarDays(sunday, offset + i));
    view._visibleLayouts = [layoutWeekBars(events, week(0), 2), layoutWeekBars(events, week(7), 2)];

    const daysOf = (id: string) =>
      view
        .dayPlacements()
        .filter((p: DayPlacement) => p.occurrence.id === id)
        .map((p: DayPlacement) => p.dayIndex);
    expect(daysOf('span')).toEqual([5, 6, 7, 8]);
    expect(['a', 'b', 'c'].map((id) => daysOf(id).length)).toEqual([1, 0, 0]);
    expect(daysOf('preview')).toEqual([]);
  });
});

// Stands in for Day, Week or Month: its events, and the element focus goes to. Each event is also
// drawn first on a day out of view, as one across midnight is.
class FakeGrid extends React.Component<{ placements: DayPlacement[] }> {
  dayPlacements() {
    return this.props.placements;
  }
  render() {
    return (
      <div className="calendar-view" tabIndex={-1}>
        {this.props.placements.map((p) => (
          <div key={`${p.occurrence.id}-overscan`} id={p.occurrence.id} tabIndex={-1} />
        ))}
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
            { occurrence: first, dayIndex: 0, top: 32400, bottom: 34200, order: 1 },
            { occurrence: second, dayIndex: 0, top: 39600, bottom: 41400, order: 1 },
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
    expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
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

  it('moves focus to the grid when a Cmd-click takes the focused event out of the selection', function () {
    calendar.state.selectedEvents = [first, second];
    const firstEl = document.querySelector<HTMLElement>('[id="first"][tabindex="0"]');
    firstEl.focus();
    calendar._onEventClick({ metaKey: true }, first);
    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual(['second']);
    expect(document.activeElement.className).toBe('calendar-view');

    firstEl.focus();
    calendar._onEventClick({ metaKey: true }, first);
    expect(document.activeElement).toBe(firstEl);
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
