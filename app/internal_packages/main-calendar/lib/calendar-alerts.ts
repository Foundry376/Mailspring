import moment from 'moment';
import Rx from 'rx-lite';
import {
  Event,
  Matcher,
  DatabaseStore,
  CalendarUtils,
  ICSEventHelpers,
  NativeNotifications,
  localized,
} from 'mailspring-exports';
import {
  EventOccurrence,
  EventRef,
  isOffCalendar,
  isTimed,
  occurrenceEndUnix,
  occurrenceSlot,
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
const START_GRACE = 60;
// Timers stop while the Mac sleeps, so a alert due then shows within this of waking.
const LONGEST_WAIT = 60;

export interface CalendarAlert {
  /** Names this alert of this occurrence at this time, so a moved one is a new alert. */
  key: string;
  at: number;
  occurrence: EventOccurrence;
  row: Event;
}

/** Every alert the occurrences of `rows` between `startUnix` and `endUnix` ring. */
export function alertsFor(rows: Event[], startUnix: number, endUnix: number): CalendarAlert[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return occurrencesForEvents(rows, { startUnix, endUnix })
    .filter((occurrence) => !isOffCalendar(occurrence))
    .flatMap((occurrence) => {
      const row = rowsById.get(CalendarUtils.parseOccurrenceId(occurrence.id).eventId);
      if (!row) return [];
      let times: number[];
      try {
        times = ICSEventHelpers.getAlarmTimes(
          row.ics,
          ownRecurrenceId(occurrence, row),
          occurrenceTimes(occurrence)
        );
      } catch (err) {
        // A master whose ICS failed to expand is still drawn, from its row's columns.
        return [];
      }
      return times.map((at) => ({ key: `${occurrence.id}@${at}`, at, occurrence, row }));
    });
}

/**
 * The alerts to show at `now`: due, not shown yet, and for an event that hasn't started, give
 * or take a minute so an "At time of event" alert isn't lost to a late timer.
 */
export function dueAlerts(alerts: CalendarAlert[], now: number, fired: FiredAlerts) {
  return alerts
    .filter(
      (r) =>
        r.at <= now && occurrenceStartUnix(r.occurrence) + START_GRACE > now && !fired.has(r.key)
    )
    .sort((a, b) => a.at - b.at);
}

/**
 * The alerts already shown, kept until their event is over so a reload or a relaunch doesn't
 * show them again.
 */
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
    fired[alert.key] = occurrenceEndUnix(alert.occurrence);
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

/** Shows each calendar alert as a desktop notification when it comes due. */
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
    // Like Notion Calendar, a calendar unticked in the sidebar doesn't ring.
    const hidden: string[] = AppEnv.config.get(DISABLED_CALENDARS) || [];
    const inRange = CalendarUtils.eventsInRangeMatcher(startUnix, endUnix);
    const query = DatabaseStore.findAll<Event>(Event).where(
      hidden.length
        ? new Matcher.And([inRange, Event.attributes.calendarId.notIn(hidden)])
        : inRange
    );
    this.subscription = Rx.Observable.fromQuery(query).subscribe((rows: Event[]) => {
      this.alerts = alertsFor(rows, startUnix, endUnix);
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
    const next = Math.min(...this.alerts.map((r) => r.at).filter((at) => at > now));
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
        this.open({
          icsuid: row.icsuid,
          accountId: row.accountId,
          calendarId: row.calendarId,
          recurrenceIdStart: occurrence.isRecurring ? occurrenceSlot(occurrence) : undefined,
        });
      },
    });
  }
}
