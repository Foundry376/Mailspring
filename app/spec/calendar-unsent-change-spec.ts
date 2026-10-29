import {
  Actions,
  CalendarUtils,
  DatabaseStore,
  Event,
  TaskQueue,
  WorkspaceStore,
} from 'mailspring-exports';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import * as UnsentChangeDialog from '../internal_packages/main-calendar/lib/core/unsent-change-dialog';
import { withUnsentChange } from '../internal_packages/main-calendar/lib/core/unsent-change';
import * as RecurringEventDialog from '../internal_packages/main-calendar/lib/core/recurring-event-dialog';

const START = Date.UTC(2026, 9, 27, 15, 0, 0) / 1000;
const HOUR = 3600;
const QUARTER = 900;

const stamp = (unix: number) =>
  new Date(unix * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const row = new Event({
  id: 'e1',
  accountId: 'a',
  calendarId: 'c',
  icsuid: 'e1@test',
  ics: [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:e1@test',
    `DTSTART:${stamp(START)}`,
    `DTEND:${stamp(START + HOUR)}`,
    'SUMMARY:Interview',
    'DTSTAMP:20261001T000000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
  recurrenceStart: START,
  recurrenceEnd: START + HOUR,
} as any);

const you = { email: 'you@example.com', name: 'You', status: 'ACCEPTED' };

const occurrence = (attendees: any[]): TimedOccurrence =>
  ({
    id: CalendarUtils.occurrenceId('e1', START),
    accountId: 'a',
    calendarId: 'c',
    title: 'Interview',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    isMine: true,
    organizer: { email: you.email },
    attendees,
    start: START,
    end: START + HOUR,
  }) as TimedOccurrence;

const withGuests = occurrence([you, { email: 'alex@example.com', status: 'NEEDS-ACTION' }]);
const withoutGuests = occurrence([]);

const droppedAt = (event: TimedOccurrence, start: number) =>
  ({
    mode: 'move',
    event,
    isDragging: true,
    originalStart: event.start,
    originalEnd: event.end,
    previewStart: start,
    previewEnd: start + HOUR,
    previewIsAllDay: false,
  }) as any;

function calendarWith(selected: TimedOccurrence[]) {
  const calendar: any = new MailspringCalendar({} as any);
  calendar.setState = (update: object | ((state: object) => object | null)) =>
    Object.assign(calendar.state, typeof update === 'function' ? update(calendar.state) : update);
  calendar.state.selectedEvents = selected;
  calendar.state.calendarsLoaded = true;
  calendar.state.readOnlyCalendarIds = new Set();
  calendar.state.view = CalendarView.WEEK;
  return calendar;
}

// The real componentDidMount, with what it reaches beyond the listeners stubbed.
function mount(calendar: any) {
  spyOn(calendar, '_subscribeToCalendars').andReturn({ dispose: () => {} });
  spyOn(calendar, '_publishCalendarOptions');
  spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
  spyOn(AppEnv.themes, 'onDidChangeActiveThemes').andReturn({ dispose: () => {} });
  calendar.componentDidMount();
}

// The key handlers start the move without awaiting it, and the spec clock is mocked.
async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('moving an event with guests', function () {
  let queueTask: jasmine.Spy;

  beforeEach(function () {
    queueTask = spyOn(Actions, 'queueTask');
    spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(new Event(row.toJSON())));
    spyOn(AppEnv.config, 'set');
  });

  it('holds a drop until Send update, and opens the panel on the event', async function () {
    const calendar = calendarWith([]);
    calendar.state.agendaOpen = false;

    await calendar._persistDragChange(droppedAt(withGuests, START + HOUR));

    expect(queueTask).not.toHaveBeenCalled();
    expect(calendar.state.unsentChange).toEqual({
      eventId: 'e1',
      edits: [],
      times: { start: START + HOUR, end: START + 2 * HOUR, isAllDay: false },
    });
    expect(calendar.state.selectedEvents).toEqual([withGuests]);
    expect(calendar.state.agendaOpen).toBe(true);
  });

  it('still saves a drop of an event without guests', async function () {
    const calendar = calendarWith([]);

    await calendar._persistDragChange(droppedAt(withoutGuests, START + HOUR));

    expect(queueTask.calls.length).toBe(1);
    expect(queueTask.calls[0].args[0].event.recurrenceStart).toBe(START + HOUR);
    expect(calendar.state.unsentChange).toBe(null);
  });

  it('holds arrow-key moves, each starting from the held time', async function () {
    const calendar = calendarWith([withGuests]);

    calendar._onMoveSelectedEvent('down', false);
    await settle();
    calendar._onMoveSelectedEvent('down', false);
    await settle();

    expect(queueTask).not.toHaveBeenCalled();
    expect(calendar.state.unsentChange.times).toEqual({
      start: START + 2 * QUARTER,
      end: START + HOUR + 2 * QUARTER,
      isAllDay: false,
    });
  });
});

describe('Cmd+Z while a change is held', function () {
  let calendar: any;
  let windowUndo: jasmine.Spy;
  let button: HTMLButtonElement;
  let field: HTMLInputElement;

  const undoFrom = (target: HTMLElement) =>
    target.dispatchEvent(new CustomEvent('core:undo', { bubbles: true }));

  beforeEach(function () {
    calendar = calendarWith([withGuests]);
    mount(calendar);
    windowUndo = jasmine.createSpy('windowUndo');
    document.body.addEventListener('core:undo', windowUndo);
    button = document.body.appendChild(document.createElement('button'));
    field = document.body.appendChild(document.createElement('input'));
  });

  afterEach(function () {
    calendar.componentWillUnmount();
    document.body.removeEventListener('core:undo', windowUndo);
    button.remove();
    field.remove();
  });

  it('does nothing outside a text field', function () {
    calendar.state.unsentChange = { eventId: 'e1', edits: [{ property: 'summary', value: 'X' }] };
    undoFrom(button);
    expect(windowUndo).not.toHaveBeenCalled();
  });

  it('still undoes typing in a text field', function () {
    calendar.state.unsentChange = { eventId: 'e1', edits: [{ property: 'summary', value: 'X' }] };
    undoFrom(field);
    expect(windowUndo).toHaveBeenCalled();
  });

  it('undoes as usual with nothing held', function () {
    undoFrom(button);
    expect(windowUndo).toHaveBeenCalled();
  });
});

describe('leaving an event with a held change', function () {
  const held = {
    eventId: 'e1',
    edits: [],
    times: { start: START + HOUR, end: START + 2 * HOUR, isAllDay: false },
  };
  let queueTask: jasmine.Spy;
  let dialog: jasmine.Spy;
  let find: jasmine.Spy;
  let calendar: any;

  beforeEach(function () {
    queueTask = spyOn(Actions, 'queueTask');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    find = spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(new Event(row.toJSON())));
    spyOn(AppEnv.config, 'set');
    dialog = spyOn(UnsentChangeDialog, 'showUnsentChangeDialog');
    calendar = calendarWith([withGuests]);
    calendar.state.unsentChange = held;
  });

  it("drops the change on the dialog's Discard, queueing nothing", async function () {
    dialog.andReturn('discard');
    calendar._onBackToAgenda();
    await settle();

    expect(queueTask).not.toHaveBeenCalled();
    expect(calendar.state.unsentChange).toBe(null);
    expect(calendar.state.selectedEvents).toEqual([]);
  });

  it("queues the held change on the dialog's Send update", async function () {
    dialog.andReturn('send');
    calendar._onBackToAgenda();
    await settle();

    expect(queueTask.calls.length).toBe(1);
    expect(queueTask.calls[0].args[0].event.recurrenceStart).toBe(START + HOUR);
    expect(calendar.state.selectedEvents).toEqual([]);
    expect(calendar.state.unsentChange).toBe(null);
  });

  it('stays on the event on Keep editing', function () {
    dialog.andReturn('keep-editing');
    const other = { ...withoutGuests, id: CalendarUtils.occurrenceId('e2', START) };
    calendar._select([other]);

    expect(queueTask).not.toHaveBeenCalled();
    expect(calendar.state.selectedEvents).toEqual([withGuests]);
    expect(calendar.state.unsentChange).toBe(held);
  });

  it('asks before switching sections, and Keep editing stays', function () {
    const calendarSection = { id: 'SpecCalendar', root: true, supportedModes: ['list'] } as any;
    const mailSection = { id: 'SpecMail', root: true, supportedModes: ['list'] } as any;
    const saved = WorkspaceStore.sheetStack().slice();
    spyOn(WorkspaceStore, 'trigger');
    WorkspaceStore._onSelectRootSheet(calendarSection);
    mount(calendar);
    dialog.andReturn('keep-editing');
    try {
      WorkspaceStore._onSelectRootSheet(mailSection);
      expect(dialog).toHaveBeenCalled();
      expect(WorkspaceStore.rootSheet()).toBe(calendarSection);
    } finally {
      calendar.componentWillUnmount();
      (WorkspaceStore as any)._sheetStack = saved;
    }
  });

  it('drops the change once its event is gone, without asking', async function () {
    find.andReturn(Promise.resolve(null));
    await calendar._refreshSelectedEvents();

    expect(calendar.state.selectedEvents).toEqual([]);
    expect(calendar.state.unsentChange).toBe(null);
    expect(dialog).not.toHaveBeenCalled();
  });
});

describe('editing in the panel', function () {
  let queueTask: jasmine.Spy;
  let onUnsentChange: jasmine.Spy;

  const panelFor = (event: TimedOccurrence, unsentChange = null) => {
    const panel: any = new EventPanel({
      event,
      isCalendarReadOnly: false,
      onBack: () => {},
      unsentChange,
      onUnsentChange,
      onSendUnsentChange: () => {},
      onSaveChange: (change) => calendarWith([event])._writeChange(change),
    });
    panel.setState = (update: object) => Object.assign(panel.state, update);
    return panel;
  };

  beforeEach(function () {
    queueTask = spyOn(Actions, 'queueTask');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(DatabaseStore, 'find').andCallFake(() => Promise.resolve(new Event(row.toJSON())));
    onUnsentChange = jasmine.createSpy('onUnsentChange');
  });

  it('holds a title change to an event with guests, queueing nothing', async function () {
    const panel = panelFor(withGuests);
    panel._saveProperty({ property: 'summary', value: 'Interview with Alex' });
    await panel._saving;

    expect(queueTask).not.toHaveBeenCalled();
    expect(onUnsentChange).toHaveBeenCalledWith({
      eventId: 'e1',
      edits: [{ property: 'summary', value: 'Interview with Alex' }],
    });
  });

  it('drops a held title once it is changed back to the stored one', function () {
    const held = { eventId: 'e1', edits: [{ property: 'summary', value: 'Interview with Alex' }] };
    const panel = panelFor(withGuests, held);
    panel._saveProperty({ property: 'summary', value: 'Interview' });

    expect(onUnsentChange).toHaveBeenCalledWith(null);
  });

  it('saves a title change to an event without guests straight away', async function () {
    const panel = panelFor(withoutGuests);
    panel._saveProperty({ property: 'summary', value: 'Interview with Alex' });
    await panel._saving;

    expect(queueTask.calls.length).toBe(1);
    expect(onUnsentChange).not.toHaveBeenCalled();
  });

  it('holds a time change to an event with guests, queueing nothing', async function () {
    const panel = panelFor(withGuests);
    const times = { start: START + HOUR, end: START + 2 * HOUR, isAllDay: false };
    panel._changeTimes(times);
    panel._saveTimes();
    await panel._saving;

    expect(queueTask).not.toHaveBeenCalled();
    expect(onUnsentChange).toHaveBeenCalledWith({ eventId: 'e1', edits: [], times });
  });
});

describe('a repeating event', function () {
  const DAY = 86400;
  const series = new Event({
    id: 'r1',
    accountId: 'a',
    calendarId: 'c',
    icsuid: 'r1@test',
    ics: [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'UID:r1@test',
      `DTSTART:${stamp(START)}`,
      `DTEND:${stamp(START + HOUR)}`,
      'RRULE:FREQ=DAILY;COUNT=5',
      'SUMMARY:Interview',
      'DTSTAMP:20261001T000000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
    recurrenceStart: START,
    recurrenceEnd: START + 4 * DAY + HOUR,
  } as any);

  const occurrenceOn = (day: number): TimedOccurrence => ({
    ...withoutGuests,
    id: CalendarUtils.occurrenceId('r1', START + day * DAY),
    isRecurring: true,
    start: START + day * DAY,
    end: START + day * DAY + HOUR,
  });
  const first = occurrenceOn(0);
  const second = occurrenceOn(1);
  const hourLater = { start: START + HOUR, end: START + 2 * HOUR, isAllDay: false };
  const heldMove = { eventId: 'r1', slot: START, edits: [], times: hourLater };

  let queueTask: jasmine.Spy;
  let dialog: jasmine.Spy;
  let stored: { [id: string]: Event };

  beforeEach(function () {
    stored = { e1: new Event(row.toJSON()), r1: new Event(series.toJSON()) };
    queueTask = spyOn(Actions, 'queueTask');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    spyOn(DatabaseStore, 'find').andCallFake((_klass, id) => Promise.resolve(stored[id]));
    spyOn(AppEnv.config, 'set');
    dialog = spyOn(UnsentChangeDialog, 'showUnsentChangeDialog');
  });

  // The sync engine writes what was queued, and the selection refreshes from it.
  async function written(calendar: any) {
    const { event } = queueTask.mostRecentCall.args[0];
    stored[event.id] = event;
    await calendar._refreshSelectedEvents();
  }

  it('draws a held change on the occurrence it was made to only', function () {
    const [drawnFirst, drawnSecond] = withUnsentChange([first, second], heldMove);
    expect((drawnFirst as TimedOccurrence).start).toBe(START + HOUR);
    expect(drawnSecond).toBe(second);
  });

  it('asks before leaving for another occurrence of the same series', function () {
    const calendar = calendarWith([first]);
    calendar.state.unsentChange = heldMove;
    dialog.andReturn('keep-editing');

    calendar._select([second]);

    expect(dialog).toHaveBeenCalled();
    expect(calendar.state.selectedEvents).toEqual([first]);
  });

  it('holds a drop and an arrow key without guests, asking nothing and queueing nothing', async function () {
    const recurringDialog = spyOn(RecurringEventDialog, 'showRecurringEventDialog').andReturn(
      Promise.resolve('cancel')
    );
    const calendar = calendarWith([]);
    await calendar._persistDragChange(droppedAt(first, START + HOUR));
    calendar._onMoveSelectedEvent('down', false);
    await settle();

    expect(recurringDialog).not.toHaveBeenCalled();
    expect(queueTask).not.toHaveBeenCalled();
    expect(calendar.state.unsentChange).toEqual({
      eventId: 'r1',
      slot: START,
      edits: [],
      times: { start: START + HOUR + QUARTER, end: START + 2 * HOUR + QUARTER, isAllDay: false },
    });
  });

  describe('after Send', function () {
    it('keeps a one-off selected once a new time and Repeat: Daily make it a series', async function () {
      const calendar = calendarWith([withGuests]);
      calendar.state.unsentChange = {
        eventId: 'e1',
        edits: [{ property: 'rrule', value: 'FREQ=DAILY' }],
        times: hourLater,
      };
      await calendar._sendUnsentChange();
      await written(calendar);

      expect(calendar.state.selectedEvents.length).toBe(1);
      expect(calendar.state.selectedEvents[0].start).toBe(START + HOUR);
    });

    it('keeps an occurrence selected once moved on its own', async function () {
      const calendar = calendarWith([first]);
      calendar.state.unsentChange = heldMove;
      await calendar._sendUnsentChange('this-occurrence');
      await written(calendar);

      expect(calendar.state.selectedEvents.length).toBe(1);
      expect(calendar.state.selectedEvents[0].start).toBe(START + HOUR);
      expect(calendar.state.selectedEvents[0].isException).toBe(true);
    });

    it('keeps an occurrence selected once the whole series moved', async function () {
      const calendar = calendarWith([second]);
      calendar.state.unsentChange = {
        ...heldMove,
        slot: second.start,
        times: { start: second.start + HOUR, end: second.end + HOUR, isAllDay: false },
      };
      await calendar._sendUnsentChange('all-occurrences');
      await written(calendar);

      expect(calendar.state.selectedEvents.length).toBe(1);
      expect(calendar.state.selectedEvents[0].start).toBe(second.start + HOUR);
      expect(calendar.state.selectedEvents[0].isException).toBe(false);
    });

    it("moves to the series' next occurrence once a new rule drops this one", async function () {
      const calendar = calendarWith([second]);
      calendar.state.unsentChange = {
        eventId: 'r1',
        slot: second.start,
        edits: [{ property: 'rrule', value: 'FREQ=WEEKLY' }],
      };
      await calendar._sendUnsentChange('all-occurrences');
      await written(calendar);

      expect(calendar.state.selectedEvents.length).toBe(1);
      expect(calendar.state.selectedEvents[0].start).toBe(START + 7 * DAY);
    });
  });

  it('offers the quit dialog only the scopes a change can go to, returning the one picked', function () {
    dialog.andCallThrough();
    const box = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync').andReturn(1);
    const ask = (edits: any[]) =>
      UnsentChangeDialog.showUnsentChangeDialog({ ...heldMove, edits }, first, {
        canKeepEditing: false,
      });

    expect(ask([])).toBe('all-occurrences');
    expect(box.mostRecentCall.args[0].buttons).toEqual([
      'This occurrence only',
      'All occurrences',
      'Discard',
    ]);
    expect(ask([{ property: 'rrule', value: 'FREQ=WEEKLY' }])).toBe('discard');
    expect(box.mostRecentCall.args[0].buttons).toEqual(['All occurrences', 'Discard']);
  });

  it("writes the whole series on the quit dialog's All occurrences", async function () {
    const calendar = calendarWith([first]);
    calendar.state.unsentChange = heldMove;
    dialog.andReturn('all-occurrences');
    const ready = jasmine.createSpy('readyToUnload');

    expect(calendar._onBeforeUnload(ready)).toBe(false);
    await settle();

    expect(dialog.mostRecentCall.args[2]).toEqual({ canKeepEditing: false });
    expect(queueTask.calls.length).toBe(1);
    const { event } = queueTask.mostRecentCall.args[0];
    const master = CalendarUtils.parseICSString(event.ics).event;
    expect(master.startDate.toJSDate().getTime() / 1000).toBe(START + HOUR);
    expect(ready).toHaveBeenCalled();
  });
});
