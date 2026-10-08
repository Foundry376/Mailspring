import React from 'react';
import ReactDOM from 'react-dom';
import { DatabaseStore, Event } from 'mailspring-exports';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarEvent } from '../internal_packages/main-calendar/lib/core/calendar-event';
import { MonthViewEvent } from '../internal_packages/main-calendar/lib/core/month-view-event';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import * as RecurringEventActions from '../internal_packages/main-calendar/lib/core/recurring-event-actions';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import FocusedMomentStore from '../internal_packages/main-calendar/lib/core/focused-moment-store';

const START = Date.UTC(2026, 8, 22, 13, 0, 0) / 1000;
const QUARTER = 900;

const stamp = (unix: number) =>
  new Date(unix * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const icsAt = (start: number, rrule?: string) => {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:standup@test',
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + 1800)}`,
    ...(rrule ? [rrule] : []),
    'SUMMARY:Standup',
    'DTSTAMP:20260901T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

const eventAt = (start: number, rrule?: string) =>
  new Event({
    id: 'standup',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'standup@test',
    ics: icsAt(start, rrule),
    recurrenceStart: start,
    recurrenceEnd: start + 1800,
  } as any);

// A series from `first` whose `slot` occurrence was moved to `movedTo`, stored inline as an exception.
const seriesWithException = (first: number, rrule: string, slot: number, movedTo: number) => {
  const series = eventAt(first, rrule);
  series.ics = series.ics.replace(
    'END:VCALENDAR',
    [
      'BEGIN:VEVENT',
      'UID:standup@test',
      `RECURRENCE-ID:${stamp(slot)}`,
      `DTSTART:${stamp(movedTo)}`,
      `DTEND:${stamp(movedTo + 1800)}`,
      'SUMMARY:Standup',
      'DTSTAMP:20260901T000000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
  );
  return series;
};

const occurrenceAt = (start: number, over: Partial<TimedOccurrence> = {}): TimedOccurrence =>
  ({
    id: `standup-e${start}`,
    accountId: 'a',
    calendarId: 'c',
    title: 'Standup',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    isMine: true,
    organizer: null,
    attendees: [],
    start,
    end: start + 1800,
    ...over,
  }) as TimedOccurrence;

function calendarWith(selected: TimedOccurrence[]) {
  const calendar: any = new MailspringCalendar({} as any);
  calendar.setState = (update: object) => Object.assign(calendar.state, update);
  calendar.state.selectedEvents = selected;
  calendar.state.calendarsLoaded = true;
  return calendar;
}

// The key handlers start the move without awaiting it; the spec clock is mocked, so let the
// promise chain run rather than waiting on a timer.
async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('the selection after an event is moved', function () {
  let modify: jasmine.Spy;
  let row: Event;

  beforeEach(function () {
    row = eventAt(START);
    spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(row));
    modify = spyOn(RecurringEventActions, 'modifyEventWithRecurringSupport').andReturn(
      Promise.resolve({ success: true })
    );
  });

  it('follows a keyboard move to the id the moved occurrence is drawn under', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);

    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);

    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual([`standup-e${START + QUARTER}`]);
  });

  it('stays where it was when the move is cancelled', async function () {
    modify.andReturn(Promise.resolve({ success: false, cancelled: true }));
    const calendar = calendarWith([occurrenceAt(START)]);

    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);

    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual([`standup-e${START}`]);
  });

  it('follows a drag of the selected event', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);

    await calendar._persistDragChange({
      event: occurrenceAt(START),
      mode: 'move',
      previewStart: START + 3600,
      previewEnd: START + 5400,
      previewIsAllDay: false,
    });

    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual([`standup-e${START + 3600}`]);
  });

  it('leaves the selection alone when the dragged event was not selected', async function () {
    const selection = [occurrenceAt(START, { id: 'other-e1' })];
    const calendar = calendarWith(selection);

    await calendar._persistDragChange({
      event: occurrenceAt(START),
      mode: 'move',
      previewStart: START + 3600,
      previewEnd: START + 5400,
      previewIsAllDay: false,
    });

    expect(calendar.state.selectedEvents).toBe(selection);
    expect(calendar._pendingMoves.size).toBe(0);
  });

  it('stays where it was when a drag is cancelled', async function () {
    modify.andReturn(Promise.resolve({ success: false, cancelled: true }));
    const calendar = calendarWith([occurrenceAt(START)]);

    await calendar._persistDragChange({
      event: occurrenceAt(START),
      mode: 'move',
      previewStart: START + 3600,
      previewEnd: START + 5400,
      previewIsAllDay: false,
    });

    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual([`standup-e${START}`]);
  });

  it('settles a drag of several days once it syncs', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    const moved = START + 3 * 86400;
    await calendar._persistDragChange({
      event: occurrenceAt(START),
      mode: 'move',
      previewStart: moved,
      previewEnd: moved + 1800,
      previewIsAllDay: false,
    });
    row = eventAt(moved);

    await calendar._refreshSelectedEvents();

    expect(calendar.state.selectedEvents.map((o) => [o.id, o.start])).toEqual([
      [`standup-e${moved}`, moved],
    ]);
    expect(calendar._pendingMoves.size).toBe(0);
  });

  it('settles on the moved occurrence, not one of the series already at its new start', async function () {
    const wednesday = START + 86400;
    row = eventAt(START - 86400, 'RRULE:FREQ=DAILY');
    const calendar = calendarWith([occurrenceAt(wednesday, { isRecurring: true })]);
    await calendar._applyKeyboardEventChange(
      occurrenceAt(wednesday, { isRecurring: true }),
      -86400,
      false
    );
    // "This occurrence": Wednesday's slot now holds an exception on Tuesday, at Tuesday's own time.
    row = seriesWithException(START - 86400, 'RRULE:FREQ=DAILY', wednesday, START);

    await calendar._refreshSelectedEvents();

    const [selected] = calendar.state.selectedEvents;
    expect(selected.isException).toBe(true);
    expect(selected.recurrenceIdStart).toBe(wednesday);
  });

  it('keeps the regular occurrence selected when a moved one shares its id', async function () {
    // Monday moved onto Tuesday: the expander emits Monday's slot first.
    row = seriesWithException(START - 86400, 'RRULE:FREQ=DAILY', START - 86400, START);
    const tuesday = occurrenceAt(START, { isRecurring: true });
    const calendar = calendarWith([tuesday]);

    await calendar._refreshSelectedEvents();

    const [selected] = calendar.state.selectedEvents;
    expect(selected.isException).toBe(false);
    expect(selected.recurrenceIdStart).toBeUndefined();
  });

  it('settles one occurrence moved earlier than the next regular one', async function () {
    const inThreeWeeks = START + 21 * 86400;
    const friday = START + 10 * 86400;
    row = eventAt(START, 'RRULE:FREQ=WEEKLY');
    const calendar = calendarWith([occurrenceAt(inThreeWeeks, { isRecurring: true })]);
    await calendar._persistDragChange({
      event: occurrenceAt(inThreeWeeks, { isRecurring: true }),
      mode: 'move',
      previewStart: friday,
      previewEnd: friday + 1800,
      previewIsAllDay: false,
    });
    // Week two's regular occurrence lies past Friday, and the expander stops there.
    row = seriesWithException(START, 'RRULE:FREQ=WEEKLY', inThreeWeeks, friday);

    await calendar._refreshSelectedEvents();

    const [selected] = calendar.state.selectedEvents;
    expect(selected.id).toBe(`standup-e${friday}`);
    expect(selected.recurrenceIdStart).toBe(inThreeWeeks);
  });

  it('drops the selection when the move lands somewhere other than predicted', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);
    row = eventAt(START + 2 * QUARTER);

    await calendar._refreshSelectedEvents();

    expect(calendar.state.selectedEvents).toEqual([]);
    expect(calendar._pendingMoves.size).toBe(0);
  });

  it('lets an event dragged while unselected be moved by keyboard once it is selected', async function () {
    const calendar = calendarWith([]);
    calendar.state.view = CalendarView.WEEK;
    await calendar._persistDragChange({
      event: occurrenceAt(START),
      mode: 'move',
      previewStart: START + 3600,
      previewEnd: START + 5400,
      previewIsAllDay: false,
    });
    modify.reset();

    calendar.state.selectedEvents = [occurrenceAt(START + 3600)];
    calendar._onMoveSelectedEvent('down', false);
    await settle();

    expect(modify).toHaveBeenCalled();
  });

  it('keeps the id of a series exception stored as its own row', async function () {
    row = eventAt(START);
    row.recurrenceId = '20260922T130000Z';
    const calendar = calendarWith([occurrenceAt(START, { id: 'standup-e0', isException: true })]);

    await calendar._applyKeyboardEventChange(
      occurrenceAt(START, { id: 'standup-e0', isException: true }),
      QUARTER,
      false
    );

    expect(calendar.state.selectedEvents.map((o) => o.id)).toEqual(['standup-e0']);
  });

  it('ignores the next arrow key until the move has synced back', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    calendar.state.view = CalendarView.WEEK;
    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);
    modify.reset();

    calendar._onMoveSelectedEvent('down', false);
    await settle();

    expect(modify).not.toHaveBeenCalled();
  });

  it('ignores Delete until the move has synced back', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);
    const dialog = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync');

    await calendar._onDeleteSelectedEvents();

    expect(dialog).not.toHaveBeenCalled();
  });

  it('switches view to where the event moved to, before it has synced back', async function () {
    spyOn(AppEnv.config, 'set');
    const calendar = calendarWith([occurrenceAt(START)]);
    await calendar._applyKeyboardEventChange(occurrenceAt(START), 86400, false);

    calendar.onChangeView(CalendarView.DAY);

    expect(FocusedMomentStore.focusedMoment().unix()).toBe(START + 86400);
  });

  it('takes the moved occurrence from the row once it syncs, and moves on from there', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);
    row = eventAt(START + QUARTER);

    await calendar._refreshSelectedEvents();
    const [selected] = calendar.state.selectedEvents;
    expect(selected.id).toBe(`standup-e${START + QUARTER}`);
    expect(selected.start).toBe(START + QUARTER);

    modify.reset();
    calendar.state.view = CalendarView.WEEK;
    calendar._onMoveSelectedEvent('down', false);
    await settle();
    expect(modify.mostRecentCall.args[0].newStart).toBe(START + 2 * QUARTER);
  });

  it('forgets the move once the event is deselected, so the moved event moves when selected again', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    calendar.state.view = CalendarView.WEEK;
    await calendar._applyKeyboardEventChange(occurrenceAt(START), QUARTER, false);
    calendar.state.selectedEvents = [];
    row = eventAt(START + QUARTER);
    calendar._onDatabaseChange({ objectClass: 'Event' });
    modify.reset();

    calendar.state.selectedEvents = [occurrenceAt(START + QUARTER)];
    calendar._onMoveSelectedEvent('down', false);
    await settle();

    expect(modify).toHaveBeenCalled();
  });

  it('keeps waiting while the row is unchanged, though a daily series already has an occurrence at the new start', async function () {
    row = eventAt(START, 'RRULE:FREQ=DAILY');
    const daily = occurrenceAt(START, { isRecurring: true });
    const calendar = calendarWith([daily]);
    calendar.state.view = CalendarView.WEEK;
    await calendar._applyKeyboardEventChange(daily, 86400, false);

    await calendar._refreshSelectedEvents();
    modify.reset();
    calendar._onMoveSelectedEvent('right', false);
    await settle();

    expect(modify).not.toHaveBeenCalled();
  });

  it('keeps the selection a click made while the rows were being read', async function () {
    const calendar = calendarWith([occurrenceAt(START)]);
    const clicked = occurrenceAt(START, { id: 'other-e1' });
    const refresh = calendar._refreshSelectedEvents();
    calendar.state.selectedEvents = [clicked];

    await refresh;

    expect(calendar.state.selectedEvents).toEqual([clicked]);
  });
});

const FOCUS_CASES = [
  {
    name: 'CalendarEvent',
    component: CalendarEvent,
    props: {
      order: 1,
      concurrentEvents: 1,
      fixedSize: -1,
      direction: 'vertical',
      scopeStart: Date.UTC(2026, 8, 22, 0, 0, 0) / 1000,
      scopeEnd: Date.UTC(2026, 8, 23, 0, 0, 0) / 1000,
    },
  },
  { name: 'MonthViewEvent', component: MonthViewEvent, props: {} },
];

FOCUS_CASES.forEach(({ name, component, props }) => {
  describe(`a ${name} that becomes selected`, function () {
    let host: HTMLElement;
    const render = (selected: boolean) =>
      ReactDOM.render(
        React.createElement(component as any, {
          ...props,
          event: occurrenceAt(START),
          focused: false,
          selected,
          onClick: () => {},
          onDoubleClick: () => {},
          onFocused: () => {},
        }),
        host
      );

    beforeEach(function () {
      (document.activeElement as HTMLElement | null)?.blur();
      host = document.createElement('div');
      document.body.appendChild(host);
    });

    afterEach(function () {
      ReactDOM.unmountComponentAtNode(host);
      host.remove();
    });

    it('takes the focus when drawn selected, as a moved event is', function () {
      render(true);
      expect(document.activeElement).toBe(host.firstElementChild);
    });

    it('takes the focus when it becomes selected', function () {
      render(false);
      render(true);
      expect(document.activeElement).toBe(host.firstElementChild);
    });

    it('leaves the focus alone when it is not selected', function () {
      render(false);
      expect(document.activeElement).toBe(document.body);
    });

    it('does not take the focus from a field', function () {
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      try {
        render(true);
        expect(document.activeElement).toBe(field);
      } finally {
        field.remove();
      }
    });
  });
});
