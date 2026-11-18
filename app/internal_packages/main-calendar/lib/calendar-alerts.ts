import _ from 'underscore';
import moment from 'moment';
import Rx from 'rx-lite';
import {
  Event,
  CalendarUtils,
  ICSEventHelpers,
  NativeNotifications,
  localized,
} from 'mailspring-exports';
import {
  EventOccurrence,
  EventRef,
  calendarExpansionInputs,
  eventRefFor,
  eventsInRangeQuery,
  isOffCalendar,
  isTimed,
  occurrenceStartUnix,
  occurrenceTimes,
  occurrencesForEvents,
} from './core/calendar-data-source';
import { ownRecurrenceId } from './core/recurring-event-actions';
import { formatShortTimeRange } from './core/calendar-helpers';

const ENABLED = 'core.notifications.enabledForCalendarAlerts';
const DISABLED_CALENDARS = 'mailspring.disabledCalendars';
const FIRED = 'calendar.firedAlerts';
const DAY = 86400;
// Google's longest alert is four weeks before.
const LOOKAHEAD = 29 * DAY;
const LATE_GRACE = 60;
// Timers stop while the Mac sleeps, so an alert due then shows within this of waking.
const LONGEST_WAIT = 60;

export interface CalendarAlert {
  /**
   * The meeting and the time, so copies on two calendars, or a set-time alert every occurrence of
   * a series shares, show once, and a moved occurrence's alert is a new one.
   */
  key: string;
  at: number;
  setTime: boolean;
  occurrence: EventOccurrence;
  row: Event;
}

export function alertsFor(
  rows: Event[],
  options: Parameters<typeof occurrencesForEvents>[1]
): CalendarAlert[] {
  const occurrencesByRow = new Map<string, EventOccurrence[]>();
  for (const occurrence of occurrencesForEvents(rows, options)) {
    if (isOffCalendar(occurrence)) continue;
    const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
    occurrencesByRow.set(eventId, [...(occurrencesByRow.get(eventId) || []), occurrence]);
  }
  return rows.flatMap((row) => {
    const occurrences = occurrencesByRow.get(row.id);
    if (!occurrences) return [];
    try {
      const { root } = CalendarUtils.parseICSString(row.ics);
      return occurrences.flatMap((occurrence) =>
        ICSEventHelpers.getAlarmTimes(
          root,
          ownRecurrenceId(occurrence, row),
          occurrenceTimes(occurrence)
        ).map(({ at, setTime }) => ({ key: `${row.icsuid}@${at}`, at, setTime, occurrence, row }))
      );
    } catch (err) {
      // An ICS that failed to expand (its master is drawn from the row's columns), or a TRIGGER
      // ical.js can't read; either would otherwise end the stream and every alert with it.
      return [];
    }
  });
}

/**
 * The last moment an alert may still show: a minute past its event's start, or past its own time
 * when that comes later. A set-time alert belongs to no one occurrence, so it gets the minute only.
 */
function lastChance(alert: CalendarAlert) {
  const start = alert.setTime ? alert.at : occurrenceStartUnix(alert.occurrence);
  return Math.max(alert.at, start) + LATE_GRACE;
}

export function dueAlerts(alerts: CalendarAlert[], now: number, fired: FiredAlerts) {
  const due = alerts
    .filter((alert) => alert.at <= now && now < lastChance(alert) && !fired.has(alert.key))
    .sort((a, b) => a.at - b.at);
  return _.uniq(due, false, (alert) => alert.key);
}

/** The alerts already shown, kept until they could no longer show, so a reload doesn't repeat them. */
export class FiredAlerts {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage) {}

  has(key: string) {
    return key in this._read();
  }

  add(alert: CalendarAlert, now: number) {
    const fired = this._read();
    for (const key of Object.keys(fired)) {
      if (fired[key] <= now) delete fired[key];
    }
    fired[alert.key] = lastChance(alert);
    this.storage.setItem(FIRED, JSON.stringify(fired));
  }

  _read(): { [key: string]: number } {
    return JSON.parse(this.storage.getItem(FIRED) || '{}');
  }
}

/** "Today, 2:00 – 2:30 PM", "Tomorrow, all day", "Fri, Nov 20, 9 – 10 AM". */
export function alertTimeLabel(occurrence: EventOccurrence, now: number): string {
  const start = moment.unix(occurrenceStartUnix(occurrence));
  const today = moment.unix(now);
  let day = start.format('ddd, MMM D');
  if (start.isSame(today, 'day')) day = localized('Today');
  else if (start.isSame(today.clone().add(1, 'day'), 'day')) day = localized('Tomorrow');
  return isTimed(occurrence)
    ? `${day}, ${formatShortTimeRange(occurrence.start, occurrence.end)}`
    : localized('%@, all day', day);
}

export class CalendarAlerts {
  private fired = new FiredAlerts();
  private alerts: CalendarAlert[] = [];
  private coveredFrom: number | null = null;
  private subscription?: Rx.IDisposable;
  private timer?: ReturnType<typeof setTimeout>;
  private configObservers: { dispose: () => void }[] = [];

  constructor(private open: (ref: EventRef) => void) {}

  start() {
    this.configObservers = [
      AppEnv.config.observe(ENABLED, () => this._restart()),
      AppEnv.config.onDidChange(DISABLED_CALENDARS, () => this._restart()),
    ];
  }

  dispose() {
    this.configObservers.forEach((observer) => observer.dispose());
    this._stop();
  }

  _restart() {
    if (AppEnv.config.get(ENABLED)) this._watch();
    else this._stop();
  }

  _watch() {
    const now = Date.now() / 1000;
    // From a day back, so an event under way is found despite the coarse range columns.
    const startUnix = now - DAY;
    const endUnix = now + LOOKAHEAD;
    this.subscription?.dispose();
    this.coveredFrom = startUnix;
    const query = eventsInRangeQuery(startUnix, endUnix, AppEnv.config.get(DISABLED_CALENDARS));
    this.subscription = Rx.Observable.combineLatest(
      Rx.Observable.fromQuery(query),
      calendarExpansionInputs(),
      (rows: Event[], inputs) => alertsFor(rows, { startUnix, endUnix, ...inputs })
    ).subscribe((alerts) => {
      this.alerts = alerts;
      this._check();
    });
  }

  _stop() {
    this.subscription?.dispose();
    this.subscription = undefined;
    this.coveredFrom = null;
    this.alerts = [];
    clearTimeout(this.timer);
  }

  _check = () => {
    clearTimeout(this.timer);
    const now = Date.now() / 1000;
    if (this.coveredFrom === null) return;
    if (now - this.coveredFrom > 2 * DAY) {
      this._watch();
      return;
    }
    for (const alert of dueAlerts(this.alerts, now, this.fired)) {
      this.fired.add(alert, now);
      this._show(alert, now);
    }
    const next = Math.min(...this.alerts.map((alert) => alert.at).filter((at) => at > now));
    const wait = Math.min(next - now, LONGEST_WAIT);
    this.timer = setTimeout(this._check, Math.max(wait, 1) * 1000);
  };

  _show({ occurrence, row }: CalendarAlert, now: number) {
    NativeNotifications.displayNotification({
      title: occurrence.title || localized('(No title)'),
      subtitle: alertTimeLabel(occurrence, now),
      body: occurrence.location || undefined,
      playDefaultSound: true,
      onActivate: () => {
        AppEnv.displayWindow();
        this.open(eventRefFor(occurrence, row));
      },
    });
  }
}
