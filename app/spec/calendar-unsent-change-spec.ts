import {
  Actions,
  CalendarUtils,
  DatabaseStore,
  Event,
  TaskQueue,
  WorkspaceStore,
} from 'mailspring-exports';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import * as UnsentChangeDialog from '../internal_packages/main-calendar/lib/core/unsent-change-dialog';

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

// Driven unmounted, setState redirected, as the other calendar specs do.
function calendarWith(selected: TimedOccurrence[]) {
  const calendar: any = new MailspringCalendar({} as any);
  calendar.setState = (update: object) => Object.assign(calendar.state, update);
  calendar.state.selectedEvents = selected;
  calendar.state.calendarsLoaded = true;
  calendar.state.readOnlyCalendarIds = new Set();
  calendar.state.view = CalendarView.WEEK;
  return calendar;
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
    // As componentDidMount registers it, ahead of the window's handler on <body>.
    document.addEventListener('core:undo', calendar._ignoreUndoWhileHeld, true);
    windowUndo = jasmine.createSpy('windowUndo');
    document.body.addEventListener('core:undo', windowUndo);
    button = document.body.appendChild(document.createElement('button'));
    field = document.body.appendChild(document.createElement('input'));
  });

  afterEach(function () {
    document.removeEventListener('core:undo', calendar._ignoreUndoWhileHeld, true);
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
    // As componentDidMount registers it.
    WorkspaceStore.setSectionLeaveGuard(() => calendar._mayLeave([]));
    dialog.andReturn('keep-editing');
    try {
      WorkspaceStore._onSelectRootSheet(mailSection);
      expect(dialog).toHaveBeenCalled();
      expect(WorkspaceStore.rootSheet()).toBe(calendarSection);
    } finally {
      WorkspaceStore.setSectionLeaveGuard(null);
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
