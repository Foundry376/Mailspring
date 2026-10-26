import React from 'react';
import {
  localized,
  isRTL,
  Autolink,
  Calendar,
  CalendarDateUtils,
  CalendarUtils,
  DatabaseStore,
  DateUtils,
  Event,
  ICSEventHelpers,
  SyncbackEventTask,
  TaskQueue,
  Utils,
} from 'mailspring-exports';
import {
  DatePicker,
  RetinaImg,
  ScrollRegion,
  SVGIcons,
  Switch,
  TimePicker,
} from 'mailspring-component-kit';
import {
  EventOccurrence,
  EventAttendee,
  isTimed,
  occurrenceStartUnix,
} from './calendar-data-source';
import {
  allDayToggleTimes,
  calcEventColors,
  canEditInPanel,
  clampEnd,
  extractNotesFromDescription,
  formatShortTime,
  inclusiveAllDayEnd,
  momentOf,
  shiftEndWithStart,
} from './calendar-helpers';
import { AttendeeStatusIcon, attendeeStatusClass, sortAttendeesByStatus } from './attendee-status';
import {
  RepeatOption,
  frequencyToRepeatOption,
  repeatLabel,
  repeatOptionToRRule,
} from './repeat-selector';
import { formatTimezone } from './timezone-selector';
import { ShowAsOption, showAsLabel } from './show-as-selector';
import { canRespondToEvent, openProposeNewTimePopover } from './calendar-rsvp';
import {
  EventPropertyEdit,
  modifySimpleEvent,
  modifySimpleEventProperty,
} from './recurring-event-actions';
import { EventPanelTextField } from './event-panel-text-field';

const REPEAT_OPTIONS: RepeatOption[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const SHOW_AS_OPTIONS: ShowAsOption[] = ['OPAQUE', 'TRANSPARENT'];

interface EventPanelProps {
  event: EventOccurrence;
  /** Omitted while calendars load. */
  calendar?: Calendar;
  isCalendarReadOnly: boolean;
  onBack: () => void;
  /** Omitted when the event can't be deleted, which leaves the "…" menu out. */
  onDelete?: () => void;
  /** Buttons the host shows in the header beside "‹ Agenda". */
  headerActions?: React.ReactNode;
}

interface Times {
  start: number;
  end: number;
  isAllDay: boolean;
}

interface EventPanelState {
  /** Read from the event's row: the occurrence doesn't carry it. */
  repeat: RepeatOption;
  /** Times changed in the panel, shown until the saved event comes back. */
  times: Times | null;
}

/** Text with its links live, as notes show when not being edited. */
class AutolinkedText extends React.Component<{ text: string }> {
  _el = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._autolink();
  }

  componentDidUpdate() {
    this._autolink();
  }

  _autolink() {
    if (this._el.current) Autolink(this._el.current, { async: false, telAggressiveMatch: true });
  }

  render() {
    return <div ref={this._el}>{this.props.text}</div>;
  }
}

function linkOrText(location: string) {
  return location.startsWith('http') || location.startsWith('tel:') ? (
    <a href={location}>{location}</a>
  ) : (
    location
  );
}

// Pure: the calendar re-renders on every drag move, and the notes are re-parsed on each render.
export class EventPanel extends React.PureComponent<EventPanelProps, EventPanelState> {
  static displayName = 'EventPanel';

  state: EventPanelState = { repeat: 'none', times: null };

  _title = React.createRef<EventPanelTextField>();
  // Read as well as kept in state: the time picker reports its last change during the same blur
  // that saves the times, before a setState would land.
  _pendingTimes: Times | null = null;
  // Each save is built from the stored event, so it waits until the one before has been written.
  _saving: Promise<void> = Promise.resolve();

  componentDidMount() {
    this._loadEventRow();
  }

  componentDidUpdate(prevProps: EventPanelProps) {
    if (prevProps.event !== this.props.event) {
      this._pendingTimes = null;
      this.setState({ times: null });
      this._loadEventRow();
    }
  }

  focusTitle() {
    this._title.current?.focus();
  }

  async _eventRow() {
    return DatabaseStore.find<Event>(
      Event,
      CalendarUtils.parseOccurrenceId(this.props.event.id).eventId
    );
  }

  async _loadEventRow() {
    const occurrence = this.props.event;
    const row = await this._eventRow();
    if (this.props.event !== occurrence || !row) return;
    this.setState({
      repeat: frequencyToRepeatOption(ICSEventHelpers.getRecurrenceInfo(row.ics).frequency),
    });
  }

  _editable() {
    return canEditInPanel(this.props.event, this.props.isCalendarReadOnly);
  }

  _save(write: (row: Event) => SyncbackEventTask) {
    this._saving = this._saving
      .then(async () => {
        const row = await this._eventRow();
        if (row) await TaskQueue.waitForPerformLocal(write(row));
      })
      .catch((error) => console.error('Failed to save the event:', error));
  }

  _saveProperty(edit: EventPropertyEdit) {
    this._save((row) => modifySimpleEventProperty(row, edit));
  }

  _times(): Times {
    const { event } = this.props;
    if (this.state.times) return this.state.times;
    return isTimed(event)
      ? { start: event.start, end: event.end, isAllDay: false }
      : {
          start: CalendarDateUtils.dayStartUnix(event.startDate),
          end: CalendarDateUtils.nextDayStartUnix(event.endDate),
          isAllDay: true,
        };
  }

  _changeTimes(times: Times) {
    this._pendingTimes = times;
    this.setState({ times });
  }

  _changeStart = (ms: number) => {
    const t = this._times();
    const start = ms / 1000;
    this._changeTimes({ ...t, start, end: shiftEndWithStart(t.start, t.end, start, t.isAllDay) });
  };

  _changeEnd = (end: number) => {
    const t = this._times();
    this._changeTimes({ ...t, end: clampEnd(t.start, end, t.isAllDay) });
  };

  _saveTimes() {
    const times = this._pendingTimes;
    if (!times) return;
    this._pendingTimes = null;
    const originalOccurrenceStart = occurrenceStartUnix(this.props.event);
    this._save((row) =>
      modifySimpleEvent({
        event: row,
        originalOccurrenceStart,
        newStart: times.start,
        newEnd: times.end,
        isAllDay: times.isAllDay,
      })
    );
  }

  // Saved once focus leaves the times, so changing the start and then the end is one save.
  _onTimesBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) this._saveTimes();
  };

  _onAllDayChange = () => {
    const allDay = !this._times().isAllDay;
    this._changeTimes({ ...allDayToggleTimes(this.props.event, allDay), isAllDay: allDay });
    this._saveTimes();
  };

  _onRepeatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const repeat = e.target.value as RepeatOption;
    this.setState({ repeat });
    this._saveProperty({ property: 'rrule', value: repeatOptionToRRule(repeat) });
  };

  _onMore = () => {
    require('@electron/remote')
      .Menu.buildFromTemplate([{ label: localized('Delete Event'), click: this.props.onDelete }])
      .popup({});
  };

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
            // Drawn for a 32px toolbar button; the panel's header row is 24px.
            style={{
              width: 24,
              height: 24,
              WebkitMaskSize: 'contain',
              ...(isRTL ? { transform: `scaleX(-1)` } : {}),
            }}
          />
          {localized('Agenda')}
        </button>
        <div className="event-panel-actions">
          {this.props.headerActions}
          {this.props.onDelete && (
            <button
              className="btn-bare event-panel-more"
              title={localized('More')}
              aria-label={localized('More')}
              onClick={this._onMore}
            >
              <SVGIcons.More />
            </button>
          )}
        </div>
      </div>
    );
  }

  _renderTitle() {
    const { event } = this.props;
    const title = event.title || localized('(No title)');
    if (this._editable()) {
      return (
        <EventPanelTextField
          ref={this._title}
          className="event-panel-title"
          value={event.title}
          placeholder={localized('New Event')}
          onSave={(value) =>
            this._saveProperty({ property: 'summary', value: value || localized('New Event') })
          }
        />
      );
    }
    return <div className="event-panel-title">{event.isCancelled ? <s>{title}</s> : title}</div>;
  }

  /** The last day the times cover: a timed event ending at midnight doesn't reach the next day. */
  _lastDay({ start, end, isAllDay }: Times) {
    return CalendarDateUtils.calendarDateFromUnix(
      isAllDay ? inclusiveAllDayEnd(end) : Math.max(end - 1, start)
    );
  }

  _renderEditableWhen() {
    const t = this._times();
    const multiDay = CalendarDateUtils.calendarDateFromUnix(t.start) !== this._lastDay(t);
    const endDatePicker = (
      <DatePicker
        value={(t.isAllDay ? inclusiveAllDayEnd(t.end) : t.end) * 1000}
        onChange={(ms) =>
          this._changeEnd(
            t.isAllDay
              ? CalendarDateUtils.nextDayStartUnix(
                  CalendarDateUtils.calendarDateFromUnix(ms / 1000)
                )
              : ms / 1000
          )
        }
      />
    );
    return (
      <div className="event-panel-section" onBlur={this._onTimesBlur}>
        {t.isAllDay ? (
          <div className="event-panel-row">
            <SVGIcons.Clock className="event-panel-icon" />
            <DatePicker value={t.start * 1000} onChange={this._changeStart} />
            {multiDay && <span>–</span>}
            {multiDay && endDatePicker}
          </div>
        ) : (
          <>
            <div className="event-panel-row">
              <SVGIcons.Clock className="event-panel-icon" />
              <TimePicker value={t.start * 1000} onChange={this._changeStart} />
              <SVGIcons.ArrowRight className="event-panel-icon" />
              <TimePicker
                value={t.end * 1000}
                relativeTo={t.start * 1000}
                onChange={(ms) => this._changeEnd(ms / 1000)}
              />
              <span className="event-panel-subtle">
                {DateUtils.formatDuration(t.end - t.start)}
              </span>
            </div>
            <div className="event-panel-row indented">
              <DatePicker value={t.start * 1000} onChange={this._changeStart} />
              {multiDay && <span>–</span>}
              {multiDay && endDatePicker}
            </div>
          </>
        )}
        <div className="event-panel-row">
          <span className="event-panel-icon">
            <Switch
              checked={t.isAllDay}
              onChange={this._onAllDayChange}
              label={localized('All day')}
            />
          </span>
          {localized('All day')}
        </div>
        {!t.isAllDay && (
          <div className="event-panel-row">
            <SVGIcons.Globe className="event-panel-icon" />
            {/* The zone the times above are shown in, which may not be the event's own. */}
            {formatTimezone(DateUtils.timeZone)}
          </div>
        )}
        <div className="event-panel-row">
          <SVGIcons.Repeat className="event-panel-icon" />
          <select
            className={this.state.repeat === 'none' ? 'is-placeholder' : undefined}
            value={this.state.repeat}
            onChange={this._onRepeatChange}
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'none' ? localized('Repeat') : repeatLabel(option)}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  _renderWhen() {
    if (this._editable()) return this._renderEditableWhen();
    const { event } = this.props;
    const firstDay = momentOf(event.startDate).format('ddd MMM D');
    const days =
      event.startDate === event.endDate
        ? firstDay
        : `${firstDay} – ${momentOf(event.endDate).format('ddd MMM D')}`;

    return (
      <div className="event-panel-section">
        {isTimed(event) ? (
          <>
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
          </>
        ) : (
          <>
            <div className="event-panel-row">
              <SVGIcons.Clock className="event-panel-icon" />
              <span>{days}</span>
            </div>
            <div className="event-panel-row indented">{localized('All day')}</div>
          </>
        )}
        {this.state.repeat !== 'none' && (
          <div className="event-panel-row">
            <SVGIcons.Repeat className="event-panel-icon" />
            {repeatLabel(this.state.repeat)}
          </div>
        )}
        {canRespondToEvent(event) && (
          <div className="event-panel-row indented">
            <button
              className="btn"
              onClick={(e) => openProposeNewTimePopover(event, e.currentTarget)}
            >
              {localized('Propose a new time') + '...'}
            </button>
          </div>
        )}
      </div>
    );
  }

  _isOrganizer(attendee: EventAttendee) {
    const { organizer } = this.props.event;
    return !!organizer && Utils.emailIsEquivalent(attendee.email, organizer.email);
  }

  _renderLocationIcon(location: string) {
    return CalendarUtils.extractMeetingDomain(location, '') ? (
      <SVGIcons.Video className="event-panel-icon" />
    ) : (
      <SVGIcons.Location className="event-panel-icon" />
    );
  }

  _renderInviteesAndPlace() {
    const { attendees, location } = this.props.event;
    const editable = this._editable();
    if (attendees.length === 0 && !location && !editable) return null;
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
        {editable ? (
          <div className="event-panel-row">
            {this._renderLocationIcon(location)}
            <EventPanelTextField
              className="event-panel-location"
              value={location}
              placeholder={localized('Add Location or Video Call')}
              display={location && linkOrText(location)}
              onSave={(value) => this._saveProperty({ property: 'location', value })}
            />
          </div>
        ) : (
          location && (
            <div className="event-panel-row">
              {this._renderLocationIcon(location)}
              <span className="event-panel-location">{linkOrText(location)}</span>
            </div>
          )
        )}
      </div>
    );
  }

  _renderNotes() {
    const notes = extractNotesFromDescription(this.props.event.description).trim();
    if (this._editable()) {
      return (
        <div className="event-panel-section">
          <EventPanelTextField
            className="event-panel-notes"
            multiline
            value={notes}
            placeholder={localized('Add notes or URL...')}
            display={notes && <AutolinkedText text={notes} />}
            onSave={(value) => this._saveProperty({ property: 'description', value })}
          />
        </div>
      );
    }
    if (!notes) return null;
    return (
      <div className="event-panel-section event-panel-notes">
        <AutolinkedText text={notes} />
      </div>
    );
  }

  _renderCalendar() {
    const { event, calendar } = this.props;
    const showAs: ShowAsOption = event.isFree ? 'TRANSPARENT' : 'OPAQUE';
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
          {this._editable() ? (
            <select
              value={showAs}
              onChange={(e) => this._saveProperty({ property: 'transp', value: e.target.value })}
            >
              {SHOW_AS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {showAsLabel(option)}
                </option>
              ))}
            </select>
          ) : (
            showAsLabel(showAs)
          )}
        </div>
      </div>
    );
  }

  render() {
    return (
      <aside className="event-panel" aria-label={localized('Event')}>
        {this._renderHeader()}
        <ScrollRegion className="event-panel-body">
          {this._renderTitle()}
          {this._renderWhen()}
          {this._renderInviteesAndPlace()}
          {this._renderNotes()}
          {this._renderCalendar()}
        </ScrollRegion>
      </aside>
    );
  }
}
