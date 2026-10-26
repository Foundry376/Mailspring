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
import { RetinaImg, ScrollRegion, SVGIcons } from 'mailspring-component-kit';
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
            <SVGIcons.Clock className="event-panel-icon" />
            <span>{days}</span>
          </div>
          <div className="event-panel-row indented">{localized('All day')}</div>
        </div>
      );
    }
    return (
      <div className="event-panel-section">
        <div className="event-panel-row">
          <SVGIcons.Clock className="event-panel-icon" />
          <span>{formatShortTime(event.start)}</span>
          <SVGIcons.ArrowRight className="event-panel-icon" />
          <span>
            {formatShortTime(event.end)}{' '}
            <span className="event-panel-subtle">
              {DateUtils.formatDuration(event.end - event.start)}
            </span>
          </span>
        </div>
        <div className="event-panel-row indented">{days}</div>
        <div className="event-panel-row">
          <SVGIcons.Globe className="event-panel-icon" />
          {/* The zone the times above are shown in, which may not be the event's own. */}
          {formatTimezone(DateUtils.timeZone)}
        </div>
        {this.state.repeat !== 'none' && (
          <div className="event-panel-row">
            <SVGIcons.Repeat className="event-panel-icon" />
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
            <SVGIcons.Person className="event-panel-icon" />
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
            <SVGIcons.Video className="event-panel-icon" />
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
