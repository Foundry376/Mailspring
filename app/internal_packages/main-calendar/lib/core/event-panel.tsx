import React from 'react';
import ReactDOM from 'react-dom';
import {
  localized,
  isRTL,
  Autolink,
  Calendar,
  CalendarDate,
  CalendarDateUtils,
  CalendarUtils,
  DatabaseStore,
  DateUtils,
  Event,
  ICSEventHelpers,
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
import { EventOccurrence, EventAttendee, isTimed, occurrenceTimes } from './calendar-data-source';
import {
  allDayToggleTimes,
  asksScope,
  calcEventColors,
  canEditInPanel,
  clampEnd,
  extractNotesFromDescription,
  formatShortTimeRange,
  formatTime,
  hasGuests,
  holdsEdits,
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
import {
  canRespondToEvent,
  myParticipationStatus,
  openProposeNewTimePopover,
  respondToCalendarEvent,
  rsvpActions,
} from './calendar-rsvp';
import { ChangeScope, EventPropertyEdit } from './recurring-event-actions';
import { EventPanelTextField } from './event-panel-text-field';
import {
  UnsentChange,
  emptyChange,
  scopeLabel,
  scopesFor,
  unsentEdit,
  withEdit,
  withTimes,
} from './unsent-change';

const REPEAT_OPTIONS: RepeatOption[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

const repeatOptionLabel = (option: RepeatOption) =>
  option === 'none' ? localized('Does not repeat') : repeatLabel(option);

function daysLabel(first: CalendarDate, last: CalendarDate) {
  const from = momentOf(first).format('ddd MMM D');
  return first === last ? from : `${from} – ${momentOf(last).format('ddd MMM D')}`;
}

const formatDay = (day: CalendarDate) =>
  momentOf(day).format(DateUtils.DATE_FORMAT_llll_NO_TIME).trim();

// As the date pickers show them, so an event that can't be edited reads like one that can.
function renderDays(first: CalendarDate, last: CalendarDate) {
  return (
    <div className="event-panel-wrap">
      <span>{formatDay(first)}</span>
      {first !== last && <span>–</span>}
      {first !== last && <span>{formatDay(last)}</span>}
    </div>
  );
}
const SHOW_AS_OPTIONS: ShowAsOption[] = ['OPAQUE', 'TRANSPARENT'];

interface EventPanelProps {
  event: EventOccurrence;
  calendar?: Calendar;
  isCalendarReadOnly: boolean;
  onBack: () => void;
  onDelete?: () => void;
  headerActions?: React.ReactNode;
  unsentChange: UnsentChange | null;
  onUnsentChange: (change: UnsentChange | null) => void;
  onSendUnsentChange: (scope: ChangeScope) => void;
  onSaveChange: (change: UnsentChange) => Promise<void>;
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

// A select that reads as text, as the toolbar's view picker does, with the caret only on hover.
const PanelSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <span className="event-panel-select">
    <select {...props} />
    <RetinaImg
      name="ic-calendar-down-arrow.png"
      mode={RetinaImg.Mode.ContentIsMask}
      style={{ width: 8, height: 5, WebkitMaskSize: 'contain' }}
      aria-hidden="true"
    />
  </span>
);

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

  _el = React.createRef<HTMLElement>();
  _title = React.createRef<EventPanelTextField>();
  // Read as well as kept in state: the time picker reports its last change during the same blur
  // that saves the times, before a setState would land.
  _pendingTimes: Times | null = null;
  // Each save is built from the stored event, so it waits until the one before has been written.
  _saving: Promise<void> = Promise.resolve();
  /** The last times save has been written, so the next refresh shows the event's own times. */
  _timesSaveLanded = false;
  _timesSaveCount = 0;

  componentDidMount() {
    this._loadEventRow();
  }

  // Any synced change hands the panel a fresh occurrence. Times not yet saved stay on screen, and
  // saved ones until they're written: after that the event's own times win, after an undo too.
  componentDidUpdate(prevProps: EventPanelProps) {
    if (prevProps.event !== this.props.event) {
      const { times } = this.state;
      if (times && !this._pendingTimes && (this._timesSaveLanded || this._storedTimesAre(times))) {
        this._timesSaveLanded = false;
        this.setState({ times: null });
      }
      this._loadEventRow();
    }
  }

  _storedTimesAre({ start, end, isAllDay }: Times) {
    const stored = this._storedTimes();
    return stored.start === start && stored.end === end && stored.isAllDay === isAllDay;
  }

  focusTitle() {
    this._title.current?.focus();
  }

  /**
   * Saves the field being edited, as leaving it would, while the panel still shows its event.
   * Removing a focused field doesn't blur it, and React drops events while it unmounts, so the
   * calendar calls this before the panel shows another event or goes away. Resolves once the
   * panel's saves have been written.
   */
  commitEdits() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this._el.current?.contains(focused)) {
      // Flushed, so a change held for Send update is in the calendar's state on return.
      ReactDOM.flushSync(() => focused.blur());
    }
    return this._saving;
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

  _holdsEdits() {
    return holdsEdits(this.props.event, this.props.isCalendarReadOnly);
  }

  _save(change: UnsentChange) {
    this._saving = this._saving
      .then(() => this.props.onSaveChange(change))
      .catch((error) => console.error('Failed to save the event:', error));
    return this._saving;
  }

  _saveProperty(edit: EventPropertyEdit) {
    const { event, unsentChange, onUnsentChange } = this.props;
    if (this._holdsEdits()) {
      onUnsentChange(withEdit(unsentChange, event, edit, this._storedValue(edit.property)));
    } else {
      this._save({ ...emptyChange(event), edits: [edit] });
    }
  }

  /** As the panel shows it, so an edit that puts it back drops out of the unsent change. */
  _storedValue(property: EventPropertyEdit['property']): string | null {
    const { event } = this.props;
    switch (property) {
      case 'summary':
        return event.title;
      case 'location':
        return event.location;
      case 'description':
        return this._storedNotes();
      case 'transp':
        return this._storedShowAs();
      case 'rrule':
        return repeatOptionToRRule(this.state.repeat);
    }
  }

  _storedNotes() {
    return extractNotesFromDescription(this.props.event.description).trim();
  }

  _storedShowAs(): ShowAsOption {
    return this.props.event.isFree ? 'TRANSPARENT' : 'OPAQUE';
  }

  _shown(property: Exclude<EventPropertyEdit['property'], 'rrule'>, stored: string): string;
  _shown(property: 'rrule', stored: string | null): string | null;
  _shown(property: EventPropertyEdit['property'], stored: string | null) {
    const edit = unsentEdit(this.props.unsentChange, property);
    return edit ? edit.value : stored;
  }

  _repeat(): RepeatOption {
    const rrule = this._shown('rrule', repeatOptionToRRule(this.state.repeat));
    return REPEAT_OPTIONS.find((o) => repeatOptionToRRule(o) === rrule);
  }

  _times(): Times {
    return this.state.times || this.props.unsentChange?.times || this._storedTimes();
  }

  _storedTimes(): Times {
    return occurrenceTimes(this.props.event);
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
    if (this._holdsEdits()) {
      const { unsentChange, onUnsentChange } = this.props;
      this.setState({ times: null });
      onUnsentChange(withTimes(unsentChange, this.props.event, times, this._storedTimes()));
      return;
    }
    this._timesSaveLanded = false;
    const save = ++this._timesSaveCount;
    this._save({ ...emptyChange(this.props.event), times }).then(() => {
      if (save === this._timesSaveCount && !this._pendingTimes) this._timesSaveLanded = true;
    });
  }

  // Enter saves, after the picker it's pressed in has taken its text. Esc closes a date's month,
  // as it leaves a text field, before the calendar's Esc can act.
  _onTimesKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') this._saveTimes();
    const target = e.target as HTMLElement;
    if (e.key !== 'Escape' || !target.closest('.date-picker')) return;
    e.stopPropagation();
    target.closest<HTMLElement>('.event-panel')?.focus();
  };

  // Saved once focus leaves the times, so changing the start and then the end is one save.
  _onTimesBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) this._saveTimes();
  };

  // From the days on screen, which may be picked but not yet saved.
  _onAllDayChange = () => {
    const t = this._times();
    const days = {
      startDate: CalendarDateUtils.calendarDateFromUnix(t.start),
      endDate: this._lastDay(t),
    };
    this._changeTimes({ ...allDayToggleTimes(days, !t.isAllDay), isAllDay: !t.isAllDay });
    this._saveTimes();
  };

  _onRepeatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const repeat = e.target.value as RepeatOption;
    // An unsent repeat is read from the change, leaving the stored one to compare against.
    if (!this._holdsEdits()) this.setState({ repeat });
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
          value={this._shown('summary', event.title)}
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
      <div
        className="event-panel-section"
        onBlur={this._onTimesBlur}
        onKeyDown={this._onTimesKeyDown}
      >
        <div className="event-panel-row">
          <SVGIcons.Clock className="event-panel-icon" />
          <Switch
            checked={t.isAllDay}
            onChange={this._onAllDayChange}
            label={localized('All day')}
          />
          {localized('All day')}
        </div>
        {!t.isAllDay && (
          <div className="event-panel-row indented">
            <div className="event-panel-wrap">
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
          </div>
        )}
        <div className="event-panel-row indented">
          <div className="event-panel-wrap">
            <DatePicker value={t.start * 1000} onChange={this._changeStart} />
            {multiDay && <span>–</span>}
            {multiDay && endDatePicker}
          </div>
        </div>
        {!t.isAllDay && (
          <div className="event-panel-row">
            <SVGIcons.Globe className="event-panel-icon" />
            {/* The zone the times above are shown in, which may not be the event's own. */}
            {formatTimezone(DateUtils.timeZone)}
          </div>
        )}
        {/* An occurrence changed on its own takes no scope; its rule is the series'. */}
        {this.props.event.isException ? (
          this._renderRepeatLabel()
        ) : (
          <div className="event-panel-row">
            <SVGIcons.Repeat className="event-panel-icon" />
            <PanelSelect value={this._repeat()} onChange={this._onRepeatChange}>
              {REPEAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {repeatOptionLabel(option)}
                </option>
              ))}
            </PanelSelect>
          </div>
        )}
      </div>
    );
  }

  _renderRepeatLabel() {
    return (
      this.state.repeat !== 'none' && (
        <div className="event-panel-row">
          <SVGIcons.Repeat className="event-panel-icon" />
          {repeatLabel(this.state.repeat)}
        </div>
      )
    );
  }

  _renderWhen() {
    if (this._editable()) return this._renderEditableWhen();
    const { event } = this.props;
    const days = renderDays(event.startDate, event.endDate);

    return (
      <div className="event-panel-section">
        {isTimed(event) ? (
          <>
            <div className="event-panel-row">
              <SVGIcons.Clock className="event-panel-icon" />
              <div className="event-panel-wrap">
                {/* As the time pickers show them. */}
                <span>{formatTime(event.start)}</span>
                <SVGIcons.ArrowRight className="event-panel-icon" />
                <span>{formatTime(event.end)}</span>
                <span className="event-panel-subtle">
                  {DateUtils.formatDuration(event.end - event.start)}
                </span>
              </div>
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
              {days}
            </div>
            <div className="event-panel-row indented">{localized('All day')}</div>
          </>
        )}
        {this._renderRepeatLabel()}
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
    const shownLocation = this._shown('location', location);
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
            {this._renderLocationIcon(shownLocation)}
            <EventPanelTextField
              className="event-panel-location"
              value={shownLocation}
              placeholder={localized('Add Location or Video Call')}
              display={shownLocation && linkOrText(shownLocation)}
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
    const notes = this._storedNotes();
    if (this._editable()) {
      const shownNotes = this._shown('description', notes);
      return (
        <div className="event-panel-section">
          <EventPanelTextField
            className="event-panel-notes"
            multiline
            value={shownNotes}
            placeholder={localized('Add notes or URL...')}
            display={shownNotes && <AutolinkedText text={shownNotes} />}
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
    const showAs = this._storedShowAs();
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
            <PanelSelect
              value={this._shown('transp', showAs)}
              onChange={(e) => this._saveProperty({ property: 'transp', value: e.target.value })}
            >
              {SHOW_AS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {showAsLabel(option)}
                </option>
              ))}
            </PanelSelect>
          ) : (
            showAsLabel(showAs)
          )}
        </div>
      </div>
    );
  }

  _timesLabel(times: Times, other: Times) {
    const days = (t: Times) =>
      daysLabel(CalendarDateUtils.calendarDateFromUnix(t.start), this._lastDay(t));
    if (times.isAllDay) return days(times);
    const range = formatShortTimeRange(times.start, times.end);
    return days(times) === days(other) ? range : `${days(times)}, ${range}`;
  }

  _changeRows(change: UnsentChange) {
    const { event } = this.props;
    const rows: { key: string; icon: React.ReactNode; label: string; now: string; was: string }[] =
      [];
    if (change.times) {
      const stored = this._storedTimes();
      rows.push({
        key: 'times',
        icon: <SVGIcons.Clock />,
        label: localized('Time'),
        now: this._timesLabel(change.times, stored),
        was: this._timesLabel(stored, change.times),
      });
    }
    for (const edit of change.edits) {
      if (edit.property === 'summary') {
        rows.push({
          key: edit.property,
          icon: <SVGIcons.TextCursor />,
          label: localized('Title'),
          now: edit.value,
          was: event.title,
        });
      } else if (edit.property === 'location') {
        rows.push({
          key: edit.property,
          icon: this._renderLocationIcon(edit.value || event.location),
          label: localized('Location'),
          now: edit.value,
          was: event.location,
        });
      } else if (edit.property === 'description') {
        rows.push({
          key: edit.property,
          icon: <SVGIcons.AlignLeft />,
          label: localized('Notes'),
          now: edit.value,
          was: this._storedNotes(),
        });
      } else if (edit.property === 'transp') {
        rows.push({
          key: edit.property,
          icon: <SVGIcons.BriefcaseOutline />,
          label: localized('Show as'),
          now: showAsLabel(edit.value as ShowAsOption),
          was: showAsLabel(this._storedShowAs()),
        });
      } else {
        rows.push({
          key: edit.property,
          icon: <SVGIcons.Repeat />,
          label: localized('Repeat'),
          now: repeatOptionLabel(this._repeat()),
          was: repeatOptionLabel(this.state.repeat),
        });
      }
    }
    return rows;
  }

  _renderUnsentChangeCard() {
    const change = this.props.unsentChange;
    if (!change) return null;
    return (
      <div className="event-panel-card event-panel-change">
        {this._changeRows(change).map(({ key, icon, label, now, was }) => (
          <div key={key} className="event-panel-change-row">
            <span className="event-panel-icon" role="img" aria-label={label}>
              {icon}
            </span>
            <div className="event-panel-change-values">
              {now && <span>{now}</span>}
              {was && <s>{was}</s>}
            </div>
          </div>
        ))}
        {asksScope(this.props.event) ? (
          this._renderScopeButtons(change)
        ) : (
          <div className="event-panel-change-buttons">
            {this._renderDiscardButton()}
            <button
              className="btn btn-emphasis"
              onClick={() => this.props.onSendUnsentChange('this-occurrence')}
            >
              {localized('Send update')}
            </button>
          </div>
        )}
      </div>
    );
  }

  _renderDiscardButton() {
    return (
      <button className="btn" onClick={() => this.props.onUnsentChange(null)}>
        {localized('Discard')}
      </button>
    );
  }

  _renderScopeButtons(change: UnsentChange) {
    const { event, onSendUnsentChange } = this.props;
    return (
      <>
        {hasGuests(event) && (
          <div className="event-panel-subtle">{localized('Guests will be emailed.')}</div>
        )}
        <div className="event-panel-change-buttons stacked">
          {scopesFor(change).map((scope, i) => (
            <button
              key={scope}
              className={`btn ${i === 0 ? 'btn-emphasis' : ''}`}
              onClick={() => onSendUnsentChange(scope)}
            >
              {scopeLabel(scope)}
            </button>
          ))}
          {this._renderDiscardButton()}
        </div>
      </>
    );
  }

  // Answering writes our status onto the event, which a read-only calendar refuses.
  _renderRsvpCard() {
    const { event, isCalendarReadOnly } = this.props;
    if (!canRespondToEvent(event)) return null;
    const answer = myParticipationStatus(event);
    return (
      <div
        className="event-panel-card event-panel-rsvp button-group"
        role="group"
        aria-label={localized('Your response')}
      >
        {rsvpActions().map(([status, label]) => (
          <button
            key={status}
            className={`btn ${status === answer ? status : ''}`}
            aria-pressed={status === answer}
            disabled={isCalendarReadOnly}
            onClick={() => respondToCalendarEvent(event, status)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  // The card sits under the scrolling rows, so a long event never pushes it out of view.
  render() {
    return (
      <aside ref={this._el} className="event-panel" tabIndex={-1} aria-label={localized('Event')}>
        {this._renderHeader()}
        <ScrollRegion className="event-panel-body">
          {this._renderTitle()}
          {this._renderWhen()}
          {this._renderInviteesAndPlace()}
          {this._renderNotes()}
          {this._renderCalendar()}
        </ScrollRegion>
        {this._renderUnsentChangeCard()}
        {this._renderRsvpCard()}
      </aside>
    );
  }
}
