import Rx from 'rx-lite';
import { Event, Matcher, DatabaseStore } from 'mailspring-exports';
import IcalExpander from 'ical-expander';

export default class CalendarDataSource {
  buildObservable({ startTime, endTime, disabledCalendars }) {
    const end = Event.attributes.recurrenceEnd;
    const start = Event.attributes.recurrenceStart;

    let matcher = new Matcher.Or([
      new Matcher.And([start.lte(endTime), end.gte(startTime)]),
      new Matcher.And([start.lte(endTime), start.gte(startTime)]),
      new Matcher.And([end.gte(startTime), end.lte(endTime)]),
      new Matcher.And([end.gte(endTime), start.lte(startTime)]),
    ]);

    if (disabledCalendars && disabledCalendars.length) {
      new Matcher.And([matcher, Event.attributes.calendarId.notIn(disabledCalendars)]);
    }

    const query = DatabaseStore.findAll<Event>(Event).where(matcher);
    this.observable = Rx.Observable.fromQuery(query).flatMapLatest(results => {
      const events = [];
      results.forEach(result => {
        const icalExpander = new IcalExpander({ ics: result.ics, maxIterations: 100 });
        const expanded = icalExpander.between(new Date(startTime * 1000), new Date(endTime * 1000));

        [...expanded.events, ...expanded.occurrences].forEach((e, idx) => {
          const start = e.startDate.toJSDate().getTime() / 1000;
          const end = e.endDate.toJSDate().getTime() / 1000;
          const item = e.item || e;
          events.push({
            start,
            end,
            id: `${result.id}-e${idx}`,
            calendarId: result.calendarId,
            title: item.summary,
            displayTitle: item.summary,
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
      return Rx.Observable.from([{ events }]);
    });
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}
