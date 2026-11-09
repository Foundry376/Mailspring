import {
  createDragRange,
  createNewEventPreview,
  withNewEventPreview,
  CREATE_DRAG_SNAP_SECONDS,
} from '../internal_packages/main-calendar/lib/core/calendar-drag-utils';
import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import * as CalendarDateUtils from '../src/calendar-date';
import { Calendar } from '../src/flux/models/calendar';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import FocusedMomentStore from '../internal_packages/main-calendar/lib/core/focused-moment-store';
import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { DEFAULT_TIMED_EVENT_DURATION_SECONDS } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
import { calendarViewProps } from './fixtures/calendar-view-props';

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
    spyOn(cal, '_openNewEvent');
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

  it('opens the new event over the drawn range on release, and eats the click that follows', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600 + 100));
    cal._onCalendarMouseUp(at(BASE + 3600 + 100));
    expect(cal.state.createDrag).toBe(null);
    expect(cal._openNewEvent).toHaveBeenCalledWith({
      startUnix: BASE,
      endUnix: BASE + 3600,
      isAllDay: false,
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
    const call = cal._openNewEvent.mostRecentCall.args[0];
    expect(call.startUnix).toBe(BASE);
    expect(call.endUnix).toBe(BASE + 3600);
  });

  it('treats a press that never travelled as a click: no event, and the click stays live', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 60));
    cal._onCalendarMouseUp(at(BASE + 60));
    expect(cal._openNewEvent).not.toHaveBeenCalled();
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
    const call = cal._openNewEvent.mostRecentCall.args[0];
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
    expect(cal._openNewEvent.mostRecentCall.args[0].isAllDay).toBe(true);
  });

  it('hands the view the range being drawn', function () {
    cal._onCalendarMouseDown(at(BASE));
    cal._onCalendarMouseMove(at(BASE + 3600));
    expect(cal._renderMainContent().props.newEventPreview).toEqual(
      createNewEventPreview(cal.state.createDrag)
    );
  });
});

describe('a new event in the panel', function () {
  const { Actions, TaskQueue } = require('mailspring-exports');
  const UnsentChangeDialog = require('../internal_packages/main-calendar/lib/core/unsent-change-dialog');
  let cal: any;
  let dialog: jasmine.Spy;

  // Stubbed, so a leave that wrongly reaches the held-change dialog fails rather than waits.
  beforeEach(function () {
    dialog = spyOn(UnsentChangeDialog, 'showUnsentChangeDialog').andReturn('discard');
    cal = new MailspringCalendar({} as any);
    cal.state = {
      ...cal.state,
      calendarsLoaded: true,
      calendars: [
        new Calendar({ id: 'cal-1', accountId: 'acct-1', name: 'Mine' } as any),
        new Calendar({ id: 'cal-2', accountId: 'acct-2', name: 'Work' } as any),
      ],
      disabledCalendars: [],
    };
    cal.setState = (next: any) =>
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
    spyOn(Actions, 'queueTask');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(AppEnv.config, 'set');
  });

  const shown = () => cal._renderMainContent().props.newEventPreview;
  const panel = () => cal._renderAgendaPanel().props.children.props.children[1];
  const dateOf = (unix: number) => CalendarDateUtils.calendarDateFromUnix(unix);
  const range = { startUnix: BASE, endUnix: BASE + 3600, isAllDay: false };
  const change = (extra: any = {}) => ({
    eventId: cal.state.newEvent.occurrence.id,
    edits: [],
    ...extra,
  });
  const titled = (title = 'Interview', extra: any = {}) =>
    change({ edits: [{ property: 'summary', value: title }], ...extra });
  const created = () => Actions.queueTask.calls.map((c) => c.args[0]);

  it('creates at the slot under the pointer for a double-click or right-click', function () {
    spyOn(cal, '_openNewEvent');
    const mouseEvent = { button: 0, clientX: 100, clientY: 200 };
    cal._createEventAt({ time: BASE + 100, containerType: 'day-column', mouseEvent } as any);
    expect(cal._openNewEvent).toHaveBeenCalledWith({
      startUnix: BASE,
      endUnix: BASE + DEFAULT_TIMED_EVENT_DURATION_SECONDS,
      isAllDay: false,
    });
  });

  it('shows the new event in the panel, opening it, and draws it on the grid', function () {
    cal.state.agendaOpen = false;
    cal._openNewEvent(range);
    expect(cal.state.agendaOpen).toBe(true);
    expect(panel().props.event).toBe(cal.state.newEvent.occurrence);
    expect(panel().props.isNewEvent).toBe(true);
    expect(panel().props.onDiscard).toBe(cal._dropNewEvent);
    expect(panel().props.calendarChoices.map((c) => c.id)).toEqual(['cal-1', 'cal-2']);
    expect(shown().start).toBe(BASE);
    expect(shown().end).toBe(BASE + 3600);
    expect(shown().calendarId).toBe('cal-1');
    expect(shown().isDragPreview).toBe(true);
  });

  it('draws an all-day event opened from the grid as the one day its range covers', function () {
    const dayStart = CalendarDateUtils.dayStartUnix(dateOf(BASE));
    const nextDayStart = CalendarDateUtils.nextDayStartUnix(dateOf(BASE));
    cal._openNewEvent({ startUnix: dayStart, endUnix: nextDayStart, isAllDay: true });
    expect(shown().isAllDay).toBe(true);
    expect(shown().endDate).toEqual(dateOf(BASE));
  });

  it('draws the title and times the panel holds for it', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(
      titled('Standup', { times: { start: BASE + 1800, end: BASE + 5400, isAllDay: false } })
    );
    expect(shown().title).toBe('Standup');
    expect(shown().start).toBe(BASE + 1800);
    expect(shown().end).toBe(BASE + 5400);
  });

  it('recolours the new event when the panel picks another calendar, and creates it there', function () {
    cal._openNewEvent(range);
    cal._onNewEventCalendarChange(cal.state.calendars[1]);
    expect(shown().calendarId).toBe('cal-2');
    cal._onUnsentChange(titled());
    cal._onBackToAgenda();
    expect(created().length).toBe(1);
    expect(created()[0].calendarId).toBe('cal-2');
    expect(created()[0].accountId).toBe('acct-2');
  });

  it("shows the range being drawn over the panel's new event", function () {
    cal._openNewEvent(range);
    cal.state.createDrag = drag({ anchorTime: BASE + 7200, currentTime: BASE + 10800 });
    expect(shown().start).toBe(BASE + 7200);
  });

  it('opens nothing when no calendar can be written to', function () {
    const helpers = require('../internal_packages/main-calendar/lib/core/calendar-helpers');
    spyOn(helpers, 'showNoEditableCalendarsError');
    cal.state.calendars = [new Calendar({ id: 'ro', accountId: 'acct-1', readOnly: true } as any)];
    cal._openNewEvent(range);
    expect(helpers.showNoEditableCalendarsError).toHaveBeenCalled();
    expect(cal.state.newEvent).toBe(null);
  });

  it('creates it on leaving once it has a title, with no question', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(titled());
    cal._onCalendarClick({ time: BASE } as any);
    expect(dialog).not.toHaveBeenCalled();
    expect(created().length).toBe(1);
    expect(created()[0].event.title).toBe('Interview');
    expect(cal.state.newEvent).toBe(null);
    expect(shown()).toBe(null);
  });

  it('opens a quick-added event over its times with its title held, so leaving creates it', function () {
    spyOn(FocusedMomentStore, 'setFocusedMoment');
    cal._onOpenNewCalendarEvent({ title: 'Interview', start: BASE, end: BASE + 3600 });
    const { draft } = cal.state.newEvent;
    expect([draft.start, draft.end, draft.isAllDay]).toEqual([BASE, BASE + 3600, false]);
    cal._onCalendarClick({ time: BASE } as any);
    expect(created().length).toBe(1);
    expect(created()[0].event.title).toBe('Interview');
  });

  it('drops it on leaving without a title or invitee, whatever else was changed', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(
      change({
        times: { start: BASE + 1800, end: BASE + 5400, isAllDay: false },
        edits: [{ property: 'location', value: 'Room 4' }],
      })
    );
    cal._onBackToAgenda();
    expect(Actions.queueTask).not.toHaveBeenCalled();
    expect(cal.state.newEvent).toBe(null);
  });

  it('drops it from Delete, title and all, creating nothing', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(titled());
    panel().props.onDelete();
    expect(Actions.queueTask).not.toHaveBeenCalled();
    expect(cal.state.newEvent).toBe(null);
    expect(cal.state.unsentChange).toBe(null);
  });

  it('creates the one being made before opening the next', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(titled());
    const first = cal.state.newEvent.occurrence.id;
    cal._openNewEvent({ ...range, startUnix: BASE + 7200, endUnix: BASE + 10800 });
    expect(created().length).toBe(1);
    expect(cal.state.newEvent.occurrence.id).not.toBe(first);
    expect(cal.state.unsentChange).toBe(null);
  });

  describe('with invitees', function () {
    const guest = { email: 'alex@example.com', name: 'Alex' };
    const invited = () => titled('Interview', { attendees: { added: [guest], removed: [] } });

    it('asks before leaving, and Send creates it with the guests, even untitled', function () {
      dialog.andReturn('send');
      cal._openNewEvent(range);
      cal._onUnsentChange(change({ attendees: { added: [guest], removed: [] } }));
      cal._onBackToAgenda();
      expect(dialog.mostRecentCall.args[2].invitations).toBe(true);
      expect(created().length).toBe(1);
      expect(created()[0].event.ics).toContain('ATTENDEE');
      expect(created()[0].event.ics).toContain('alex@example.com');
    });

    it('sends the invitations from the card and shows the event once the server has it', async function () {
      spyOn(TaskQueue, 'waitForPerformRemote').andReturn(Promise.resolve());
      spyOn(Actions, 'focusCalendarEvent');
      cal._openNewEvent(range);
      cal._onUnsentChange(invited());
      cal._sendUnsentChange();
      expect(created()[0].event.ics).toContain('alex@example.com');
      expect(cal.state.newEvent).toBe(null);
      expect(cal.state.unsentChange).toBe(null);
      await Promise.resolve();
      expect(Actions.focusCalendarEvent.mostRecentCall.args[0].id).toBe(created()[0].event.id);
    });

    it('leaves a new event opened before the server has the first one alone', async function () {
      let written: () => void;
      spyOn(TaskQueue, 'waitForPerformRemote').andReturn(new Promise<void>((r) => (written = r)));
      spyOn(Actions, 'focusCalendarEvent');
      cal._openNewEvent(range);
      cal._onUnsentChange(invited());
      cal._sendUnsentChange();
      cal._openNewEvent({ ...range, startUnix: BASE + 7200, endUnix: BASE + 10800 });
      written();
      await Promise.resolve();
      expect(Actions.focusCalendarEvent).not.toHaveBeenCalled();
      expect(cal.state.newEvent).not.toBe(null);
    });

    it('creates nothing when the user discards', function () {
      dialog.andReturn('discard');
      cal._openNewEvent(range);
      cal._onUnsentChange(invited());
      cal._onBackToAgenda();
      expect(Actions.queueTask).not.toHaveBeenCalled();
      expect(cal.state.newEvent).toBe(null);
    });

    it('stays when the user keeps editing', function () {
      dialog.andReturn('keep-editing');
      cal._openNewEvent(range);
      cal._onUnsentChange(invited());
      cal._onBackToAgenda();
      expect(Actions.queueTask).not.toHaveBeenCalled();
      expect(cal.state.newEvent).not.toBe(null);
    });

    it('asks on quitting without Keep editing, and waits for the event to be written', function () {
      dialog.andReturn('send');
      cal._openNewEvent(range);
      cal._onUnsentChange(invited());
      expect(cal._onBeforeUnload(() => {})).toBe(false);
      expect(dialog.mostRecentCall.args[2].canKeepEditing).toBe(false);
      expect(created().length).toBe(1);
    });
  });

  it('saves the field being typed before deciding', function () {
    cal._openNewEvent(range);
    cal._eventPanel = {
      current: { focusTitle: () => {}, commitEdits: () => cal._onUnsentChange(titled()) },
    };
    cal._onBackToAgenda();
    expect(created().length).toBe(1);
  });

  it("leaves Enter's edit-the-selection to selected events", function () {
    cal._openNewEvent(range);
    spyOn(cal, '_editEvent');
    cal._onEditSelectedEvent();
    expect(cal._editEvent).not.toHaveBeenCalled();
    expect(cal.state.newEvent).not.toBe(null);
  });

  it('creates a titled one on quitting', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(titled());
    expect(cal._onBeforeUnload(() => {})).toBe(false);
    expect(created().length).toBe(1);
  });

  it('creates it on Esc once it has a title, as leaving does', function () {
    cal._openNewEvent(range);
    cal._onUnsentChange(titled());
    cal.render().props.children.props.localHandlers['core:pop-sheet']();
    expect(created().length).toBe(1);
    expect(created()[0].event.title).toBe('Interview');
  });

  it('still waits on quitting for an update being sent when a new event is open', function () {
    cal._sending = { change: {}, done: new Promise(() => {}) };
    cal._openNewEvent(range);
    expect(cal._onBeforeUnload(() => {})).toBe(false);
  });

  it('lets the window close at once when there is nothing to create', function () {
    cal._openNewEvent(range);
    expect(cal._onBeforeUnload(() => {})).toBe(true);
    expect(Actions.queueTask).not.toHaveBeenCalled();
  });
});

describe('the views draw the range being dragged', function () {
  const now = moment();
  const anchor = now.clone().startOf('day').add(10, 'hours').unix();
  const viewProps = (newEventPreview: any) =>
    calendarViewProps({ focusedMoment: now, newEventPreview });
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const cases: Array<[string, any, object, boolean, string]> = [
    ['Week view', TimeGridView, { visibleDays: 7 }, false, '.calendar-event.drag-preview'],
    ['Day view', TimeGridView, { visibleDays: 1 }, false, '.calendar-event.drag-preview'],
    ['Month view', MonthView, {}, true, '.month-view-event.drag-preview'],
  ];
  for (const [name, View, viewOptions, isAllDay, selector] of cases) {
    it(`${name} draws the new event it is given, and none without one`, function () {
      const preview = createNewEventPreview(
        drag({ anchorTime: anchor, currentTime: anchor + 3600, isAllDay })
      );
      ReactDOM.render(React.createElement(View, { ...viewProps(null), ...viewOptions }), host);
      expect(host.querySelector(selector)).toBe(null);
      ReactDOM.render(React.createElement(View, { ...viewProps(preview), ...viewOptions }), host);
      expect(host.querySelector(selector)).not.toBe(null);
    });
  }
});
