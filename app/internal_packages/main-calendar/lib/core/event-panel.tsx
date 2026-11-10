import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment-timezone';
import {
  localized,
  isRTL,
  AccountStore,
  Autolink,
  Calendar,
  CalendarConflict,
  CalendarDate,
  CalendarDateUtils,
  CalendarUtils,
  Contact,
  DatabaseStore,
  Rx,
  DateUtils,
  Event,
  ICSEventHelpers,
  ICSParticipantStatus,
  Utils,
} from 'mailspring-exports';
import {
  AnswerSection,
  DatePicker,
  RetinaImg,
  ScrollRegion,
  SVGIcons,
  Switch,
  TextSelect,
  TimePicker,
} from 'mailspring-component-kit';
import {
  EventOccurrence,
  EventAttendee,
  isTimed,
  occurrenceStartUnix,
  occurrenceTimes,
} from './calendar-data-source';
import {
  allDayToggleTimes,
  asksGuestShowAsScope,
  asksScope,
  calcEventColors,
  clampEnd,
  editableFields,
  extractNotesFromDescription,
  formatConflict,
  formatShortTimeRange,
  hasGuests,
  holdsEdits,
  proposesTime,
  inclusiveAllDayEnd,
  momentOf,
  PanelField,
  shiftEndWithStart,
} from './calendar-helpers';
import {
  AttendeeStatusIcon,
  attendeeStatusClass,
  contactNamesByEmail,
  guestCount,
  guestName,
  guestSummary,
  sortedAttendees,
} from './attendee-status';
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
  isAnsweredYesOrNo,
  isOrganizer,
  myAttendeeEmail,
  myParticipationStatus,
  proposedTimesFor,
  ProposedTime,
  respondToCalendarEvent,
} from './calendar-rsvp';
import { ChangeScope, EventPropertyEdit } from './recurring-event-actions';
import { EventPanelTextField } from './event-panel-text-field';
import {
  UnsentChange,
  attendeesWith,
  emptyChange,
  scopeLabel,
  scopesFor,
  showAsWaitsForScope,
  unsentEdit,
  withAttendees,
  withEdit,
  withTimes,
} from './unsent-change';
import { EventAttendeesInput } from './event-attendees-input';

const REPEAT_OPTIONS: RepeatOption[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

const repeatOptionLabel = (option: RepeatOption) =>
  option === 'none' ? localized('Does not repeat') : repeatLabel(option);

const formatDay = (day: CalendarDate) => DateUtils.dayString(momentOf(day));

const formatPickerTime = (unix: number) => moment.unix(unix).format(DateUtils.tightTimeFormat());

function daysLabel(first: CalendarDate, last: CalendarDate) {
  return first === last ? formatDay(first) : `${formatDay(first)} – ${formatDay(last)}`;
}

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

// A longer guest list shows this many, organizer and you first, until it's expanded.
const TRIMMED_GUEST_ROWS = 5;

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
  /** An event that exists only in the panel: every edit is held until the host creates it. */
  isNewEvent?: boolean;
  /** Replaces Discard's dropping of the held change, for an event the host would drop whole. */
  onDiscard?: () => void;
  calendarChoices?: Calendar[];
  onCalendarChange?: (calendar: Calendar) => void;
  /** Given in the mail sidebar, where an invitation is answered; the calendar shows the clash. */
  conflicts?: CalendarConflict[];
}

interface Times {
  start: number;
  end: number;
  isAllDay: boolean;
}

interface ChangeRow {
  key: string;
  icon: React.ReactNode;
  label: string;
  now: string;
  was: string;
}

type InviteeState = 'removed' | 'removable' | 'answerable' | '';

interface EventPanelState {
  /** Read from the event's row: the occurrence doesn't carry it. */
  repeat: RepeatOption;
  /** Times changed in the panel, shown until the saved event comes back. */
  times: Times | null;
  proposals: ProposedTime[];
  /** Your guest row's answer buttons are showing. */
  answerOpen: boolean;
  allGuestsShown: boolean;
  /** Shown only: the guest list an edit writes back keeps the invitation's own names. */
  contactNames: Map<string, string>;
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

  state: EventPanelState = {
    repeat: 'none',
    times: null,
    proposals: [],
    answerOpen: false,
    allGuestsShown: false,
    contactNames: new Map(),
  };

  _el = React.createRef<HTMLElement>();
  _title = React.createRef<EventPanelTextField>();
  _when = React.createRef<HTMLDivElement>();
  // Read as well as kept in state: the time picker reports its last change during the same blur
  // that saves the times, before a setState would land.
  _pendingTimes: Times | null = null;
  // Each save is built from the stored event, so it waits until the one before has been written.
  _saving: Promise<void> = Promise.resolve();
  _savesUnwritten = 0;
  /** The last times save has been written, so the next refresh shows the event's own times. */
  _timesSaveLanded = false;
  _timesSaveCount = 0;
  _proposalsKey: string | null = null;
  _contactNamesKey = '';
  _contactNamesSub: { dispose(): void } | null = null;

  componentDidMount() {
    this._loadEventRow();
    this._watchContactNames();
  }

  componentWillUnmount() {
    this._contactNamesSub?.dispose();
  }

  // A focused answer button that closes or turns off would leave focus on the page, where Esc
  // can't close the panel.
  getSnapshotBeforeUpdate() {
    const focused = document.activeElement as HTMLButtonElement | null;
    const answering = focused?.closest('.event-panel-answer, .answer-section');
    return answering && this._el.current?.contains(focused) ? focused : null;
  }

  // Any synced change hands the panel a fresh occurrence. Times not yet saved stay on screen, and
  // saved ones until they're written: after that the event's own times win, after an undo too.
  componentDidUpdate(
    prevProps: EventPanelProps,
    _: EventPanelState,
    answerButton: HTMLButtonElement | null
  ) {
    if (answerButton && (!answerButton.isConnected || answerButton.disabled)) {
      this._el.current?.focus();
    }
    if (this.state.answerOpen && !this._answersFromGuestRow()) this.setState({ answerOpen: false });
    if (prevProps.event !== this.props.event) {
      const { times } = this.state;
      if (times && !this._pendingTimes && (this._timesSaveLanded || this._storedTimesAre(times))) {
        this._timesSaveLanded = false;
        this.setState({ times: null });
      }
      this._loadEventRow();
    }
    this._watchContactNames();
  }

  _watchContactNames() {
    const { event, unsentChange } = this.props;
    const people = [...event.attendees, ...(unsentChange?.attendees?.added ?? [])];
    if (event.organizer) people.push(event.organizer);
    // Mail contacts are stored lowercased, address-book ones as typed, and IN matches case.
    const unnamed = people.filter((p) => !p.name).map((p) => p.email);
    const emails = [...new Set([...unnamed, ...unnamed.map((e) => e.toLowerCase())])];
    const key = emails.sort().join('\n');
    if (key === this._contactNamesKey) return;
    this._contactNamesKey = key;
    this._contactNamesSub?.dispose();
    this._contactNamesSub = null;
    if (!emails.length) {
      this.setState({ contactNames: new Map() });
      return;
    }
    const query = DatabaseStore.findAll<Contact>(Contact)
      .where(Contact.attributes.email.in(emails))
      .where(Contact.attributes.hidden.equal(false));
    this._contactNamesSub = Rx.Observable.fromQuery(query).subscribe((contacts) =>
      this.setState({ contactNames: contactNamesByEmail(contacts) })
    );
  }

  _storedTimesAre({ start, end, isAllDay }: Times) {
    const stored = this._storedTimes();
    return stored.start === start && stored.end === end && stored.isAllDay === isAllDay;
  }

  focusTitle() {
    this._title.current?.focus();
  }

  focusTimes() {
    this._when.current?.querySelector('input')?.focus();
  }

  /**
   * Focuses the field last edited, for Keep editing. A click that leaves the panel moves focus to
   * what it hit on mousedown, before the calendar asks, so the field can't be read from focus.
   */
  returnToField() {
    const field = this._lastFocused;
    if (field && field.isConnected && this._el.current?.contains(field)) field.focus();
  }

  _lastFocused: HTMLElement | null = null;

  _onFocus = (e: React.FocusEvent<HTMLElement>) => {
    this._lastFocused = e.target;
  };

  /**
   * Saves the field being edited, as leaving it would, while the panel still shows its event.
   * Removing a focused field doesn't blur it, and React drops events while it unmounts, so the
   * calendar calls this before the panel shows another event or goes away. Resolves once the
   * panel's saves have been written; null when none is left to write.
   */
  commitEdits(): Promise<void> | null {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this._el.current?.contains(focused)) {
      // Flushed, so a change held for Send update is in the calendar's state on return.
      ReactDOM.flushSync(() => focused.blur());
    }
    return this._savesUnwritten ? this._saving : null;
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
    this._loadProposals(occurrence, row);
  }

  async _loadProposals(occurrence: EventOccurrence, row: Event) {
    const proposalsKey = `${occurrence.id}\n${row.ics}`;
    if (proposalsKey === this._proposalsKey) return;
    this._proposalsKey = proposalsKey;
    const proposals = await proposedTimesFor(occurrence);
    if (this._proposalsKey === proposalsKey) this.setState({ proposals });
  }

  _canEdit(field: PanelField) {
    return editableFields(this.props.event, this.props.isCalendarReadOnly).has(field);
  }

  _proposes() {
    return proposesTime(this.props.event, this.props.isCalendarReadOnly);
  }

  _holdsEdits() {
    const { event, isCalendarReadOnly, unsentChange, isNewEvent } = this.props;
    return isNewEvent || holdsEdits(event, isCalendarReadOnly, unsentChange);
  }

  // A copy on someone else's calendar holds their availability, not ours (recordAndSendRSVP).
  _canSetShowAs() {
    const { event, calendar, unsentChange } = this.props;
    if (!this._canEdit('showAs')) return false;
    if (event.isMine) return true;
    if (CalendarUtils.isSomeoneElsesCalendar(calendar)) return false;
    return !(unsentChange?.proposal && asksGuestShowAsScope(event));
  }

  _save(change: UnsentChange) {
    this._savesUnwritten += 1;
    this._saving = this._saving
      .then(() => this.props.onSaveChange(change))
      .catch((error) => console.error('Failed to save the event:', error))
      .finally(() => {
        this._savesUnwritten -= 1;
      });
    return this._saving;
  }

  _saveProperty(edit: EventPropertyEdit) {
    const { event, unsentChange, onUnsentChange } = this.props;
    // A guest's Show as is their own, so it never joins a proposal; on a series it asks its scope.
    if (event.isMine ? this._holdsEdits() : asksGuestShowAsScope(event)) {
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
  // A pick from a time list focuses the list, which then closes without a blur.
  _onTimesBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Element | null;
    if (!e.currentTarget.contains(to) || to.classList.contains('time-options')) this._saveTimes();
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
              className="btn-ghost event-panel-more"
              title={localized('More')}
              aria-label={localized('More')}
              onClick={this._onMore}
            >
              <SVGIcons.More size={22} />
            </button>
          )}
        </div>
      </div>
    );
  }

  _renderTitle() {
    const { event } = this.props;
    const title = event.title || localized('(No title)');
    if (this._canEdit('title')) {
      return (
        <EventPanelTextField
          ref={this._title}
          className="editable"
          value={this._shown('summary', event.title)}
          placeholder={localized('New Event')}
          // Left empty, an unsaved event keeps no title, so leaving it doesn't create it.
          onSave={(value) =>
            this._saveProperty({
              property: 'summary',
              value: value || (this.props.isNewEvent ? '' : localized('New Event')),
            })
          }
        />
      );
    }
    return event.isCancelled ? <s>{title}</s> : title;
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
    // A proposal keeps the event all-day or timed, so a guest's clock heads the first row instead.
    const allDaySwitch = this._canEdit('allDay');
    const clock = <SVGIcons.Clock className="event-panel-icon" />;
    return (
      <div
        ref={this._when}
        className="event-panel-section"
        onBlur={this._onTimesBlur}
        onKeyDown={this._onTimesKeyDown}
      >
        {this._proposes() && !this.props.unsentChange && (
          <div className="event-panel-subtle event-panel-proposal-hint">
            {localized('Edit the time to propose a new one.')}
          </div>
        )}
        {allDaySwitch && (
          <div className="event-panel-row">
            {clock}
            <Switch
              checked={t.isAllDay}
              onChange={this._onAllDayChange}
              label={localized('All day')}
            />
            {localized('All day')}
          </div>
        )}
        {!t.isAllDay && (
          <div className={`event-panel-row ${allDaySwitch ? 'indented' : ''}`}>
            {!allDaySwitch && clock}
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
        <div className={`event-panel-row ${allDaySwitch || !t.isAllDay ? 'indented' : ''}`}>
          {!allDaySwitch && t.isAllDay && clock}
          <div className="event-panel-wrap">
            <DatePicker value={t.start * 1000} onChange={this._changeStart} />
            {multiDay && <span>–</span>}
            {multiDay && endDatePicker}
          </div>
        </div>
        {this._renderConflicts()}
        {!allDaySwitch && t.isAllDay && (
          <div className="event-panel-row indented">{localized('All day')}</div>
        )}
        {!t.isAllDay && (
          <div className="event-panel-row">
            <SVGIcons.Globe className="event-panel-icon" />
            {/* The zone the times above are shown in, which may not be the event's own. */}
            {formatTimezone(DateUtils.timeZone)}
          </div>
        )}
        {/* An occurrence changed on its own takes no scope; its rule is the series'. */}
        {this.props.event.isException || !this._canEdit('repeat') ? (
          this._renderRepeatLabel()
        ) : (
          <div className="event-panel-row">
            <SVGIcons.Repeat className="event-panel-icon" />
            <TextSelect value={this._repeat()} onChange={this._onRepeatChange}>
              {REPEAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {repeatOptionLabel(option)}
                </option>
              ))}
            </TextSelect>
          </div>
        )}
      </div>
    );
  }

  // Gone once answered Yes or No, as the answer section is.
  _renderConflicts() {
    const { conflicts, event } = this.props;
    const answered = isAnsweredYesOrNo(myParticipationStatus(event));
    if (!conflicts?.length || !canRespondToEvent(event) || answered) return null;
    return conflicts.map((c) => (
      <div className="event-panel-row event-panel-conflict" key={`${c.eventId}-${c.start}`}>
        <SVGIcons.AlertTriangle className="event-panel-icon" />
        {localized('Conflicts with %@', formatConflict(c, occurrenceStartUnix(event)))}
      </div>
    ));
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
    if (this._canEdit('times') && !showAsWaitsForScope(this.props.unsentChange)) {
      return this._renderEditableWhen();
    }
    const { event } = this.props;
    const days = renderDays(event.startDate, event.endDate);

    return (
      <div className="event-panel-section">
        {isTimed(event) ? (
          <>
            <div className="event-panel-row">
              <SVGIcons.Clock className="event-panel-icon" />
              <div className="event-panel-wrap">
                <span>{formatPickerTime(event.start)}</span>
                <SVGIcons.ArrowRight className="event-panel-icon" />
                <span>{formatPickerTime(event.end)}</span>
                <span className="event-panel-subtle">
                  {DateUtils.formatDuration(event.end - event.start)}
                </span>
              </div>
            </div>
            <div className="event-panel-row indented">{days}</div>
            {this._renderConflicts()}
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
            {this._renderConflicts()}
          </>
        )}
        {this._renderRepeatLabel()}
      </div>
    );
  }

  _shownAttendees() {
    return attendeesWith(this.props.event.attendees, this.props.unsentChange);
  }

  // Emailed on Send update, so always held.
  _changeAttendees(attendees: EventAttendee[]) {
    const { event, unsentChange, onUnsentChange } = this.props;
    onUnsentChange(withAttendees(unsentChange, event, attendees, event.attendees));
  }

  _addAttendees = (added: EventAttendee[]) => {
    const plain = added.map(({ email, name }) => ({ email, name }));
    this._changeAttendees([...this._shownAttendees(), ...plain]);
  };

  _removeAttendee(attendee: EventAttendee) {
    const shown = this._shownAttendees();
    this._changeAttendees(shown.filter((a) => !Utils.emailIsEquivalent(a.email, attendee.email)));
  }

  _renderInvitee(attendee: EventAttendee, state: InviteeState, me: string | null) {
    const name = guestName(attendee, this.state.contactNames);
    const answerable = state === 'answerable';
    const { answerOpen } = this.state;
    return (
      <div
        key={attendee.email}
        className={`event-panel-invitee ${attendeeStatusClass(attendee)} ${state}`}
      >
        <span className="event-panel-icon">
          <span className="attendee-status">
            <AttendeeStatusIcon attendee={attendee} />
          </span>
        </span>
        <div className="event-panel-invitee-body">
          <div className="event-panel-invitee-line">
            <div className="event-panel-invitee-name">
              <div title={new Contact({ name, email: attendee.email }).toString()}>{name}</div>
              {this._renderInviteeRole(attendee, me)}
            </div>
            {state === 'removable' && (
              <button
                className="btn-ghost event-panel-invitee-remove"
                title={localized('Remove %@', name)}
                aria-label={localized('Remove %@', name)}
                onClick={() => this._removeAttendee(attendee)}
              >
                <SVGIcons.Remove />
              </button>
            )}
            {answerable && (
              <button
                className="btn-bare event-panel-invitee-answer"
                aria-expanded={answerOpen}
                title={localized('Change your answer')}
                aria-label={localized('Change your answer')}
                onClick={this._toggleAnswer}
              >
                {answerOpen ? <SVGIcons.ChevronUp /> : <SVGIcons.ChevronDown />}
              </button>
            )}
          </div>
          {answerable && answerOpen && this._renderAnswerSection(false)}
        </div>
      </div>
    );
  }

  _toggleAnswer = () => {
    this.setState(({ answerOpen }) => ({ answerOpen: !answerOpen }));
  };

  // A waiting proposal holds answers back, as it does the answer section's.
  _answersFromGuestRow() {
    const { event, isCalendarReadOnly, unsentChange } = this.props;
    return canRespondToEvent(event) && !isCalendarReadOnly && !unsentChange;
  }

  _renderInvitees() {
    const { attendees } = this.props.event;
    const editable = this._canEdit('invitees');
    const { added = [], removed = [] } = this.props.unsentChange?.attendees ?? {};
    if (attendees.length === 0 && added.length === 0 && !editable) return null;
    // Our own row stays even on a meeting that names no ORGANIZER.
    const me = myAttendeeEmail(this.props.event);
    const answers = this._answersFromGuestRow();
    const stateOf = (a: EventAttendee): InviteeState => {
      if (removed.some((r) => Utils.emailIsEquivalent(r.email, a.email))) return 'removed';
      const mine = !!me && Utils.emailIsEquivalent(a.email, me);
      if (mine && answers) return 'answerable';
      const ours = isOrganizer(this.props.event, a) || mine;
      return editable && !ours ? 'removable' : '';
    };
    const listed = attendees.length > 0 || added.length > 0;
    const addInvitees = editable && (
      <div className="event-panel-invitee event-panel-invitee-add">
        {listed && (
          <span className="event-panel-icon">
            <span className="attendee-status">
              <SVGIcons.Plus size={12} />
            </span>
          </span>
        )}
        <EventAttendeesInput
          className="event-panel-invitee-input"
          attendees={[]}
          placeholder={localized('Add Invitees')}
          change={this._addAttendees}
          clearable
        />
      </div>
    );
    if (!listed) {
      return (
        <div className="event-panel-row">
          <SVGIcons.Person className="event-panel-icon" />
          <div className="event-panel-invitees">{addInvitees}</div>
        </div>
      );
    }
    const invited = sortedAttendees(this.props.event, this.state.contactNames);
    const guests = [...invited, ...added];
    const counted = guests.filter((a) => stateOf(a) !== 'removed');
    const { allGuestsShown } = this.state;
    const trims = invited.length > TRIMMED_GUEST_ROWS;
    // Guests just added always show, so one never disappears into the hidden rows.
    const shown = trims && !allGuestsShown ? invited.slice(0, TRIMMED_GUEST_ROWS) : invited;
    // One block, so the section's gap between rows doesn't fall between the count and the guests.
    return (
      <div className="event-panel-invitees">
        <div className="event-panel-row top">
          <SVGIcons.Person className="event-panel-icon" />
          <div className="event-panel-invitee-count">
            <div>{guestCount(counted.length)}</div>
            <div className="event-panel-subtle">{guestSummary(counted)}</div>
          </div>
        </div>
        {[...shown, ...added].map((a) => this._renderInvitee(a, stateOf(a), me))}
        {addInvitees}
        {trims && (
          <button
            className="btn-bare event-panel-invitees-toggle"
            onClick={() => this.setState({ allGuestsShown: !allGuestsShown })}
          >
            {allGuestsShown
              ? localized('Show less')
              : localized('Show %@ more', invited.length - TRIMMED_GUEST_ROWS)}
          </button>
        )}
      </div>
    );
  }

  _renderInviteeRole(attendee: EventAttendee, me: string | null) {
    const isMe = !!me && Utils.emailIsEquivalent(attendee.email, me);
    let role: string = null;
    if (isOrganizer(this.props.event, attendee)) {
      // An organizer left off the guest list isn't found as `me`; isMine says it's us.
      role =
        isMe || this.props.event.isMine ? localized('Organizer · You') : localized('Organizer');
    } else if (isMe) {
      role = localized('You');
    }
    return role && <div className="event-panel-subtle">{role}</div>;
  }

  _renderLocationIcon(location: string) {
    return CalendarUtils.extractMeetingDomain(location, '') ? (
      <SVGIcons.Video className="event-panel-icon" />
    ) : (
      <SVGIcons.Location className="event-panel-icon" />
    );
  }

  _renderInviteesAndPlace() {
    const { location } = this.props.event;
    const editable = this._canEdit('location');
    const invitees = this._renderInvitees();
    if (!invitees && !location && !editable) return null;
    const shownLocation = this._shown('location', location);
    return (
      <div className="event-panel-section">
        {invitees}
        {editable ? (
          <div className="event-panel-row">
            {this._renderLocationIcon(shownLocation)}
            <EventPanelTextField
              className="event-panel-location editable"
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
    if (this._canEdit('notes')) {
      const shownNotes = this._shown('description', notes);
      return (
        <div className="event-panel-section">
          <EventPanelTextField
            className="event-panel-notes editable"
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

  _renderCalendarChoice(choices: Calendar[]) {
    const { event, onCalendarChange } = this.props;
    const byAccount = new Map<string, Calendar[]>();
    for (const c of choices) byAccount.set(c.accountId, [...(byAccount.get(c.accountId) ?? []), c]);
    const options = (calendars: Calendar[]) =>
      calendars.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ));
    return (
      <TextSelect
        value={event.calendarId}
        aria-label={localized('Calendar')}
        // Accounts often each have a "Calendar", which the closed select can't tell apart.
        title={AccountStore.accountForId(event.accountId)?.label}
        onChange={(e) => onCalendarChange?.(choices.find((c) => c.id === e.target.value))}
      >
        {byAccount.size > 1
          ? [...byAccount].map(([accountId, calendars]) => (
              <optgroup key={accountId} label={AccountStore.accountForId(accountId)?.label}>
                {options(calendars)}
              </optgroup>
            ))
          : options(choices)}
      </TextSelect>
    );
  }

  _renderCalendar() {
    const { event, calendar, calendarChoices } = this.props;
    const showAs = this._storedShowAs();
    return (
      <div className="event-panel-section">
        {(calendar || calendarChoices) && (
          <div className="event-panel-row">
            <span className="event-panel-icon">
              <span
                className="event-panel-calendar-swatch"
                style={{ backgroundColor: calcEventColors(event.calendarId).band }}
              />
            </span>
            {calendarChoices ? this._renderCalendarChoice(calendarChoices) : calendar.name}
          </div>
        )}
        <div className="event-panel-row indented">
          {this._canSetShowAs() ? (
            <TextSelect
              value={this._shown('transp', showAs)}
              onChange={(e) => this._saveProperty({ property: 'transp', value: e.target.value })}
            >
              {SHOW_AS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {showAsLabel(option)}
                </option>
              ))}
            </TextSelect>
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
    const rows: ChangeRow[] = [];
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
    if (change.attendees) {
      const names = (attendees: EventAttendee[]) =>
        attendees.map((a) => guestName(a, this.state.contactNames)).join(', ');
      rows.push({
        key: 'attendees',
        icon: <SVGIcons.Person />,
        label: localized('Invitees'),
        now: names(change.attendees.added),
        was: names(change.attendees.removed),
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

  _renderChangeRow = ({ key, icon, label, now, was }: ChangeRow) => (
    <div key={key} className="event-panel-change-row">
      <span className="event-panel-icon" role="img" aria-label={label}>
        {icon}
      </span>
      <div className="event-panel-change-values">
        {now && <span>{now}</span>}
        {was && <s>{was}</s>}
      </div>
    </div>
  );

  _renderProposals() {
    if (this.props.unsentChange || !this._canEdit('times')) return null;
    const stored = this._storedTimes();
    return this.state.proposals.map((proposal) => (
      <div
        key={proposal.from.email}
        className="event-panel-section event-panel-answer event-panel-change"
      >
        <div>{localized('%@ proposed this new time.', proposal.from.name)}</div>
        {this._renderChangeRow({
          key: 'times',
          icon: <SVGIcons.Clock />,
          label: localized('Time'),
          now: this._timesLabel(proposal, stored),
          was: this._timesLabel(stored, proposal),
        })}
        {proposal.comment && (
          <div className="event-panel-notes event-panel-proposed-comment">{proposal.comment}</div>
        )}
        <div className="event-panel-change-buttons">
          <button className="btn btn-emphasis" onClick={() => this._useProposedTime(proposal)}>
            {localized('Use this time')}
          </button>
        </div>
      </div>
    ));
  }

  // Held like any change to a meeting with guests, so the guests are emailed only on Send update.
  _useProposedTime({ start, end, isAllDay }: ProposedTime) {
    const { event, onUnsentChange } = this.props;
    onUnsentChange(withTimes(null, event, { start, end, isAllDay }, this._storedTimes()));
  }

  _renderUnsentChangeCard() {
    const change = this.props.unsentChange;
    if (!change) return null;
    if (this.props.isNewEvent) return this._renderInvitationsCard(change);
    return (
      <div className="event-panel-card event-panel-change">
        {this._changeRows(change).map(this._renderChangeRow)}
        {change.proposal ? (
          this._renderProposalActions(change)
        ) : asksScope(this.props.event) ? (
          this._renderScopeButtons(change)
        ) : (
          <>
            {this._addsFirstGuest(change) && this._renderGuestsEmailed()}
            <div className="event-panel-change-buttons">
              {this._renderDiscardButton()}
              <button
                className="btn btn-emphasis"
                onClick={() => this.props.onSendUnsentChange('this-occurrence')}
              >
                {localized('Send update')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  _renderInvitationsCard(change: UnsentChange) {
    if (!change.attendees?.added.length) return null;
    const rows = this._changeRows(change).filter((row) => row.key === 'attendees');
    return (
      <div className="event-panel-card event-panel-change">
        {rows.map(this._renderChangeRow)}
        {this._renderGuestsEmailed()}
        <div className="event-panel-change-buttons">
          {this._renderDiscardButton()}
          <button
            className="btn btn-emphasis"
            onClick={() => this.props.onSendUnsentChange('this-occurrence')}
          >
            {localized('Send invitations')}
          </button>
        </div>
      </div>
    );
  }

  _addsFirstGuest(change: UnsentChange) {
    return !hasGuests(this.props.event) && !!change.attendees?.added.length;
  }

  _renderGuestsEmailed() {
    return <div className="event-panel-subtle">{localized('Guests will be emailed.')}</div>;
  }

  _renderDiscardButton() {
    return (
      <button
        className="btn"
        onClick={this.props.onDiscard ?? (() => this.props.onUnsentChange(null))}
      >
        {localized('Discard')}
      </button>
    );
  }

  _renderProposalActions(change: UnsentChange) {
    const { onUnsentChange, onSendUnsentChange } = this.props;
    return (
      <>
        <textarea
          className="event-panel-proposal-comment"
          value={change.proposal.comment}
          placeholder={localized('Add a note for the organizer (optional)')}
          onChange={(e) => onUnsentChange({ ...change, proposal: { comment: e.target.value } })}
          onKeyDown={(e) => {
            // Kept in the panel, so the next Esc reaches the calendar's.
            if (e.key === 'Escape') e.currentTarget.closest<HTMLElement>('.event-panel')?.focus();
          }}
        />
        <div className="event-panel-change-buttons">
          {this._renderDiscardButton()}
          <button
            className="btn btn-emphasis"
            onClick={() => onSendUnsentChange('this-occurrence')}
          >
            {localized('Send proposal')}
          </button>
        </div>
      </>
    );
  }

  _renderScopeButtons(change: UnsentChange) {
    const { event, onSendUnsentChange } = this.props;
    return (
      <>
        {event.isMine &&
          (hasGuests(event) || this._addsFirstGuest(change)) &&
          this._renderGuestsEmailed()}
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

  // On someone else's calendar the answer is only emailed (recordAndSendRSVP).
  _renderRsvp() {
    const { event, calendar } = this.props;
    if (!canRespondToEvent(event) || event.isCancelled) return null;
    const away = this._answerSectionAway();
    const savedTo = calendar && !CalendarUtils.isSomeoneElsesCalendar(calendar);
    return (
      <div className={`event-panel-collapse ${away ? 'collapsed' : ''}`} aria-hidden={away}>
        <div>
          <div className="event-panel-section event-panel-answer">
            {this._renderAnswerSection(away, savedTo && localized('Saved to %@', calendar.name))}
          </div>
        </div>
      </div>
    );
  }

  // Away on a read-only calendar, which refuses an answer; once answered Yes or No, which your
  // guest row then changes; and while a change waits, so an answer and a new time aren't both sent.
  _answerSectionAway() {
    const { event, isCalendarReadOnly, unsentChange } = this.props;
    return isCalendarReadOnly || !!unsentChange || isAnsweredYesOrNo(myParticipationStatus(event));
  }

  _renderAnswerSection(disabled: boolean, note?: string) {
    return (
      <AnswerSection
        note={note}
        answer={myParticipationStatus(this.props.event)}
        disabled={disabled}
        onAnswer={(status) => this._answer(status)}
      />
    );
  }

  _answer(status: ICSParticipantStatus) {
    this.setState({ answerOpen: false });
    respondToCalendarEvent(this.props.event, status);
  }

  _renderCancelledCard() {
    if (!this.props.event.isCancelled) return null;
    return (
      <div className="event-panel-card event-panel-subtle">
        {localized('This event has been cancelled')}
      </div>
    );
  }

  // The card sits under the scrolling rows, so a long event never pushes it out of view.
  render() {
    return (
      <aside
        ref={this._el}
        className="event-panel"
        tabIndex={-1}
        aria-label={localized('Event')}
        onFocus={this._onFocus}
      >
        {this._renderHeader()}
        <ScrollRegion className="event-panel-body">
          <div className="event-panel-title">{this._renderTitle()}</div>
          {this._renderRsvp()}
          {this._renderProposals()}
          {this._renderWhen()}
          {this._renderInviteesAndPlace()}
          {this._renderNotes()}
          {this._renderCalendar()}
        </ScrollRegion>
        {this._renderUnsentChangeCard()}
        {this._renderCancelledCard()}
      </aside>
    );
  }
}
