import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { Actions, DatabaseStore, DateUtils } from 'mailspring-exports';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import {
  newEventOccurrence,
  queueNewCalendarEvent,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { newEventOptions } from '../internal_packages/main-calendar/lib/core/unsent-change';
import moment from 'moment';
import { QuickEventPopover } from '../internal_packages/main-calendar/lib/quick-event-popover';

const START = Date.UTC(2026, 10, 10, 15, 0, 0) / 1000;
const HOUR = 3600;
const ID = '__new_event_1';

const draft = (overrides: any = {}) => ({
  start: START,
  end: START + HOUR,
  isAllDay: false,
  calendarId: 'c',
  accountId: 'a',
  ...overrides,
});
const alex = { email: 'alex@example.com', name: 'Alex' };

describe('newEventOptions', function () {
  it('creates the event as the panel shows it', function () {
    const options = newEventOptions(draft(), {
      eventId: ID,
      times: { start: START + HOUR, end: START + 2 * HOUR, isAllDay: false },
      edits: [
        { property: 'summary', value: 'Interview' },
        { property: 'location', value: 'Room 4' },
        { property: 'description', value: 'Bring the slides' },
        { property: 'rrule', value: 'FREQ=WEEKLY' },
        { property: 'transp', value: 'TRANSPARENT' },
      ],
      attendees: { added: [{ ...alex, status: 'NEEDS-ACTION' } as any], removed: [] },
    });

    expect(options).toEqual({
      summary: 'Interview',
      start: new Date((START + HOUR) * 1000),
      end: new Date((START + 2 * HOUR) * 1000),
      isAllDay: false,
      timezone: undefined,
      calendarId: 'c',
      accountId: 'a',
      location: 'Room 4',
      description: 'Bring the slides',
      recurrenceRule: 'FREQ=WEEKLY',
      transparency: 'TRANSPARENT',
      attendees: [alex],
    });
  });

  it('names an event given only invitees "New Event", and keeps the times it opened with', function () {
    const options = newEventOptions(draft(), {
      eventId: ID,
      edits: [],
      attendees: { added: [alex], removed: [] },
    });
    expect(options.summary).toBe('New Event');
    expect(options.start).toEqual(new Date(START * 1000));
    expect(options.end).toEqual(new Date((START + HOUR) * 1000));
  });

  it('shows and creates a new all-day event as Free and a timed one as Busy', function () {
    const allDay = draft({ isAllDay: true });
    expect(newEventOccurrence(ID, allDay).isFree).toBe(true);
    expect(newEventOptions(allDay, null).transparency).toBe('TRANSPARENT');
    expect(newEventOccurrence(ID, draft()).isFree).toBe(false);
    expect(newEventOptions(draft(), null).transparency).toBe('OPAQUE');
  });

  it('creates Show as as the panel shows it after a switch to all day', function () {
    const day = { start: START, end: START + 24 * HOUR, isAllDay: true };
    const shown = newEventOccurrence(ID, draft()).isFree ? 'TRANSPARENT' : 'OPAQUE';
    expect(shown).toBe('OPAQUE');
    expect(newEventOptions(draft(), { eventId: ID, edits: [], times: day }).transparency).toBe(
      shown
    );
  });

  describe('the reminder it is created with', function () {
    beforeEach(function () {
      spyOn(Actions, 'queueTask');
    });

    const triggersOf = (change: any) =>
      queueNewCalendarEvent(newEventOptions(draft(), change)).event.ics.match(/^TRIGGER:.*$/gm);

    it('is ten minutes before a timed event', function () {
      expect(triggersOf(null)).toEqual(['TRIGGER:-PT10M']);
    });

    it('is none once the event is switched to all day', function () {
      const day = { start: START, end: START + 24 * HOUR, isAllDay: true };
      expect(triggersOf({ eventId: ID, edits: [], times: day })).toBe(null);
    });
  });
});

describe('a new event in the panel', function () {
  let onUnsentChange: jasmine.Spy;
  let onSaveChange: jasmine.Spy;
  let onSendUnsentChange: jasmine.Spy;
  let onDiscard: jasmine.Spy;
  let host: HTMLElement;

  beforeEach(function () {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null));
    onUnsentChange = jasmine.createSpy('onUnsentChange');
    onSaveChange = jasmine.createSpy('onSaveChange').andReturn(Promise.resolve());
    onSendUnsentChange = jasmine.createSpy('onSendUnsentChange');
    onDiscard = jasmine.createSpy('onDiscard');
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const props = (unsentChange = null) => ({
    event: newEventOccurrence(ID, draft()),
    isNewEvent: true,
    isCalendarReadOnly: false,
    onBack: () => {},
    unsentChange,
    onUnsentChange,
    onSendUnsentChange,
    onSaveChange,
    onDiscard,
  });
  const panelFor = (unsentChange = null) => {
    const panel: any = new EventPanel(props(unsentChange));
    panel.setState = (update: object) => Object.assign(panel.state, update);
    return panel;
  };
  const render = (unsentChange = null) =>
    ReactDOM.render(React.createElement(EventPanel, props(unsentChange)), host);

  it('holds every edit, saving nothing', async function () {
    const panel = panelFor();
    panel._saveProperty({ property: 'summary', value: 'Interview' });
    panel._changeTimes({ start: START + HOUR, end: START + 2 * HOUR, isAllDay: false });
    panel._saveTimes();
    await panel._saving;

    expect(onSaveChange).not.toHaveBeenCalled();
    expect(onUnsentChange.calls.length).toBe(2);
    expect(onUnsentChange.calls[0].args[0].edits).toEqual([
      { property: 'summary', value: 'Interview' },
    ]);
  });

  it('keeps no title when the title is left empty', function () {
    const held = { eventId: ID, edits: [{ property: 'summary', value: 'Interview' }] };
    panelFor(held)._renderTitle().props.onSave('');

    expect(onUnsentChange).toHaveBeenCalledWith(null);
  });

  it('puts it on the calendar picked', function () {
    const calendars = [
      { id: 'c', accountId: 'a', name: 'Mine' },
      { id: 'w', accountId: 'a', name: 'Work' },
    ] as any[];
    const onCalendarChange = jasmine.createSpy('onCalendarChange');
    ReactDOM.render(
      React.createElement(EventPanel, {
        ...props(),
        calendarChoices: calendars,
        onCalendarChange,
      }),
      host
    );
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Calendar"]');
    ReactTestUtils.Simulate.change(select, { target: { value: 'w' } } as any);
    expect(onCalendarChange).toHaveBeenCalledWith(calendars[1]);
  });

  it('sends the invitations, or drops the event, from the card', function () {
    render({ eventId: ID, edits: [], attendees: { added: [alex], removed: [] } });
    const button = (label: string) =>
      Array.from(host.querySelectorAll<HTMLElement>('.event-panel-card .btn')).find(
        (b) => b.textContent === label
      );

    ReactTestUtils.Simulate.click(button('Discard'));
    expect(onDiscard).toHaveBeenCalled();
    expect(onUnsentChange).not.toHaveBeenCalled();

    ReactTestUtils.Simulate.click(button('Send invitations'));
    expect(onSendUnsentChange).toHaveBeenCalled();
  });
});

describe('the quick add footer', function () {
  beforeEach(function () {
    spyOn(moment, 'now').andReturn(new Date(2026, 9, 31, 10, 12).getTime());
  });

  it('opens the slot it read, not one parsed again at Enter', function () {
    const popover: any = new QuickEventPopover({});
    popover.setState = (update: object) => Object.assign(popover.state, update);
    const open = spyOn(Actions, 'openNewCalendarEvent');
    spyOn(Actions, 'closePopover');
    popover.onInputChange({ target: { value: 'Call the bank' } });
    const read = popover.state.parsed;
    (moment.now as jasmine.Spy).andReturn(new Date(2026, 9, 31, 10, 45).getTime());
    popover.onInputKeyDown({ key: 'Enter', stopPropagation: () => {} });
    expect(open.mostRecentCall.args[0].start).toBe(read.start.unix());
  });
});

describe('QuickEventPopover', function () {
  let popover: QuickEventPopover;

  beforeEach(function () {
    popover = new QuickEventPopover({});
    (popover as any).setState = (update: object) => Object.assign(popover.state, update);
    spyOn(Actions, 'openNewCalendarEvent');
    spyOn(Actions, 'closePopover');
  });

  const press = (value: string) => {
    popover.onInputChange({ target: { value } } as any);
    popover.onInputKeyDown({ key: 'Enter', stopPropagation: () => {} } as any);
  };

  it('opens the event it reads in the panel on Enter, and closes', function () {
    press('Lunch with Alex tomorrow at noon');
    const parsed = DateUtils.parseDateString('Lunch with Alex tomorrow at noon');
    expect(Actions.openNewCalendarEvent).toHaveBeenCalledWith({
      title: parsed.leftoverText,
      start: parsed.start.unix(),
      end: parsed.end.unix(),
    });
    expect(Actions.closePopover).toHaveBeenCalled();
  });

  it('creates nothing on Enter once cleared', function () {
    popover.onInputChange({ target: { value: 'Call the bank' } } as any);
    popover.onClear();
    expect(popover.state.text).toBe('');
    popover.onInputKeyDown({ key: 'Enter', stopPropagation: () => {} } as any);
    expect(Actions.openNewCalendarEvent).not.toHaveBeenCalled();
  });

  it('creates nothing on Enter with nothing typed', function () {
    press(' ');
    expect(Actions.openNewCalendarEvent).not.toHaveBeenCalled();
    expect(Actions.closePopover).not.toHaveBeenCalled();
  });
});
