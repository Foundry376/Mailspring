import momentTz from 'moment-timezone';
import { AccountStore, Event } from 'mailspring-exports';
import {
  FiredAlerts,
  dueAlerts,
  alertsFor,
} from '../internal_packages/main-calendar/lib/calendar-alerts';
import { occurrenceStartUnix } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const ZONE = 'America/Chicago';
const at = (wall: string) => momentTz.tz(wall, ZONE).unix();
// All-day events count from the machine's own midnight, which setDefault doesn't move.
const localTime = (year: number, month: number, day: number, hour: number) =>
  new Date(year, month - 1, day, hour).getTime() / 1000;
const ME = 'me@example.com';

function ics(...vevents: string[][]) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    ...vevents.flatMap((lines) => [
      'BEGIN:VEVENT',
      'UID:alert@test',
      'DTSTAMP:20261001T000000Z',
      'SUMMARY:Design review',
      ...lines,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');
}

const alarm = (trigger: string, action = 'DISPLAY') => [
  'BEGIN:VALARM',
  `ACTION:${action}`,
  'DESCRIPTION:Design review',
  trigger,
  'END:VALARM',
];

const timed = (start: string, end: string, ...rest: string[]) => [
  `DTSTART;TZID=${ZONE}:${start}`,
  `DTEND;TZID=${ZONE}:${end}`,
  ...rest,
];

const row = (text: string, id = 'e1') =>
  new Event({
    id,
    accountId: 'a',
    calendarId: 'c',
    icsuid: `${id}@test`,
    ics: text,
    recurrenceStart: at('2026-01-01 00:00'),
    recurrenceEnd: at('2027-12-31 00:00'),
  } as any);

const alertsOf = (text: string) =>
  alertsFor([row(text)], { startUnix: at('2026-01-01 00:00'), endUnix: at('2027-12-31 00:00') });

const timesOf = (text: string) => alertsOf(text).map((alert) => alert.at);

describe('calendar event alerts', () => {
  beforeEach(() => {
    momentTz.tz.setDefault(ZONE);
    spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
      email === ME ? ({ id: 'a' } as any) : null
    );
  });

  afterEach(() => {
    momentTz.tz.setDefault();
  });

  describe('when each alert goes off', () => {
    it('rings ten minutes before a timed event, for each alert it has', () => {
      const text = ics(timed('20261118T140000', '20261118T143000', ...alarm('TRIGGER:-PT10M')));
      expect(timesOf(text)).toEqual([at('2026-11-18 13:50')]);

      const twoAlerts = ics(
        timed(
          '20261118T140000',
          '20261118T143000',
          ...alarm('TRIGGER:-P0DT0H10M0S'),
          ...alarm('TRIGGER:-PT1H')
        )
      );
      expect(timesOf(twoAlerts)).toEqual([at('2026-11-18 13:50'), at('2026-11-18 13:00')]);
    });

    it('keeps the clock time for "1 day before" across a DST change, but counts hours exactly', () => {
      // Clocks spring forward at 2 AM on 2026-03-08, between the event and its alert.
      const dayBefore = ics(timed('20260308T090000', '20260308T100000', ...alarm('TRIGGER:-P1D')));
      expect(timesOf(dayBefore)).toEqual([at('2026-03-07 09:00')]);

      const hoursBefore = ics(
        timed('20260308T090000', '20260308T100000', ...alarm('TRIGGER:-PT24H'))
      );
      expect(timesOf(hoursBefore)).toEqual([at('2026-03-07 08:00')]);
    });

    it('counts an all-day event from midnight, so -PT15H is 9 AM the day before', () => {
      const text = ics([
        'DTSTART;VALUE=DATE:20261120',
        'DTEND;VALUE=DATE:20261121',
        ...alarm('TRIGGER:-PT15H'),
      ]);
      expect(timesOf(text)).toEqual([localTime(2026, 11, 19, 9)]);
    });

    it('rings a set-time alert at its time, and a RELATED=END one from the end', () => {
      const setTime = ics(
        timed(
          '20261118T140000',
          '20261118T150000',
          ...alarm('TRIGGER;VALUE=DATE-TIME:20261118T180000Z')
        )
      );
      expect(timesOf(setTime)).toEqual([at('2026-11-18 12:00')]);

      const fromEnd = ics(
        timed('20261118T140000', '20261118T150000', ...alarm('TRIGGER;RELATED=END:-PT5M'))
      );
      expect(timesOf(fromEnd)).toEqual([at('2026-11-18 14:55')]);
    });

    it('rings each occurrence of a series, and a moved occurrence by its own alert', () => {
      const text = ics(
        timed(
          '20261102T090000',
          '20261102T093000',
          'RRULE:FREQ=WEEKLY;COUNT=3',
          ...alarm('TRIGGER:-PT10M')
        ),
        timed(
          '20261109T110000',
          '20261109T113000',
          `RECURRENCE-ID;TZID=${ZONE}:20261109T090000`,
          ...alarm('TRIGGER:-PT30M')
        )
      );
      expect(timesOf(text).sort()).toEqual(
        [at('2026-11-02 08:50'), at('2026-11-09 10:30'), at('2026-11-16 08:50')].sort()
      );
    });
  });

  describe('which events ring', () => {
    it('skips declined and cancelled events, and email alerts', () => {
      const event = (...rest: string[]) =>
        ics(timed('20261118T140000', '20261118T143000', ...rest, ...alarm('TRIGGER:-PT10M')));
      expect(timesOf(event(`ATTENDEE;PARTSTAT=ACCEPTED:mailto:${ME}`)).length).toBe(1);
      expect(timesOf(event(`ATTENDEE;PARTSTAT=TENTATIVE:mailto:${ME}`)).length).toBe(1);
      expect(timesOf(event(`ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:${ME}`)).length).toBe(1);
      expect(timesOf(event(`ATTENDEE;PARTSTAT=DECLINED:mailto:${ME}`))).toEqual([]);
      expect(timesOf(event('STATUS:CANCELLED'))).toEqual([]);

      const email = ics(
        timed('20261118T140000', '20261118T143000', ...alarm('TRIGGER:-PT10M', 'EMAIL'))
      );
      expect(timesOf(email)).toEqual([]);
    });

    it("shows one banner when two calendars' copies of a meeting ring together", () => {
      const copy = (id: string, calendarId: string, trigger: string) =>
        new Event({
          id,
          accountId: 'a',
          calendarId,
          icsuid: 'shared@test',
          ics: ics(timed('20261118T140000', '20261118T143000', ...alarm(trigger))),
          recurrenceStart: at('2026-11-18 14:00'),
          recurrenceEnd: at('2026-11-18 14:30'),
        } as any);
      const range = { startUnix: at('2026-11-01 00:00'), endUnix: at('2026-12-01 00:00') };
      const fired = new FiredAlerts(fakeStorage());

      const same = alertsFor(
        [copy('o', 'c1', 'TRIGGER:-PT10M'), copy('g', 'c2', 'TRIGGER:-PT10M')],
        range
      );
      expect(dueAlerts(same, at('2026-11-18 13:50'), fired).length).toBe(1);

      const apart = alertsFor(
        [copy('o', 'c1', 'TRIGGER:-PT10M'), copy('g', 'c2', 'TRIGGER:-PT1H')],
        range
      );
      expect(apart.map((alert) => alert.at).sort()).toEqual(
        [at('2026-11-18 13:00'), at('2026-11-18 13:50')].sort()
      );
    });

    it('shows a set-time alert on a series once, at its time', () => {
      const alerts = alertsOf(
        ics(
          timed(
            '20261102T090000',
            '20261102T093000',
            'RRULE:FREQ=WEEKLY;COUNT=4',
            ...alarm('TRIGGER;VALUE=DATE-TIME:20261101T150000Z')
          )
        )
      );
      expect(alerts.length).toBe(1);
      expect(occurrenceStartUnix(alerts[0].occurrence)).toBe(at('2026-11-02 09:00'));
      const fired = new FiredAlerts(fakeStorage());
      expect(dueAlerts(alerts, at('2026-11-01 09:00'), fired).length).toBe(1);
      expect(dueAlerts(alerts, at('2026-11-08 08:00'), fired)).toEqual([]);
    });

    it('shows a missed set-time alert on a one-off event until the event starts', () => {
      const [alert] = alertsOf(
        ics(
          timed(
            '20261118T140000',
            '20261118T143000',
            ...alarm('TRIGGER;VALUE=DATE-TIME:20261118T180000Z')
          )
        )
      );
      const fired = new FiredAlerts(fakeStorage());
      expect(dueAlerts([alert], at('2026-11-18 13:00'), fired)).toEqual([alert]);
      expect(dueAlerts([alert], at('2026-11-18 14:01'), fired)).toEqual([]);
    });

    it("rings two occurrences' alerts that land on the same moment", () => {
      const alerts = alertsOf(
        ics(
          timed(
            '20261102T090000',
            '20261102T093000',
            'RRULE:FREQ=DAILY;COUNT=3',
            ...alarm('TRIGGER:-P1D'),
            ...alarm('TRIGGER:PT0S')
          )
        )
      );
      const nine = at('2026-11-03 09:00');
      const due = dueAlerts(alerts, nine, new FiredAlerts(fakeStorage()));
      expect(due.filter((alert) => alert.at === nine).length).toBe(2);
    });

    it("rings other events' alerts when one event's alert can't be read", () => {
      const event = (trigger: string) =>
        ics(timed('20261118T140000', '20261118T143000', ...alarm(trigger)));
      const alerts = alertsFor([row(event('TRIGGER:-PT10'), 'bad'), row(event('TRIGGER:-PT10M'))], {
        startUnix: at('2026-11-01 00:00'),
        endUnix: at('2026-12-01 00:00'),
      });
      expect(alerts.map((alert) => alert.at)).toEqual([at('2026-11-18 13:50')]);
    });

    it('shows a late alert only until a minute after its event starts', () => {
      const [alert] = alertsOf(
        ics(timed('20261118T090000', '20261118T093000', ...alarm('TRIGGER:-PT10M')))
      );
      const fired = new FiredAlerts(fakeStorage());
      expect(dueAlerts([alert], at('2026-11-18 08:49'), fired)).toEqual([]);
      expect(dueAlerts([alert], at('2026-11-18 08:55'), fired)).toEqual([alert]);
      expect(dueAlerts([alert], at('2026-11-18 09:00') + 30, fired)).toEqual([alert]);
      expect(dueAlerts([alert], at('2026-11-18 09:01'), fired)).toEqual([]);
    });

    it('rings an alert set for after its event starts, at its own time', () => {
      const fired = new FiredAlerts(fakeStorage());
      const [onTheDay] = alertsOf(
        ics(['DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121', ...alarm('TRIGGER:PT9H')])
      );
      expect(onTheDay.at).toBe(localTime(2026, 11, 20, 9));
      expect(dueAlerts([onTheDay], onTheDay.at + 30, fired)).toEqual([onTheDay]);
      expect(dueAlerts([onTheDay], onTheDay.at + 60, fired)).toEqual([]);

      const [beforeTheEnd] = alertsOf(
        ics(timed('20261118T140000', '20261118T150000', ...alarm('TRIGGER;RELATED=END:-PT5M')))
      );
      expect(dueAlerts([beforeTheEnd], at('2026-11-18 14:55'), fired)).toEqual([beforeTheEnd]);
    });
  });

  describe('the record of alerts already shown', () => {
    const event = (start: string, end: string) =>
      alertsOf(ics(timed(start, end, ...alarm('TRIGGER:-PT10M'))))[0];

    it('keeps a shown alert from showing again after a reload, until it could no longer show', () => {
      const storage = fakeStorage();
      const morning = event('20261118T090000', '20261118T093000');
      const later = event('20261118T090500', '20261118T093000');
      const afternoon = event('20261118T140000', '20261118T143000');
      new FiredAlerts(storage).add(morning, at('2026-11-18 08:50'));

      const reloaded = new FiredAlerts(storage);
      reloaded.add(later, at('2026-11-18 08:55'));
      expect(new FiredAlerts(storage).has(morning.key)).toBe(true);
      expect(dueAlerts([morning], at('2026-11-18 09:00'), new FiredAlerts(storage))).toEqual([]);

      reloaded.add(afternoon, at('2026-11-18 13:50'));
      expect(new FiredAlerts(storage).has(morning.key)).toBe(false);
      expect(new FiredAlerts(storage).has(afternoon.key)).toBe(true);
    });

    it('rings again for an event moved to a new time', () => {
      const storage = fakeStorage();
      const before = event('20261118T090000', '20261118T093000');
      new FiredAlerts(storage).add(before, at('2026-11-18 08:50'));
      const moved = event('20261118T100000', '20261118T103000');
      expect(dueAlerts([moved], at('2026-11-18 09:50'), new FiredAlerts(storage))).toEqual([moved]);
    });
  });
});

function fakeStorage() {
  const items: { [key: string]: string } = {};
  return {
    getItem: (key: string) => (key in items ? items[key] : null),
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  };
}
