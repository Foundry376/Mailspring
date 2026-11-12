import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { AccountStore, DatabaseStore, DateUtils } from 'mailspring-exports';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import * as CalendarRsvp from '../internal_packages/main-calendar/lib/core/calendar-rsvp';
import * as CalendarDateUtils from '../src/calendar-date';

const START = Date.UTC(2026, 10, 10, 15, 30, 0) / 1000;
const HOUR = 3600;

const invitation = (overrides: Partial<TimedOccurrence> = {}): TimedOccurrence =>
  ({
    id: 'e1-e0',
    accountId: 'a',
    calendarId: 'c',
    title: 'Design Review',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    isMine: false,
    organizer: { email: 'ada@example.com' },
    attendees: [],
    start: START,
    end: START + HOUR,
    startDate: CalendarDateUtils.calendarDateFromUnix(START),
    endDate: CalendarDateUtils.calendarDateFromUnix(START),
    ...overrides,
  }) as TimedOccurrence;

describe('EventPanel', function () {
  let host: HTMLElement;

  beforeEach(function () {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null));
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const render = (event: TimedOccurrence, unsentChange = null, isCalendarReadOnly = false) =>
    ReactDOM.render(
      React.createElement(EventPanel, {
        event,
        isCalendarReadOnly,
        onBack: () => {},
        unsentChange,
        onUnsentChange: () => {},
        onSendUnsentChange: () => {},
        onSaveChange: () => Promise.resolve(),
      }),
      host
    );

  // As TimePicker and DatePicker show them in the panel of an event we organize.
  const pickerTime = (unix: number) => moment.unix(unix).format(DateUtils.tightTimeFormat());
  const pickerDay = (unix: number) => DateUtils.dayString(moment.unix(unix));

  it("shows an invitation's times and day as an event we organize shows them", function () {
    render(invitation());
    const text = host.querySelector('.event-panel-section').textContent;

    expect(text).toContain(pickerTime(START));
    expect(text).toContain(pickerTime(START + HOUR));
    expect(text).toContain(pickerDay(START));
  });

  it('shows both days of an invitation that spans two, as the date pickers do', function () {
    const end = START + 24 * HOUR;
    render(invitation({ end, endDate: CalendarDateUtils.calendarDateFromUnix(end) }));
    const text = host.querySelector('.event-panel-section').textContent;

    expect(text).toContain(`${pickerDay(START)}–${pickerDay(end)}`);
  });

  describe("the guest list's answer dots", function () {
    const dotFor = (name: string) =>
      Array.from(host.querySelectorAll('.event-panel-invitee')).find((row) =>
        row.textContent.startsWith(name)
      ).className;

    it('draws an unanswered organizer as attending, and anyone else as stored', function () {
      render(
        invitation({
          attendees: [
            { email: 'ada@example.com', name: 'Ada', partstat: 'NEEDS-ACTION' },
            { email: 'jordan@example.com', name: 'Jordan', partstat: 'NEEDS-ACTION' },
          ],
        })
      );

      expect(dotFor('Ada')).toContain('accepted');
      expect(dotFor('Jordan')).toContain('needs-action');
    });

    it("keeps an organizer's own Declined", function () {
      render(
        invitation({
          attendees: [{ email: 'ada@example.com', name: 'Ada', partstat: 'DECLINED' }],
        })
      );

      expect(dotFor('Ada')).toContain('declined');
    });
  });

  describe("the guest list's order", function () {
    beforeEach(function () {
      spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) => {
        if (email === 'me@example.com') return { id: 'a' } as any;
        if (email === 'other@example.com') return { id: 'b' } as any;
        return null;
      });
    });

    const names = () =>
      Array.from(host.querySelectorAll('.event-panel-invitee-name > div:first-child')).map(
        (n) => n.textContent
      );

    it('puts the organizer, then us, before everyone sorted by answer and name', function () {
      render(
        invitation({
          attendees: [
            { email: 'jordan@example.com', name: 'Jordan', partstat: 'ACCEPTED' },
            { email: 'other@example.com', name: 'Another Account', partstat: 'ACCEPTED' },
            { email: 'me@example.com', name: 'Me', partstat: 'TENTATIVE' },
            { email: 'alex@example.com', name: 'Alex', partstat: 'NEEDS-ACTION' },
            { email: 'ada@example.com', name: 'Ada', partstat: 'DECLINED' },
          ],
        })
      );

      expect(names()).toEqual(['Ada', 'Me', 'Another Account', 'Jordan', 'Alex']);
    });

    it('lists a guest waiting to be added after everyone stored', function () {
      const waiting = { email: 'aaron@example.com', name: 'Aaron' };
      render(
        invitation({
          attendees: [
            { email: 'jordan@example.com', name: 'Jordan', partstat: 'ACCEPTED' },
            { email: 'zoe@example.com', name: 'Zoe', partstat: 'DECLINED' },
            { email: 'ada@example.com', name: 'Ada', partstat: 'ACCEPTED' },
          ],
        }),
        { eventId: 'e1', edits: [], attendees: { added: [waiting], removed: [] } }
      );

      expect(names()).toEqual(['Ada', 'Jordan', 'Zoe', 'Aaron']);
    });
  });

  describe('on a meeting we were invited to', function () {
    const guests = [
      { email: 'ada@example.com', name: 'Ada', partstat: 'ACCEPTED' },
      { email: 'me@example.com', name: 'Me', partstat: 'NEEDS-ACTION' },
    ];

    beforeEach(function () {
      spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
        email === 'me@example.com' ? ({ id: 'a' } as any) : null
      );
    });

    const buttons = () => Array.from(host.querySelectorAll('button')).map((b) => b.textContent);

    const proposalHint = () => host.querySelector('.event-panel-proposal-hint');

    it('offers the answers and a new time', function () {
      render(invitation({ attendees: guests }));

      expect(buttons()).toContain('Yes');
      expect(proposalHint()).not.toBe(null);
    });

    it('turns the answers off while a proposal waits', function () {
      const yes = () =>
        Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Yes');
      const proposal = { eventId: 'e1', edits: [], times: null, proposal: { comment: '' } };
      render(invitation({ attendees: guests }), proposal);

      expect(yes().disabled).toBe(true);
    });

    it('offers neither once the organizer cancels it, and says so', function () {
      render(invitation({ attendees: guests, isCancelled: true }));

      expect(buttons()).not.toContain('Yes');
      expect(proposalHint()).toBe(null);
      expect(host.textContent).toContain('This event has been cancelled');
    });

    it('names its conflicts, where it is given them, until answered Yes or No', function () {
      const conflicts = [{ eventId: 'e2', title: 'Standup', start: START, end: START + 900 }];
      const shownFor = (partstat: string, given = conflicts) => {
        ReactDOM.render(
          React.createElement(EventPanel, {
            event: invitation({ attendees: [guests[0], { ...guests[1], partstat }] }),
            isCalendarReadOnly: false,
            onBack: () => {},
            unsentChange: null,
            onUnsentChange: () => {},
            onSendUnsentChange: () => {},
            onSaveChange: () => Promise.resolve(),
            conflicts: given,
          } as any),
          host
        );
        return Array.from(host.querySelectorAll('.event-panel-conflict')).map((n) => n.textContent);
      };

      expect(shownFor('NEEDS-ACTION')[0]).toContain('Conflicts with Standup');
      expect(shownFor('TENTATIVE').length).toBe(1);
      expect(shownFor('ACCEPTED').length).toBe(0);
      expect(shownFor('DECLINED').length).toBe(0);
      // The calendar gives none: its grid already shows what overlaps.
      expect(shownFor('NEEDS-ACTION', null).length).toBe(0);
    });

    describe('our answer', function () {
      const answering = (partstat: string) =>
        invitation({ attendees: [guests[0], { ...guests[1], partstat }] });
      const carets = () =>
        Array.from(host.querySelectorAll<HTMLElement>('[aria-label="Change your answer"]'));
      const rowButton = (label: string) =>
        Array.from(host.querySelectorAll('.event-panel-invitee button')).find(
          (b) => b.textContent === label
        );

      it('is sent from our row, which then closes', function () {
        const respond = spyOn(CalendarRsvp, 'respondToCalendarEvent').andReturn(Promise.resolve());
        const event = answering('ACCEPTED');
        render(event);

        carets()[0].click();
        expect(carets()[0].getAttribute('aria-expanded')).toBe('true');
        expect(rowButton('Yes').getAttribute('aria-pressed')).toBe('true');

        (rowButton('No') as HTMLElement).click();
        expect(respond).toHaveBeenCalledWith(event, 'DECLINED');
        expect(carets()[0].getAttribute('aria-expanded')).toBe('false');
        expect(rowButton('No')).toBeUndefined();
      });

      it('keeps focus in the panel when the button you answered with goes', function () {
        spyOn(CalendarRsvp, 'respondToCalendarEvent').andReturn(Promise.resolve());
        const panel = () => host.querySelector('.event-panel');
        const sectionButton = (label: string) =>
          Array.from(host.querySelectorAll<HTMLElement>('.event-panel-answer button')).find(
            (b) => b.textContent === label
          );

        render(answering('NEEDS-ACTION'));
        sectionButton('Yes').focus();
        render(answering('ACCEPTED'));
        expect(document.activeElement).toBe(panel());

        carets()[0].click();
        const no = rowButton('No') as HTMLElement;
        no.focus();
        no.click();
        expect(document.activeElement).toBe(panel());
      });

      it('has no caret while a proposal waits, nor on a read-only calendar', function () {
        const proposal = { eventId: 'e1', edits: [], times: null, proposal: { comment: '' } };
        render(answering('NEEDS-ACTION'), proposal);
        expect(carets().length).toBe(0);

        render(answering('NEEDS-ACTION'), null, true);
        expect(carets().length).toBe(0);
      });
    });
  });

  describe("on a meeting we organize, its guests' proposals", function () {
    const ics = (summary: string) =>
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:interview@test',
        'DTSTART:20261110T153000Z',
        'DTEND:20261110T163000Z',
        `SUMMARY:${summary}`,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const settle = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    let row: { ics: string };
    let loads: jasmine.Spy;

    beforeEach(function () {
      row = { ics: ics('Interview') };
      (DatabaseStore.find as jasmine.Spy).andCallFake(() => Promise.resolve(row));
      loads = spyOn(CalendarRsvp, 'proposedTimesFor').andReturn(Promise.resolve([]));
    });

    it('reload when the meeting changes, even at the same start, but not when another event syncs', async function () {
      const meeting = invitation({ isMine: true });
      render(meeting);
      await settle();
      expect(loads.callCount).toBe(1);

      render({ ...meeting });
      await settle();
      expect(loads.callCount).toBe(1);

      row = { ics: ics('Interview with Jordan') };
      render({ ...meeting });
      await settle();
      expect(loads.callCount).toBe(2);
    });
  });
});
