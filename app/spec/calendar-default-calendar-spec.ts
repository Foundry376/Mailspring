import moment from 'moment';
import {
  AccountStore,
  Actions,
  DatabaseStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
  MailboxPerspective,
  Thread,
} from 'mailspring-exports';
import { Calendar } from '../src/flux/models/calendar';
import * as CalendarHelpers from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { QuickEventPopover } from '../internal_packages/main-calendar/lib/quick-event-popover';

const { defaultCalendarForNewEvent } = CalendarHelpers;

const BASE = 1787860800; // 2026-08-27 16:00:00 UTC, a quarter-hour boundary

// The second account's calendar synced first, so the first editable calendar is in the wrong account.
const accountIds = () => AccountStore.accounts().map((a) => a.id);
const calendars = () => [
  new Calendar({ id: 'second-cal', accountId: accountIds()[1], name: 'Second' } as any),
  new Calendar({ id: 'first-cal', accountId: accountIds()[0], name: 'First' } as any),
];

function sendFrom(accountId: string | null) {
  const get = AppEnv.config.get.bind(AppEnv.config);
  spyOn(AppEnv.config, 'get').andCallFake((key: string) =>
    key === 'core.sending.defaultAccountIdForSend' ? accountId : get(key)
  );
}

function viewMailbox(ids: string[]) {
  const store = FocusedPerspectiveStore as unknown as { _current: MailboxPerspective };
  store._current = new MailboxPerspective(ids);
}

describe('defaultCalendarForNewEvent', function () {
  beforeEach(function () {
    viewMailbox(accountIds());
  });

  afterEach(function () {
    FocusedContentStore._focused = {};
  });

  it("picks a calendar in Mail's sending account over an earlier one", function () {
    sendFrom(accountIds()[0]);
    expect(defaultCalendarForNewEvent(calendars(), []).id).toBe('first-cal');
  });

  it("picks the first account's calendar when no sending account is set, as Mail does", function () {
    sendFrom(null);
    expect(defaultCalendarForNewEvent(calendars(), []).id).toBe('first-cal');
  });

  it("follows Mail to the focused thread's account when no sending account is set", function () {
    sendFrom(null);
    viewMailbox([accountIds()[1], accountIds()[0]]);
    Actions.setFocus({
      collection: 'thread',
      item: new Thread({ id: 'first-thread', accountId: accountIds()[0] }),
    });
    expect(defaultCalendarForNewEvent(calendars(), []).id).toBe('first-cal');
  });

  it('skips a read-only calendar in the sending account', function () {
    sendFrom(accountIds()[0]);
    const cals = [
      ...calendars().slice(0, 1),
      new Calendar({ id: 'first-ro', accountId: accountIds()[0], readOnly: true } as any),
      new Calendar({ id: 'first-cal', accountId: accountIds()[0] } as any),
    ];
    expect(defaultCalendarForNewEvent(cals, []).id).toBe('first-cal');
  });

  it('passes over a calendar someone else shared into the sending account', function () {
    sendFrom(accountIds()[0]);
    const cals = [
      ...calendars().slice(0, 1),
      new Calendar({ id: 'first-shared', accountId: accountIds()[0], ownership: 'other' } as any),
      new Calendar({ id: 'first-cal', accountId: accountIds()[0], ownership: 'mine' } as any),
    ];
    expect(defaultCalendarForNewEvent(cals, []).id).toBe('first-cal');
  });

  it("falls back to the first editable calendar when the sending account's are hidden", function () {
    sendFrom(accountIds()[0]);
    expect(defaultCalendarForNewEvent(calendars(), ['first-cal']).id).toBe('second-cal');
  });

  it('returns null when no calendar is editable', function () {
    sendFrom(accountIds()[0]);
    expect(defaultCalendarForNewEvent(calendars(), ['second-cal', 'first-cal'])).toBe(null);
  });
});

describe("new events start in Mail's sending account", function () {
  let cal: any;

  beforeEach(function () {
    sendFrom(accountIds()[0]);
    cal = new MailspringCalendar({} as any);
    cal.state = {
      ...cal.state,
      calendarsLoaded: true,
      calendars: calendars(),
      disabledCalendars: [],
    };
    cal.setState = (next: any) =>
      Object.assign(cal.state, typeof next === 'function' ? next(cal.state) : next);
  });

  it('from the editor', function () {
    spyOn(Actions, 'openPopover');
    cal._openNewEventPopover({
      startUnix: BASE,
      endUnix: BASE + 3600,
      isAllDay: false,
      clientX: 100,
      clientY: 200,
    });
    const preview = cal._renderMainContent().props.newEventPreview;
    expect(preview.calendarId).toBe('first-cal');
    expect(preview.accountId).toBe(accountIds()[0]);
  });

  it('from a drag on the grid', function () {
    const grid = document.createElement('div');
    cal._onCalendarMouseDown({
      time: BASE,
      containerType: 'day-column',
      mouseEvent: { button: 0, target: grid, clientX: 100, clientY: 200 },
    } as any);
    cal._onCalendarMouseMove({
      time: BASE + 3600,
      containerType: 'day-column',
      mouseEvent: { button: 0, target: grid, clientX: 100, clientY: 260 },
    } as any);
    expect(cal.state.createDrag.calendarId).toBe('first-cal');
    expect(cal.state.createDrag.accountId).toBe(accountIds()[0]);
  });

  it('from the quick event box', async function () {
    spyOn(DatabaseStore, 'findAll').andReturn(Promise.resolve(calendars()));
    const create = spyOn(CalendarHelpers, 'createCalendarEvent').andReturn(Promise.resolve());
    await new QuickEventPopover({}).createEvent({
      leftoverText: 'Lunch',
      start: moment.unix(BASE),
      end: moment.unix(BASE + 3600),
    });
    expect(create.mostRecentCall.args[0].calendarId).toBe('first-cal');
    expect(create.mostRecentCall.args[0].accountId).toBe(accountIds()[0]);
  });
});
