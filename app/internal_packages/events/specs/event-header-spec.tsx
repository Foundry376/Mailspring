import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import fs from 'fs';
import moment from 'moment';
import os from 'os';
import path from 'path';
import {
  Account,
  AccountStore,
  Actions,
  AttachmentStore,
  Calendar,
  Event,
  EventRSVPTask,
  File,
  ICSEventHelpers,
  Message,
  Rx,
  SyncbackEventTask,
  Task,
  Utils,
} from 'mailspring-exports';
import { EventHeader, renderLocation } from '../lib/event-header';

// A LOCATION as Zoom rooms write it: the join URL, then the rooms booked for the meeting.
const ZOOM_WITH_ROOMS =
  'https://sequoia.zoom.us/j/7647885554, London-2-Oxford (7) [Zoom Room], MP2800-2-DuPont (7) [Zoom Room]';

type Link = React.ReactElement<{ href: string; children: string }>;

function linksIn(node: React.ReactNode): Array<{ href: string; text: string }> {
  return (Array.isArray(node) ? node : [node])
    .filter((n): n is Link => React.isValidElement(n))
    .map((n) => ({ href: n.props.href, text: n.props.children }));
}

function textOf(node: React.ReactNode): string {
  return (Array.isArray(node) ? node : [node])
    .map((n) => (React.isValidElement(n) ? (n as Link).props.children : n))
    .join('');
}

describe('EventHeader location', function () {
  it('links a join URL to itself', function () {
    const node = renderLocation('https://meet.google.com/abc-defg-hij');
    expect(linksIn(node)).toEqual([
      {
        href: 'https://meet.google.com/abc-defg-hij',
        text: 'https://meet.google.com/abc-defg-hij',
      },
    ]);
  });

  it('links only the URL when rooms follow it, and keeps the rooms as text', function () {
    const node = renderLocation(ZOOM_WITH_ROOMS);
    expect(linksIn(node)).toEqual([
      {
        href: 'https://sequoia.zoom.us/j/7647885554',
        text: 'https://sequoia.zoom.us/j/7647885554',
      },
    ]);
    expect(textOf(node)).toBe(ZOOM_WITH_ROOMS);
  });

  it('links a URL that comes after text', function () {
    const node = renderLocation('Dial in: see https://example.com/notes');
    expect(linksIn(node)).toEqual([
      { href: 'https://example.com/notes', text: 'https://example.com/notes' },
    ]);
    expect(textOf(node)).toBe('Dial in: see https://example.com/notes');
  });

  it('links a tel: URI the way the event card does', function () {
    const node = renderLocation('tel:+1-415-555-1234,,12345#, Boardroom');
    expect(linksIn(node)).toEqual([
      { href: 'tel:+1-415-555-1234,,12345#', text: 'tel:+1-415-555-1234,,12345#' },
    ]);
    expect(textOf(node)).toBe('tel:+1-415-555-1234,,12345#, Boardroom');
  });

  it('links a URL with tel: in its path once, as the URL', function () {
    const node = renderLocation('https://example.com/dial/tel:+15550100');
    expect(linksIn(node)).toEqual([
      {
        href: 'https://example.com/dial/tel:+15550100',
        text: 'https://example.com/dial/tel:+15550100',
      },
    ]);
  });

  it('leaves a room name as text', function () {
    expect(renderLocation('Conference Room 4B')).toBe('Conference Room 4B');
    expect(renderLocation('MP2800-2-DuPont (7) [Zoom Room]')).toBe(
      'MP2800-2-DuPont (7) [Zoom Room]'
    );
  });

  it('renders nothing for a missing location', function () {
    expect(renderLocation(undefined)).toBeNull();
    expect(renderLocation('')).toBeNull();
  });

  describe('rendered from an invitation attachment', function () {
    let icsPath: string;

    beforeEach(function () {
      icsPath = path.join(os.tmpdir(), `event-header-spec-${process.pid}.ics`);
      fs.writeFileSync(
        icsPath,
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Test//Test//EN',
          'METHOD:REQUEST',
          'BEGIN:VEVENT',
          'UID:zoom-rooms@test',
          'DTSTART:20260924T150000Z',
          'DTEND:20260924T153000Z',
          'SUMMARY:Planning',
          `LOCATION:${ZOOM_WITH_ROOMS.replace(/,/g, '\\,')}`,
          'DTSTAMP:20260901T000000Z',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n')
      );
      spyOn(AttachmentStore, 'pathForFile').andReturn(icsPath);
      spyOn(Rx.Observable, 'fromQuery').andReturn(Rx.Observable.empty());
    });

    afterEach(function () {
      fs.unlinkSync(icsPath);
    });

    it('shows the join URL as a link and the rooms as text', function () {
      const header = ReactTestUtils.renderIntoDocument(
        <EventHeader
          message={new Message({ accountId: 'a1' })}
          file={new File({ id: 'f1', filename: 'invite.ics' })}
        />
      ) as unknown as EventHeader;
      let location: HTMLElement;
      waitsFor(() => {
        const nodes = ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-location');
        location = nodes[0] as HTMLElement;
        return !!location;
      });
      runs(() => {
        const links = Array.from(location.querySelectorAll('a'));
        expect(links.map((a) => a.getAttribute('href'))).toEqual([
          'https://sequoia.zoom.us/j/7647885554',
        ]);
        expect(location.textContent).toBe(ZOOM_WITH_ROOMS);
      });
    });
  });
});

describe('EventHeader for an invitation to one occurrence of a series', function () {
  const vcalendar = (...vevents: string[][]) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      ...vevents.flatMap((lines) => [
        'BEGIN:VEVENT',
        'UID:huddle@test',
        ...lines,
        'DTSTAMP:20260901T000000Z',
        'END:VEVENT',
      ]),
      'END:VCALENDAR',
    ].join('\r\n');

  const GUESTS = [
    'ORGANIZER:mailto:ada@example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:ada@example.com',
    'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:me@example.com',
  ];

  // A weekly meeting since 2025. The email is about 15 September 2026, moved later.
  const SERIES = [
    'DTSTART:20250923T140000Z',
    'DTEND:20250923T141500Z',
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:Huddle',
    ...GUESTS,
  ];
  const EMAILED = [
    'RECURRENCE-ID:20260915T140000Z',
    'DTSTART:20260915T150000Z',
    'DTEND:20260915T151500Z',
    'SUMMARY:Huddle',
    ...GUESTS,
  ];
  const SYNCED = [
    'RECURRENCE-ID:20260915T140000Z',
    'DTSTART:20260915T160000Z',
    'DTEND:20260915T161500Z',
    'SUMMARY:Huddle (as synced)',
    ...GUESTS,
  ];

  // Another moved week, listed first in the calendar copy.
  const OTHER_WEEK = [
    'RECURRENCE-ID:20260908T140000Z',
    'DTSTART:20260909T140000Z',
    'DTEND:20260909T141500Z',
    'SUMMARY:Huddle (another week)',
    ...GUESTS,
  ];

  // The header prints the day in the local zone, so the expectation is formed the same way
  // rather than spelled out: no instant falls on one date in every zone the suite may run in.
  const dayOf = (iso: string) => moment(iso).format('dddd, MMMM Do');

  let icsPath: string;

  function render(emailed: string[], calendarIcs: string) {
    icsPath = path.join(os.tmpdir(), `event-header-spec-${process.pid}.ics`);
    fs.writeFileSync(
      icsPath,
      vcalendar(emailed).replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:REQUEST')
    );
    spyOn(AttachmentStore, 'pathForFile').andReturn(icsPath);
    const synced = new Event({ id: 'e1', accountId: 'a1', ics: calendarIcs } as any);
    spyOn(Rx.Observable, 'fromQuery').andCallFake((query: { _klass: unknown }) =>
      Rx.Observable.just(query._klass === Event ? [synced] : [])
    );
    const header = ReactTestUtils.renderIntoDocument(
      <EventHeader
        message={new Message({ accountId: 'a1' })}
        file={new File({ id: 'f1', filename: 'invite.ics' })}
      />
    ) as unknown as EventHeader;
    const text = (className: string) =>
      ReactTestUtils.scryRenderedDOMComponentsWithClass(header, className)[0]?.textContent;
    // The link is rendered once the calendar copy has been applied.
    waitsFor(() => !!text('event-view-in-calendar'));
    return Object.assign(text, { header });
  }

  afterEach(function () {
    fs.unlinkSync(icsPath);
  });

  it("shows that occurrence from the calendar copy, not the series' first date", function () {
    const text = render(EMAILED, vcalendar(SERIES, OTHER_WEEK, SYNCED));
    runs(() => {
      expect(text('event-day')).toBe(dayOf('2026-09-15T16:00:00Z'));
      expect(text('event-title')).toBe('Huddle (as synced)');
    });
  });

  it('keeps what the email said when the calendar copy has no entry for it', function () {
    const text = render(EMAILED, vcalendar(SERIES));
    runs(() => {
      expect(text('event-day')).toBe(dayOf('2026-09-15T15:00:00Z'));
      expect(text('event-title')).toBe('Huddle');
    });
  });

  let queueTask: jasmine.Spy;

  // Clicks Decline and returns the ICS of the reply that was queued.
  function declineAndGetReply(text: ReturnType<typeof render>): string {
    const decline = ReactTestUtils.scryRenderedDOMComponentsWithClass(text.header, 'btn-rsvp').find(
      (button) => button.textContent === 'Decline'
    );
    ReactTestUtils.Simulate.click(decline);
    return queueTask.mostRecentCall.args[0].ics;
  }

  beforeEach(function () {
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === 'me@example.com' ? ({ id: 'a1' } as any) : null
    );
    queueTask = spyOn(Actions, 'queueTask');
  });

  it('answers for that occurrence alone, not for the series', function () {
    const text = render(EMAILED, vcalendar(SERIES, OTHER_WEEK, SYNCED));
    runs(() => {
      const reply = declineAndGetReply(text);
      expect(reply.split('BEGIN:VEVENT').length - 1).toBe(1);
      expect(reply).toContain('RECURRENCE-ID:20260915T140000Z');
      expect(reply).not.toContain('RRULE');
    });
  });

  it('still shows, and answers from, the calendar copy for an invitation to the whole series', function () {
    const text = render(
      SERIES,
      vcalendar([...SERIES.slice(0, 3), 'SUMMARY:Huddle (as synced)', ...GUESTS])
    );
    runs(() => {
      expect(text('event-day')).toBe(dayOf('2025-09-23T14:00:00Z'));
      expect(text('event-title')).toBe('Huddle (as synced)');
      expect(declineAndGetReply(text)).toContain('SUMMARY:Huddle (as synced)');
    });
  });
});

describe('EventHeader answering an invitation', function () {
  const GROUP_ORGANIZER = 'mailto:c_abc123@group.calendar.google.com';
  const INVITE = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:meeting-uid@example.com',
    'DTSTART:20260301T140000Z',
    'DTEND:20260301T150000Z',
    'SUMMARY:Kickoff',
    'DTSTAMP:20260101T000000Z',
    'ORGANIZER;CN=Ada:mailto:ada@example.com',
    'ATTENDEE;CN=Ada;ROLE=CHAIR;PARTSTAT=ACCEPTED:mailto:ada@example.com',
    'ATTENDEE;CN=Brian;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:brian@example.com',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  // Google's copy on a shared calendar: ORGANIZER rewritten to the calendar's own id.
  const SYNCED = INVITE.replace('METHOD:REQUEST\r\n', '').replace(
    'mailto:ada@example.com\r\nATTENDEE',
    `${GROUP_ORGANIZER}\r\nATTENDEE`
  );

  const account = new Account({ id: 'a1', emailAddress: 'brian@example.com' });
  const cal = (over: object) => new Calendar({ accountId: 'a1', ...over } as any);
  const mine = cal({ id: 'cal-mine', name: 'brian@example.com' });
  const shared = cal({ id: 'cal-shared', name: 'US On Call' });
  const theirs = cal({ id: 'cal-theirs', name: 'Team', ownership: 'other' });
  const holidays = cal({ id: 'cal-holidays', name: 'Holidays', readOnly: true });
  const synced = new Event({
    id: 'e-mine',
    accountId: 'a1',
    calendarId: mine.id,
    icsuid: 'meeting-uid@example.com',
    ics: SYNCED.replace('SUMMARY:Kickoff', 'SUMMARY:Kickoff (moved)'),
  } as any);
  const onRoom = synced.clone();
  onRoom.id = 'e-room';
  onRoom.calendarId = 'cal-room';
  onRoom.ics = SYNCED.replace('SUMMARY:Kickoff', 'SUMMARY:Kickoff (room copy)');

  let icsPath: string;
  let header: EventHeader;
  let queued: Task[];
  let nearbyBounds: { start: number; end: number };

  beforeEach(function () {
    icsPath = path.join(os.tmpdir(), `event-header-rsvp-spec-${process.pid}.ics`);
    fs.writeFileSync(icsPath, INVITE);
    spyOn(AttachmentStore, 'pathForFile').andReturn(icsPath);
    spyOn(AccountStore, 'accountForId').andReturn(account);
    spyOn(AccountStore, 'aliases').andReturn([]);
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      Utils.emailIsEquivalent(email, account.emailAddress) ? account : null
    );
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task: Task) => queued.push(task));
    // A real error dialog would block the runner.
    spyOn(AppEnv, 'showErrorDialog');
  });

  afterEach(function () {
    fs.unlinkSync(icsPath);
  });

  function mount({
    events,
    calendars,
    nearby = [],
  }: {
    events: Event[];
    calendars: Calendar[];
    nearby?: Event[];
  }) {
    spyOn(Rx.Observable, 'fromQuery').andCallFake(
      (query: { _klass: unknown; _matchers: { attr: { modelKey: string }; val: number }[] }) => {
        const keys = query._matchers.map((m) => m.attr && m.attr.modelKey);
        if (query._klass !== Event) return Rx.Observable.just(calendars);
        if (keys.includes('icsuid')) return Rx.Observable.just(events);
        nearbyBounds = {
          start: query._matchers.find((m) => m.attr.modelKey === 'recurrenceEnd').val,
          end: query._matchers.find((m) => m.attr.modelKey === 'recurrenceStart').val,
        };
        return Rx.Observable.just(nearby);
      }
    );
    header = ReactTestUtils.renderIntoDocument(
      <EventHeader
        message={new Message({ id: 'm1', accountId: 'a1' })}
        file={new File({ id: 'f1', filename: 'invite.ics' })}
      />
    ) as unknown as EventHeader;
    waitsFor(() => !!header.state.rsvp);
  }

  function click(label: string) {
    const button = ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'btn-rsvp').find(
      (n) => n.textContent === label
    );
    ReactTestUtils.Simulate.click(button);
  }

  const destination = () =>
    ReactTestUtils.findRenderedDOMComponentWithClass(header, 'event-rsvp-destination');
  const unfold = (ics: string) => ics.replace(/\r?\n[ \t]/g, '');
  const title = () =>
    ReactTestUtils.findRenderedDOMComponentWithClass(header, 'event-title').textContent;

  it('addresses the reply to the organizer the mailed invitation names, from the synced copy', function () {
    mount({ events: [synced], calendars: [mine] });
    runs(() => {
      expect(title()).toBe('Kickoff (moved)');
      click('Accept');
      const reply = queued[0] as EventRSVPTask;
      expect(reply instanceof EventRSVPTask).toBe(true);
      expect(reply.toJSON().to).toBe('ada@example.com');
      expect(reply.ics).toContain('SUMMARY:Kickoff (moved)');
    });
  });

  it('also records the answer on our own copy, and says so beforehand', function () {
    mount({
      events: [onRoom, synced],
      calendars: [cal({ id: 'cal-room', name: 'Boardroom' }), mine],
    });
    runs(() => {
      expect(title()).toBe('Kickoff (moved)');
      expect(destination().textContent).toBe('Your response will be saved to brian@example.com');
      click('Maybe');
      const write = queued[1] as SyncbackEventTask;
      expect(write instanceof SyncbackEventTask).toBe(true);
      expect(write.event.id).toBe('e-mine');
      expect(unfold(write.event.ics)).toMatch(
        /ATTENDEE[^\r\n]*PARTSTAT=TENTATIVE[^\r\n]*brian@example.com/
      );
    });
  });

  it('offers only calendars that could be ours when the invitation has not synced', function () {
    mount({ events: [], calendars: [theirs, holidays, shared, mine] });
    runs(() => {
      const picker = destination().querySelector('select') as HTMLSelectElement;
      expect(picker.value).toBe(mine.id);
      expect(Array.from(picker.options).map((o) => o.textContent)).toEqual([
        'US On Call',
        'brian@example.com',
      ]);
      click('Accept');
      const write = queued[1] as SyncbackEventTask;
      expect(write.calendarId).toBe(mine.id);
      expect(write.event.ics).not.toContain('METHOD');
    });
  });

  it('only emails a decline when the invitation is on no calendar', function () {
    mount({ events: [], calendars: [mine] });
    runs(() => {
      expect(Array.from(destination().querySelectorAll('span')).map((n) => n.textContent)).toEqual([
        'Accepting will add this event to',
        'brian@example.com',
      ]);
      expect(destination().querySelector('select')).toBe(null);
      expect(
        ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-view-in-calendar').length
      ).toBe(0);
      click('Decline');
      expect(queued.length).toBe(1);
      expect(queued[0] instanceof EventRSVPTask).toBe(true);
    });
  });

  it('still emails the reply when every copy is read-only, and says nothing is recorded', function () {
    const onHolidays = synced.clone();
    onHolidays.calendarId = holidays.id;
    mount({ events: [onHolidays], calendars: [holidays] });
    runs(() => {
      expect(title()).toBe('Kickoff (moved)');
      expect(destination().textContent).toContain('only be emailed to the organizer');
      click('Accept');
      expect(queued.length).toBe(1);
    });
  });

  it('offers no RSVP on an invitation that lists a group rather than us', function () {
    fs.writeFileSync(
      icsPath,
      INVITE.replace('mailto:brian@example.com', 'mailto:team@example.com')
    );
    mount({ events: [], calendars: [mine] });
    runs(() => {
      expect(ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'btn-rsvp').length).toBe(0);
      expect(
        ReactTestUtils.findRenderedDOMComponentWithClass(header, 'event-no-rsvp').textContent
      ).toContain("isn't listed as a guest");
    });
  });

  it('loads the invitation once mailsync has downloaded it', function () {
    fs.unlinkSync(icsPath);
    spyOn(Rx.Observable, 'fromQuery').andReturn(Rx.Observable.just([]));
    const container = document.createElement('div');
    const render = (message: Message) =>
      ReactDOM.render(
        <EventHeader message={message} file={new File({ id: 'f1', filename: 'invite.ics' })} />,
        container
      ) as unknown as EventHeader;
    header = render(new Message({ id: 'm1', accountId: 'a1' }));
    waits(50);
    runs(() => {
      expect(header.state.inviteIcs).toBe(undefined);
      fs.writeFileSync(icsPath, INVITE);
      header = render(new Message({ id: 'm1', accountId: 'a1' }));
    });
    waitsFor(() => !!header.state.inviteIcs);
    runs(() => {
      expect(title()).toBe('Kickoff');
      ReactDOM.unmountComponentAtNode(container);
    });
  });

  describe('conflicts', function () {
    const busyAt = (
      id: string,
      calendarId: string,
      start: string,
      end: string,
      uid = `${id}@test`
    ) =>
      new Event({
        id,
        accountId: 'a1',
        calendarId,
        icsuid: uid,
        ics: [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Test//Test//EN',
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          `SUMMARY:${id}`,
          'DTSTAMP:20260101T000000Z',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      } as any);
    const conflictLines = () =>
      ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-conflict').map(
        (n) => n.textContent
      );

    beforeEach(function () {
      const original = AppEnv.config.get;
      spyOn(AppEnv.config, 'get').andCallFake((key: string) =>
        key === 'mailspring.disabledCalendars' ? ['cal-off'] : original.call(AppEnv.config, key)
      );
    });

    it('lists what the invitation overlaps on the calendars that are our busy time', function () {
      const off = cal({ id: 'cal-off', name: 'Side project' });
      mount({
        events: [],
        calendars: [mine, holidays, theirs, off],
        nearby: [
          busyAt('Standup', mine.id, '20260301T143000Z', '20260301T150000Z'),
          busyAt('Bank holiday', holidays.id, '20260301T140000Z', '20260301T150000Z'),
          busyAt('Their meeting', theirs.id, '20260301T140000Z', '20260301T150000Z'),
          busyAt('Side thing', off.id, '20260301T140000Z', '20260301T150000Z'),
          busyAt('Lunch', mine.id, '20260301T150000Z', '20260301T160000Z'),
          busyAt(
            'Itself',
            mine.id,
            '20260301T140000Z',
            '20260301T150000Z',
            'meeting-uid@example.com'
          ),
        ],
      });
      runs(() => {
        expect(
          ReactTestUtils.findRenderedDOMComponentWithClass(header, 'event-conflicts-title')
            .textContent
        ).toBe('Conflicts with an event on your calendar');
        expect(conflictLines()).toEqual(['Standup (8:30 am - 9:00 am)']);
      });
    });

    it('checks the next occurrence of a recurring invitation, not the one it began with', function () {
      const series = INVITE.replace(
        'DTSTART:20260301T140000Z\r\nDTEND:20260301T150000Z',
        'DTSTART:20260301T140000Z\r\nDTEND:20260301T150000Z\r\nRRULE:FREQ=WEEKLY'
      );
      fs.writeFileSync(icsPath, series);
      const next = ICSEventHelpers.upcomingOccurrence(series, new Date());
      const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
      mount({
        events: [],
        calendars: [mine],
        nearby: [
          busyAt('First week', mine.id, '20260301T140000Z', '20260301T150000Z'),
          busyAt('This week', mine.id, stamp(next.start), stamp(next.end)),
        ],
      });
      runs(() => {
        expect(header.state.conflictWindow).toEqual({
          start: next.start.getTime() / 1000,
          end: next.end.getTime() / 1000,
        });
        expect(conflictLines().map((l) => l.split(' (')[0])).toEqual(['This week']);
      });
    });

    it('does not bother with conflicts on a cancellation', function () {
      fs.writeFileSync(icsPath, INVITE.replace('METHOD:REQUEST', 'METHOD:CANCEL'));
      mount({
        events: [],
        calendars: [mine],
        nearby: [busyAt('Standup', mine.id, '20260301T143000Z', '20260301T150000Z')],
      });
      runs(() => {
        expect(header.state.conflicts.length).toBe(1);
        expect(
          ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-conflicts').length
        ).toBe(0);
      });
    });

    it('follows the calendar copy when it has moved the next occurrence of a series', function () {
      const series = INVITE.replace(
        'DTSTART:20260301T140000Z\r\nDTEND:20260301T150000Z',
        'DTSTART:20260301T140000Z\r\nDTEND:20260301T150000Z\r\nRRULE:FREQ=WEEKLY'
      );
      fs.writeFileSync(icsPath, series);
      const next = ICSEventHelpers.upcomingOccurrence(series, new Date());
      const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
      const later = (d: Date) => new Date(d.getTime() + 2 * 3600 * 1000);
      const copy = synced.clone();
      copy.ics = series
        .replace('METHOD:REQUEST\r\n', '')
        .replace(
          'END:VCALENDAR',
          [
            'BEGIN:VEVENT',
            'UID:meeting-uid@example.com',
            `RECURRENCE-ID:${stamp(next.start)}`,
            `DTSTART:${stamp(later(next.start))}`,
            `DTEND:${stamp(later(next.end))}`,
            'SUMMARY:Kickoff (this week later)',
            'DTSTAMP:20260101T000000Z',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\r\n')
        );
      mount({ events: [copy], calendars: [mine], nearby: [] });
      runs(() => {
        expect(header.state.conflictWindow).toEqual({
          start: later(next.start).getTime() / 1000,
          end: later(next.end).getTime() / 1000,
        });
      });
    });

    it('checks the occurrence an email is about where the calendar copy now has it', function () {
      // The email names the 8 March occurrence of a weekly series; our copy has moved it to 16:00.
      const emailed = INVITE.replace(
        'DTSTART:20260301T140000Z\r\nDTEND:20260301T150000Z',
        'RECURRENCE-ID:20260308T140000Z\r\nDTSTART:20260308T140000Z\r\nDTEND:20260308T150000Z'
      );
      fs.writeFileSync(icsPath, emailed);
      const series = synced.clone();
      series.ics = SYNCED.replace(
        'DTEND:20260301T150000Z',
        'DTEND:20260301T150000Z\r\nRRULE:FREQ=WEEKLY'
      ).replace(
        'END:VCALENDAR',
        [
          'BEGIN:VEVENT',
          'UID:meeting-uid@example.com',
          'RECURRENCE-ID:20260308T140000Z',
          'DTSTART:20260308T160000Z',
          'DTEND:20260308T170000Z',
          'SUMMARY:Kickoff (moved later)',
          'DTSTAMP:20260101T000000Z',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n')
      );
      mount({
        events: [series],
        calendars: [mine],
        nearby: [
          busyAt('At the emailed time', mine.id, '20260308T140000Z', '20260308T150000Z'),
          busyAt('At the moved time', mine.id, '20260308T163000Z', '20260308T170000Z'),
        ],
      });
      runs(() => {
        expect(title()).toBe('Kickoff (moved later)');
        expect(header.state.conflictWindow).toEqual({
          start: Date.UTC(2026, 2, 8, 16) / 1000,
          end: Date.UTC(2026, 2, 8, 17) / 1000,
        });
        expect(nearbyBounds).toEqual(header.state.conflictWindow);
        expect(conflictLines().map((l) => l.split(' (')[0])).toEqual(['At the moved time']);
      });
    });

    it('says nothing when the slot is free', function () {
      mount({ events: [], calendars: [mine], nearby: [] });
      runs(() => {
        expect(
          ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-conflicts').length
        ).toBe(0);
      });
    });
  });
});
