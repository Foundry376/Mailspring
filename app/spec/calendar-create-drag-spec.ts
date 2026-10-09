import {
  createDragRange,
  createNewEventPreview,
  withNewEventPreview,
  CREATE_DRAG_SNAP_SECONDS,
} from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import Rx from 'rx-lite';
import * as CalendarDateUtils from '../src/calendar-date';
import { Calendar } from '../src/flux/models/calendar';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { WeekView } from '../internal_packages/main-calendar/lib/core/week-view';
import { DayView } from '../internal_packages/main-calendar/lib/core/day-view';
import { DEFAULT_TIMED_EVENT_DURATION_SECONDS } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';

const BASE = 1787860800; // 2026-08-27 16:00:00 UTC, a quarter-hour boundary

function drag(overrides: any = {}) {
  return {
    anchorTime: BASE,
    currentTime: BASE + 3600,
    isAllDay: false,
    isDragging: true,
    calendarId: 'cal-1',
    accountId: 'acct-1',
    ...overrides,
  };
}

describe('createDragRange', function () {
  it('returns the dragged span', function () {
    expect(createDragRange(drag())).toEqual({ start: BASE, end: BASE + 3600 });
  });

  it('orders the range when dragging upward', function () {
    const upward = drag({ anchorTime: BASE + 3600, currentTime: BASE });
    expect(createDragRange(upward)).toEqual({ start: BASE, end: BASE + 3600 });
  });

  it('snaps both ends to the quarter hour', function () {
    const messy = drag({ anchorTime: BASE + 100, currentTime: BASE + 3700 });
    const { start, end } = createDragRange(messy);
    expect(start % CREATE_DRAG_SNAP_SECONDS).toBe(0);
    expect(end % CREATE_DRAG_SNAP_SECONDS).toBe(0);
  });

  it('snaps to the nearest quarter hour, not the one before', function () {
    const late = drag({ anchorTime: BASE + 600, currentTime: BASE + 3600 });
    expect(createDragRange(late).start).toBe(BASE + CREATE_DRAG_SNAP_SECONDS);
  });

  it('never produces a zero-length event', function () {
    const barely = drag({ currentTime: BASE + 10 });
    const { start, end } = createDragRange(barely);
    expect(end - start).toBe(CREATE_DRAG_SNAP_SECONDS);
  });

  it('keeps a minimum duration when dragged upward by a hair', function () {
    const barely = drag({ anchorTime: BASE + 10, currentTime: BASE });
    const { start, end } = createDragRange(barely);
    expect(end - start).toBe(CREATE_DRAG_SNAP_SECONDS);
  });
});

describe('createNewEventPreview', function () {
  it('describes a timed range for a drag on the hour grid', function () {
    const preview = createNewEventPreview(drag()) as any;
    expect(preview.isAllDay).toBe(false);
    expect(preview.start).toBe(BASE);
    expect(preview.end).toBe(BASE + 3600);
    expect(preview.isDragPreview).toBe(true);
  });

  it('describes an all-day range for a drag on the all-day row', function () {
    const preview = createNewEventPreview(drag({ isAllDay: true })) as any;
    expect(preview.isAllDay).toBe(true);
    expect(preview.start).toBe(undefined);
  });

  it('covers every day an all-day drag crossed, the last one included', function () {
    const first = moment.unix(BASE).startOf('day');
    const last = first.clone().add(1, 'day');
    const preview = createNewEventPreview(
      drag({ anchorTime: first.unix(), currentTime: last.unix(), isAllDay: true })
    ) as any;
    expect(preview.startDate).toEqual(CalendarDateUtils.calendarDateFromUnix(first.unix()));
    expect(preview.endDate).toEqual(CalendarDateUtils.calendarDateFromUnix(last.unix()));
  });

  it('carries the calendar it will be created on, so it paints in that colour', function () {
    const preview = createNewEventPreview(drag()) as any;
    expect(preview.calendarId).toBe('cal-1');
    expect(preview.accountId).toBe('acct-1');
  });
});

describe('withNewEventPreview', function () {
  const existing = [{ id: 'a' }, { id: 'b' }] as any[];

  it('adds nothing when no new event is being drawn or edited', function () {
    expect(withNewEventPreview(existing, null)).toBe(existing);
  });

  it('appends the preview, leaving the real events alone', function () {
    const preview = createNewEventPreview(drag());
    expect(withNewEventPreview(existing, preview)).toEqual([...existing, preview]);
  });
});

import { detectHitZone } from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';

/** A vertical (week/day view) event box of the given height, at the origin. */
const box = (height: number) =>
  ({ top: 0, bottom: height, left: 0, right: 100, height, width: 100 }) as DOMRect;

describe('drawing a new event on empty grid space', function () {
  const SNAP = CREATE_DRAG_SNAP_SECONDS;
  let cal: any;
  let grid: HTMLElement;
  let chip: HTMLElement;

  // The calendar as the grid sees it: one writable calendar, setState landing in state.
  beforeEach(function () {
    cal = new MailspringCalendar({} as any);
    cal.state = {
      ...cal.state,
      calendarsLoaded: true,
      calendars: [new Calendar({ id: 'cal-1', accountId: 'acct-1', name: 'Mine' } as any)],
      disabledCalendars: [],
    };
    cal.setState = (next: any) =>
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
    spyOn(cal, '_openNewEventPopover');
    grid = document.createElement('div');
    chip = document.createElement('div');
    chip.className = 'calendar-event';
  });

  const at = (time: number, extra: any = {}) =>
    ({
      time,
      x: 10,
      y: 10,
      containerType: 'day-column',
      mouseEvent: { button: 0, target: grid, clientX: 100, clientY: 200 },
      ...extra,
    }) as any;

  it('holds a press out of state until the pointer has travelled a snap interval', function () {
    cal._onCalendarMouseDown(at(BASE));
    expect(cal.state.createDrag).toBe(null);
    cal._onCalendarMouseMove(at(BASE + SNAP - 1));
    expect(cal.state.createDrag).toBe(null);
    cal._onCalendarMouseMove(at(BASE + SNAP));
    expect(cal.state.createDrag.anchorTime).toBe(BASE);
    expect(cal.state.createDrag.currentTime).toBe(BASE + SNAP);
    expect(cal.state.createDrag.isDragging).toBe(true);
  });

  it('opens the editor over the drawn range on release, and eats the click that follows', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600 + 100));
    cal._onCalendarMouseUp(at(BASE + 3600 + 100));
    expect(cal.state.createDrag).toBe(null);
    expect(cal._openNewEventPopover).toHaveBeenCalledWith({
      startUnix: BASE,
      endUnix: BASE + 3600,
      isAllDay: false,
      clientX: 100,
      clientY: 200,
    });
    const closePopover = spyOn(require('mailspring-exports').Actions, 'closePopover');
    cal._onCalendarClick(at(BASE));
    expect(closePopover).not.toHaveBeenCalled();
    cal._onCalendarClick(at(BASE));
    expect(closePopover).toHaveBeenCalled();
  });

  it('draws upward drags the same as downward ones', function () {
    cal._onCalendarMouseDown(at(BASE + 3600));
    cal._onCalendarMouseMove(at(BASE));
    cal._onCalendarMouseUp(at(BASE));
    const call = cal._openNewEventPopover.mostRecentCall.args[0];
    expect(call.startUnix).toBe(BASE);
    expect(call.endUnix).toBe(BASE + 3600);
  });

  it('treats a press that never travelled as a click: no event, and the click stays live', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 60));
    cal._onCalendarMouseUp(at(BASE + 60));
    expect(cal._openNewEventPopover).not.toHaveBeenCalled();
    const closePopover = spyOn(require('mailspring-exports').Actions, 'closePopover');
    cal._onCalendarClick(at(BASE));
    expect(closePopover).toHaveBeenCalled();
  });

  it('lets the next click deselect when a drag was released outside the calendar', function () {
    cal.state.selectedEvents = [{ id: 'e1' }];
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    cal._onCalendarMouseUp(at(BASE + 3600));
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseUp(at(BASE));
    cal._onCalendarClick(at(BASE));
    expect(cal.state.selectedEvents).toEqual([]);
  });

  it('draws nothing when the pointer moves after a press that never travelled', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseUp(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal.state.createDrag).toBe(null);
  });

  it('makes an all-day event from a drag along the all-day row, ending the day after the last one', function () {
    const day = Math.floor(BASE / 86400) * 86400;
    cal._onCalendarMouseDown(at(day, { containerType: 'all-day-area' }));
    cal._onCalendarMouseMove(at(day + 86400, { containerType: 'all-day-area' }));
    cal._onCalendarMouseUp(at(day + 86400, { containerType: 'all-day-area' }));
    const call = cal._openNewEventPopover.mostRecentCall.args[0];
    expect(call.isAllDay).toBe(true);
    expect(call.startUnix).toBe(day);
    expect(call.endUnix).toBeGreaterThan(day + 86400);
  });

  it('draws on the calendar the event would be created on', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + SNAP));
    expect(cal.state.createDrag.calendarId).toBe('cal-1');
    expect(cal.state.createDrag.accountId).toBe('acct-1');
  });

  it('does not begin on a press over an existing event', function () {
    cal._onCalendarMouseDown(
      at(BASE, { mouseEvent: { button: 0, target: chip, clientX: 1, clientY: 1 } })
    );
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal.state.createDrag).toBe(null);
    expect(cal._pendingCreateDrag).toBe(null);
  });

  it('does not begin on a right or middle press', function () {
    cal._onCalendarMouseDown(
      at(BASE, { mouseEvent: { button: 2, target: grid, clientX: 1, clientY: 1 } })
    );
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal.state.createDrag).toBe(null);
  });

  it('does not begin when no calendar can be written to', function () {
    cal.state.calendars = [new Calendar({ id: 'ro', accountId: 'acct-1', readOnly: true } as any)];
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal.state.createDrag).toBe(null);
  });

  it('does not begin off the grid, where there is no time under the pointer', function () {
    cal._onCalendarMouseDown(at(null));
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal.state.createDrag).toBe(null);
  });

  it('leaves a press on an event to the event drag', function () {
    const occurrence = { id: 'e1', start: BASE, end: BASE + 3600, isAllDay: false } as any;
    cal._onEventDragStart(occurrence, {} as any, { mode: 'move' } as any);
    cal._onCalendarMouseDown(at(BASE));
    expect(cal._pendingCreateDrag).toBe(null);
    expect(cal._pendingDragState).not.toBe(null);
  });

  it('follows the pointer once drawing, including back toward where it began', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    cal._onCalendarMouseMove(at(BASE + 7200));
    expect(cal.state.createDrag.currentTime).toBe(BASE + 7200);
    cal._onCalendarMouseMove(at(BASE + 60));
    expect(cal.state.createDrag.currentTime).toBe(BASE + 60);
  });

  it('keeps the drawn range while the pointer crosses a place with no time under it', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    cal._onCalendarMouseMove(at(null));
    expect(cal.state.createDrag.currentTime).toBe(BASE + 3600);
  });

  it('makes an all-day event from a drag across month cells', function () {
    const day = Math.floor(BASE / 86400) * 86400;
    cal._onCalendarMouseDown(at(day, { containerType: 'month-cell' }));
    cal._onCalendarMouseMove(at(day + 86400, { containerType: 'month-cell' }));
    cal._onCalendarMouseUp(at(day + 86400, { containerType: 'month-cell' }));
    expect(cal._openNewEventPopover.mostRecentCall.args[0].isAllDay).toBe(true);
  });

  it('hands the view the range being drawn', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal._renderMainContent().props.newEventPreview).toEqual(
      createNewEventPreview(cal.state.createDrag)
    );
  });
});

describe('opening the editor for a new event', function () {
  const { Actions } = require('mailspring-exports');
  let cal: any;

  beforeEach(function () {
    cal = new MailspringCalendar({} as any);
    cal.state = {
      ...cal.state,
      calendarsLoaded: true,
      calendars: [new Calendar({ id: 'cal-1', accountId: 'acct-1', name: 'Mine' } as any)],
      disabledCalendars: [],
    };
    cal.setState = (next: any) =>
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
    spyOn(Actions, 'openPopover');
  });

  const shown = () => cal._renderMainContent().props.newEventPreview;
  const editor = () => Actions.openPopover.mostRecentCall.args[0];

  const range = {
    startUnix: BASE,
    endUnix: BASE + 3600,
    isAllDay: false,
    clientX: 100,
    clientY: 200,
  };

  it('creates at the slot under the pointer for a double-click or right-click', function () {
    spyOn(cal, '_openNewEventPopover');
    const mouseEvent = { button: 0, clientX: 100, clientY: 200 };
    cal._createEventAt({ time: BASE + 100, containerType: 'day-column', mouseEvent } as any);
    expect(cal._openNewEventPopover).toHaveBeenCalledWith({
      startUnix: BASE,
      endUnix: BASE + DEFAULT_TIMED_EVENT_DURATION_SECONDS,
      isAllDay: false,
      clientX: 100,
      clientY: 200,
    });
  });

  it('anchors the editor at the pointer', function () {
    cal._openNewEventPopover(range);
    const { originRect } = Actions.openPopover.mostRecentCall.args[1];
    expect(originRect.left).toBe(99);
    expect(originRect.top).toBe(199);
  });

  it('keeps the new event on the grid while its editor is open, and drops it when it closes', function () {
    cal._openNewEventPopover(range);
    expect(shown().start).toBe(BASE);
    expect(shown().end).toBe(BASE + 3600);
    expect(shown().calendarId).toBe('cal-1');
    expect(shown().isDragPreview).toBe(true);

    const host = document.createElement('div');
    ReactDOM.render(editor(), host);
    expect(shown()).not.toBe(null);
    ReactDOM.unmountComponentAtNode(host);
    expect(shown()).toBe(null);
  });

  it("keeps the second editor's event when the first editor closes after it opened", function () {
    cal._openNewEventPopover(range);
    const first = editor();
    cal._openNewEventPopover({ ...range, startUnix: BASE + 7200, endUnix: BASE + 10800 });
    first.props.onClosed();
    expect(shown().start).toBe(BASE + 7200);
  });

  it("shows the range being drawn over an open editor's event", function () {
    cal._openNewEventPopover(range);
    cal.state.createDrag = drag({ anchorTime: BASE + 7200, currentTime: BASE + 10800 });
    expect(shown().start).toBe(BASE + 7200);
  });

  it('opens nothing when no calendar can be written to', function () {
    const helpers = require('../internal_packages/main-calendar/lib/core/calendar-helpers');
    spyOn(helpers, 'showNoEditableCalendarsError');
    cal.state.calendars = [new Calendar({ id: 'ro', accountId: 'acct-1', readOnly: true } as any)];
    cal._openNewEventPopover(range);
    expect(helpers.showNoEditableCalendarsError).toHaveBeenCalled();
    expect(Actions.openPopover).not.toHaveBeenCalled();
  });
});

describe('the views draw the range being dragged', function () {
  const dataSource = { buildObservable: () => Rx.Observable.just({ events: [] }) };
  const now = moment();
  const anchor = now.clone().startOf('day').add(10, 'hours').unix();
  const viewProps = (newEventPreview: any): any => ({
    dataSource,
    disabledCalendars: [],
    focusedMoment: now,
    focusedEvent: null,
    selectedEvents: [],
    onChangeView: () => {},
    onChangeFocusedMoment: () => {},
    onCalendarMouseUp: () => {},
    onCalendarMouseDown: () => {},
    onCalendarMouseMove: () => {},
    onCalendarClick: () => {},
    onCalendarDoubleClick: () => {},
    onCalendarContextMenu: () => {},
    onEventClick: () => {},
    onEventDoubleClick: () => {},
    onEventFocused: () => {},
    onEventDragStart: () => {},
    dragState: null,
    newEventPreview,
    readOnlyCalendarIds: new Set(),
    isCalendarReadOnly: () => false,
  });
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const cases: Array<[any, boolean, string]> = [
    [WeekView, false, '.calendar-event.drag-preview'],
    [DayView, false, '.calendar-event.drag-preview'],
    [MonthView, true, '.month-view-event.drag-preview'],
  ];
  for (const [View, isAllDay, selector] of cases) {
    it(`${View.displayName || View.name} draws the new event it is given, and none without one`, function () {
      const preview = createNewEventPreview(
        drag({ anchorTime: anchor, currentTime: anchor + 3600, isAllDay })
      );
      ReactDOM.render(React.createElement(View, viewProps(null)), host);
      expect(host.querySelector(selector)).toBe(null);
      ReactDOM.render(React.createElement(View, viewProps(preview)), host);
      expect(host.querySelector(selector)).not.toBe(null);
    });
  }
});
