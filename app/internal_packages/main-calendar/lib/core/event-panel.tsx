import React from 'react';
import {
  localized,
  isRTL,
  Autolink,
  Calendar,
  CalendarUtils,
  DatabaseStore,
  DateUtils,
  Event,
  ICSEventHelpers,
  Utils,
} from 'mailspring-exports';
import { RetinaImg, ScrollRegion } from 'mailspring-component-kit';
import { EventOccurrence, EventAttendee, isTimed } from './calendar-data-source';
import {
  calcEventColors,
  extractNotesFromDescription,
  formatShortTime,
  momentOf,
} from './calendar-helpers';
import { AttendeeStatusIcon, attendeeStatusClass, sortAttendeesByStatus } from './attendee-status';
import { RepeatOption, frequencyToRepeatOption, repeatLabel } from './repeat-selector';
import { formatTimezone } from './timezone-selector';
import { showAsLabel } from './show-as-selector';

interface EventPanelProps {
  event: EventOccurrence;
  /** The calendar the event is on, for the calendar row; omitted while calendars load. */
  calendar?: Calendar;
  onBack: () => void;
  /** Buttons the host shows in the header beside "‹ Agenda". */
  headerActions?: React.ReactNode;
}

interface EventPanelState {
  /** Read from the event's row: the occurrence doesn't carry it. */
  repeat: RepeatOption;
}

const icon = (paths: React.ReactNode) => (
  <svg
    className="event-panel-icon"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

const CLOCK_ICON = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
);
const ARROW_ICON = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
const GLOBE_ICON = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.3 3.5 5.2 3.5 8.5s-1 6.2-3.5 8.5c-2.5-2.3-3.5-5.2-3.5-8.5s1-6.2 3.5-8.5z" />
  </>
);
const REPEAT_ICON = icon(
  <>
    <path d="M4 11a7 7 0 0 1 12.5-4.3L19 9M20 13a7 7 0 0 1-12.5 4.3L5 15" />
    <path d="M19 4.5V9h-4.5M5 19.5V15h4.5" />
  </>
);
const PERSON_ICON = icon(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </>
);
const VIDEO_ICON = icon(
  <>
    <rect x="3" y="6.5" width="12" height="11" rx="2" />
    <path d="M15 10.5l6-3.5v10l-6-3.5" />
  </>
);

/**
 * An event's details in the calendar's right-hand panel, over the agenda. Rows are an icon and
 * a value; a field the event leaves empty has no row.
 */
export class EventPanel extends React.Component<EventPanelProps, EventPanelState> {
  static displayName = 'EventPanel';

  state: EventPanelState = { repeat: 'none' };

  _notesRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._loadEventRow();
    this._autolink();
  }

  componentDidUpdate(prevProps: EventPanelProps) {
    if (prevProps.event !== this.props.event) {
      this._loadEventRow();
    }
    this._autolink();
  }

  async _loadEventRow() {
    const occurrence = this.props.event;
    const row = await DatabaseStore.find<Event>(
      Event,
      CalendarUtils.parseOccurrenceId(occurrence.id).eventId
    );
    if (this.props.event !== occurrence || !row) return;
    this.setState({
      repeat: frequencyToRepeatOption(ICSEventHelpers.getRecurrenceInfo(row.ics).frequency),
    });
  }

  _autolink() {
    if (!this._notesRef.current) return;
    Autolink(this._notesRef.current, { async: false, telAggressiveMatch: true });
  }

  _renderHeader() {
    return (
      <div className="event-panel-header">
        <button
          className="btn-bare event-panel-back"
          title={localized('Return to %@', localized('Agenda'))}
          onClick={this.props.onBack}
        >
          <RetinaImg
            name="sheet-back.png"
            mode={RetinaImg.Mode.ContentIsMask}
            style={isRTL ? { transform: `scaleX(-1)` } : {}}
          />
          {localized('Agenda')}
        </button>
        {this.props.headerActions}
      </div>
    );
  }

  _renderWhen() {
    const { event } = this.props;
    const firstDay = momentOf(event.startDate).format('ddd MMM D');
    const days =
      event.startDate === event.endDate
        ? firstDay
        : `${firstDay} – ${momentOf(event.endDate).format('ddd MMM D')}`;

    if (!isTimed(event)) {
      return (
        <div className="event-panel-section">
          <div className="event-panel-row">
            {CLOCK_ICON}
            <span>{days}</span>
          </div>
          <div className="event-panel-row indented">{localized('All day')}</div>
        </div>
      );
    }
    return (
      <div className="event-panel-section">
        <div className="event-panel-row">
          {CLOCK_ICON}
          <span>{formatShortTime(event.start)}</span>
          {ARROW_ICON}
          <span>
            {formatShortTime(event.end)}{' '}
            <span className="event-panel-subtle">
              {DateUtils.formatDuration(event.end - event.start)}
            </span>
          </span>
        </div>
        <div className="event-panel-row indented">{days}</div>
        <div className="event-panel-row">
          {GLOBE_ICON}
          {/* The zone the times above are shown in, which may not be the event's own. */}
          {formatTimezone(DateUtils.timeZone)}
        </div>
        {this.state.repeat !== 'none' && (
          <div className="event-panel-row">
            {REPEAT_ICON}
            {repeatLabel(this.state.repeat)}
          </div>
        )}
      </div>
    );
  }

  _isOrganizer(attendee: EventAttendee) {
    const { organizer } = this.props.event;
    return !!organizer && Utils.emailIsEquivalent(attendee.email, organizer.email);
  }

  _renderInviteesAndPlace() {
    const { attendees, location } = this.props.event;
    if (attendees.length === 0 && !location) return null;
    return (
      <div className="event-panel-section">
        {attendees.length > 0 && (
          <div className="event-panel-row top">
            {PERSON_ICON}
            <div className="event-panel-invitees">
              {sortAttendeesByStatus(attendees).map((a) => (
                <div key={a.email} className={`event-panel-invitee ${attendeeStatusClass(a)}`}>
                  <span className="attendee-status">
                    <AttendeeStatusIcon attendee={a} />
                  </span>
                  <div className="event-panel-invitee-name">
                    <div>{a.name || a.email}</div>
                    {this._isOrganizer(a) && (
                      <div className="event-panel-subtle">{localized('Organizer')}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {location && (
          <div className="event-panel-row">
            {VIDEO_ICON}
            <span className="event-panel-location">
              {location.startsWith('http') || location.startsWith('tel:') ? (
                <a href={location}>{location}</a>
              ) : (
                location
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  _renderNotes() {
    const notes = extractNotesFromDescription(this.props.event.description || '').trim();
    if (!notes) return null;
    return (
      <div className="event-panel-section event-panel-notes" ref={this._notesRef}>
        {notes}
      </div>
    );
  }

  _renderCalendar() {
    const { event, calendar } = this.props;
    return (
      <div className="event-panel-section">
        {calendar && (
          <div className="event-panel-row">
            <span className="event-panel-icon">
              <span
                className="event-panel-calendar-swatch"
                style={{ backgroundColor: calcEventColors(event.calendarId).band }}
              />
            </span>
            {calendar.name}
          </div>
        )}
        <div className="event-panel-row indented">
          {showAsLabel(event.isFree ? 'TRANSPARENT' : 'OPAQUE')}
        </div>
      </div>
    );
  }

  render() {
    const { event } = this.props;
    return (
      <aside className="event-panel" aria-label={localized('Event')}>
        {this._renderHeader()}
        <ScrollRegion className="event-panel-body">
          <div className="event-panel-title">
            {event.isCancelled ? (
              <s>{event.title || localized('(No title)')}</s>
            ) : (
              event.title || localized('(No title)')
            )}
          </div>
          {this._renderWhen()}
          {this._renderInviteesAndPlace()}
          {this._renderNotes()}
          {this._renderCalendar()}
        </ScrollRegion>
      </aside>
    );
  }
}
