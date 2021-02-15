import Rx from 'rx-lite';
import { Event, Matcher, DatabaseStore } from 'mailspring-exports';
import IcalExpander from 'ical-expander';

export interface EventOccurrence {
  start: number; // unix
  end: number; // unix
  id: string;
  accountId: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  isAllDay: boolean;
  organizer: { email: string } | null;
  attendees: { email: string; name: string }[];
}

export class CalendarDataSource {
  observable: Rx.Observable<{ events: EventOccurrence[] }>;

  buildObservable({ startUnix, endUnix, disabledCalendars }) {
    const end = Event.attributes.recurrenceEnd;
    const start = Event.attributes.recurrenceStart;

    const matcher = new Matcher.Or([
      new Matcher.And([start.lte(endUnix), end.gte(startUnix)]),
      new Matcher.And([start.lte(endUnix), start.gte(startUnix)]),
      new Matcher.And([end.gte(startUnix), end.lte(endUnix)]),
      new Matcher.And([end.gte(endUnix), start.lte(startUnix)]),
    ]);

    if (disabledCalendars && disabledCalendars.length) {
      new Matcher.And([matcher, Event.attributes.calendarId.notIn(disabledCalendars)]);
    }

    const query = DatabaseStore.findAll<Event>(Event).where(matcher);
    this.observable = Rx.Observable.fromQuery(query).flatMapLatest(results =>
      Rx.Observable.from([{ events: occurrencesForEvents(results, { startUnix, endUnix }) }])
    );
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}

export function occurrencesForEvents(
  results: Event[],
  { startUnix, endUnix }: { startUnix: number; endUnix: number }
) {
  const occurences: EventOccurrence[] = [];

  results.forEach(result => {
    const icalExpander = new IcalExpander({ ics: result.ics, maxIterations: 100 });
    const expanded = icalExpander.between(new Date(startUnix * 1000), new Date(endUnix * 1000));

    [...expanded.events, ...expanded.occurrences].forEach((e, idx) => {
      const start = e.startDate.toJSDate().getTime() / 1000;
      const end = e.endDate.toJSDate().getTime() / 1000;
      const item = e.item || e;
      occurences.push({
        start,
        end,
        id: `${result.id}-e${idx}`,
        accountId: result.accountId,
        calendarId: result.calendarId,
        title: item.summary,
        location: item.location,
        description: item.description,
        isAllDay: end - start >= 86400 - 1,
        organizer: item.organizer ? { email: item.organizer } : null,
        attendees: item.attendees.map(a => ({
          ...a.jCal[1],
          email: a.getFirstValue(),
        })),
      });
    });
  });

  return occurences;
}
