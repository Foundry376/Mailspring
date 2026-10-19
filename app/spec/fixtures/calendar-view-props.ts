import moment from 'moment';
import Rx from 'rx-lite';
import { MailspringCalendarViewProps } from '../../internal_packages/main-calendar/lib/core/mailspring-calendar';
import {
  EventOccurrence,
  coveredDates,
} from '../../internal_packages/main-calendar/lib/core/calendar-data-source';

const NO_CALENDARS: string[] = [];

/** Props a calendar view renders with in a spec, no events and every handler a no-op. */
export function calendarViewProps(
  overrides: Partial<MailspringCalendarViewProps> = {}
): MailspringCalendarViewProps {
  return {
    dataSource: { buildObservable: () => Rx.Observable.just({ events: [] }) } as any,
    disabledCalendars: NO_CALENDARS,
    focusedMoment: moment(),
    focusedEvent: null,
    selectedEvents: [],
    onChangeView: () => {},
    onChangeFocusedMoment: () => {},
    onCalendarMouseUp: () => {},
    onCalendarMouseDown: () => {},
    onCalendarMouseMove: () => {},
    onCalendarClick: () => {},
    onCalendarDoubleClick: () => {},
    onCalendarContextMenu: () => {},
    onEventClick: () => {},
    onEventDoubleClick: () => {},
    onEventContextMenu: () => {},
    onEventFocused: () => {},
    onEventDragStart: () => {},
    dragState: null,
    newEventPreview: null,
    readOnlyCalendarIds: new Set(),
    isCalendarReadOnly: () => false,
    paintVersion: '',
    ...overrides,
  };
}

/** An all-day occurrence titled with its id, from `iso` through `lastIso`. */
export function allDayOccurrence(id: string, iso: string, lastIso = iso): EventOccurrence {
  const start = moment(iso).unix();
  return {
    id,
    accountId: 'acct-1',
    calendarId: 'cal-1',
    title: id,
    location: '',
    description: '',
    isCancelled: false,
    isPending: false,
    isMine: true,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    ...coveredDates(start, moment(lastIso).add(1, 'day').unix(), true),
    isAllDay: true,
  } as EventOccurrence;
}
