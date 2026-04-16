import moment, { Moment } from 'moment';
import React from 'react';
import {
  Actions,
  Calendar,
  Account,
  DatabaseStore,
  DateUtils,
  Event,
  localized,
  Autolink,
  ICSEventHelpers,
  CalendarUtils,
  SyncbackEventTask,
} from 'mailspring-exports';
import {
  DatePicker,
  RetinaImg,
  ScrollRegion,
  TabGroupRegion,
  TimePicker,
} from 'mailspring-component-kit';
import { EventAttendeesInput } from './event-attendees-input';
import { EventOccurrence, EventAttendee } from './calendar-data-source';
import { EventPropertyRow } from './event-property-row';
import { createCalendarEvent } from './calendar-helpers';
// CalendarColorPicker import removed - disabled until custom event colors are fully supported
import { CalendarSelector } from './calendar-selector';
import { LocationVideoInput } from './location-video-input';
import { AllDayToggle } from './all-day-toggle';
import { RepeatSelector, RepeatOption } from './repeat-selector';
import { AlertSelector, AlertTiming } from './alert-selector';
import { ShowAsSelector, ShowAsOption } from './show-as-selector';
import { EventPopoverActions } from './event-popover-actions';
import { TimeZoneSelector } from './timezone-selector';
import { parseEventIdFromOccurrence } from './calendar-drag-utils';
import { showRecurringEventDialog } from './recurring-event-dialog';

/**
 * Convert a RepeatOption UI value to an RRULE string (or null for 'none').
 */
function repeatOptionToRRule(option: RepeatOption): string | null {
  switch (option) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly':
      return 'FREQ=WEEKLY';
    case 'monthly':
      return 'FREQ=MONTHLY';
    case 'yearly':
      return 'FREQ=YEARLY';
    default:
      return null;
  }
}

/**
 * Convert an ICS recurrence frequency string to a RepeatOption UI value.
 */
function frequencyToRepeatOption(frequency: string | undefined): RepeatOption {
  switch (frequency?.toUpperCase()) {
    case 'DAILY':
      return 'daily';
    case 'WEEKLY':
      return 'weekly';
    case 'MONTHLY':
      return 'monthly';
    case 'YEARLY':
      return 'yearly';
    default:
      return 'none';
  }
}

interface CalendarEventPopoverProps {
  event: EventOccurrence;
  /** When true, the popover opens in edit mode to create a new event */
  isNewEvent?: boolean;
  /** Available calendars (required when isNewEvent is true) */
  calendars?: Calendar[];
  /** Available accounts (required when isNewEvent is true) */
  accounts?: Account[];
  /** Disabled calendar IDs (required when isNewEvent is true) */
  disabledCalendars?: string[];
}

interface CalendarEventPopoverState {
  description: string;
  start: number;
  end: number;
  location: string;
  attendees: EventAttendee[];
  editing: boolean;
  title: string;
  // New fields for enhanced editing
  allDay: boolean;
  repeat: RepeatOption;
  alert: AlertTiming;
  showAs: ShowAsOption;
  calendarColor: string;
  timezone: string;
  showInvitees: boolean;
  showNotes: boolean;
  // Calendar selection for new events
  selectedCalendarId: string;
  selectedAccountId: string;
}

export class CalendarEventPopover extends React.Component<
  CalendarEventPopoverProps,
  CalendarEventPopoverState
> {
  private attendeesInputRef = React.createRef<EventAttendeesInput>();
  private notesTextareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props: CalendarEventPopoverProps) {
    super(props);
    const { description, start, end, location, attendees, title, isAllDay } = this.props.event;

    this.state = {
      description,
      start,
      end,
      location,
      title,
      editing: !!this.props.isNewEvent,
      attendees,
      // Initialize new fields with defaults
      allDay: isAllDay || false,
      repeat: 'none',
      alert: '10min',
      showAs: 'busy',
      calendarColor: '#419bf9',
      timezone: DateUtils.timeZone,
      showInvitees: attendees && attendees.length > 0,
      showNotes: !!description,
      selectedCalendarId: this.props.event.calendarId,
      selectedAccountId: this.props.event.accountId,
    };
  }

  componentDidUpdate(prevProps: CalendarEventPopoverProps, prevState: CalendarEventPopoverState) {
    // Update state when event prop changes
    if (prevProps.event !== this.props.event) {
      const { description, start, end, location, attendees, title } = this.props.event;
      this.setState({ description, start, end, location, attendees, title });
    }

    // Autofocus invitees input when section is expanded
    // Use requestAnimationFrame to ensure DOM is ready
    if (this.state.showInvitees && !prevState.showInvitees) {
      requestAnimationFrame(() => {
        if (this.attendeesInputRef.current) {
          this.attendeesInputRef.current.focus();
        }
      });
    }
    // Autofocus notes textarea when section is expanded
    if (this.state.showNotes && !prevState.showNotes) {
      requestAnimationFrame(() => {
        if (this.notesTextareaRef.current) {
          this.notesTextareaRef.current.focus();
        }
      });
    }
  }

  onEdit = async () => {
    // Load actual recurrence and timezone from the event's ICS data
    let repeat: RepeatOption = 'none';
    let timezone = this.state.timezone;
    try {
      const eventId = parseEventIdFromOccurrence(this.props.event.id);
      const event = await DatabaseStore.find<Event>(Event, eventId);
      if (event) {
        const recurrenceInfo = ICSEventHelpers.getRecurrenceInfo(event.ics);
        repeat = frequencyToRepeatOption(recurrenceInfo.frequency);
        const eventTz = ICSEventHelpers.getEventTimezone(event.ics);
        if (eventTz) {
          timezone = eventTz;
        }
      }
    } catch (e) {
      // Fall back to defaults if we can't read the event
    }
    this.setState({ editing: true, repeat, timezone });
  };

  getStartMoment = () => moment(this.state.start * 1000);
  getEndMoment = () => moment(this.state.end * 1000);

  /**
   * Apply the current popover state as ICS property changes (title, location,
   * description, attendees) to an ICS string. Time updates are handled separately
   * by the caller so that recurring events can use delta-based shifting.
   */
  _applyPropertyEdits(ics: string): string {
    ics = ICSEventHelpers.updateEventProperty(
      ics,
      'summary',
      this.state.title || localized('New Event')
    );
    ics = ICSEventHelpers.updateEventProperty(ics, 'location', this.state.location || '');
    ics = ICSEventHelpers.updateEventProperty(ics, 'description', this.state.description || '');
    ics = ICSEventHelpers.updateAttendees(ics, this.state.attendees || []);
    return ics;
  }

  saveEdits = async (): Promise<void> => {
    if (this.props.isNewEvent) {
      await this._createNewEvent();
      return;
    }

    // Extract the real event ID from the occurrence ID (format: `${eventId}-e${idx}`)
    const eventId = parseEventIdFromOccurrence(this.props.event.id);

    // Fetch the actual Event from the database
    const event = await DatabaseStore.find<Event>(Event, eventId);
    if (!event) {
      console.error(`Could not find event with id ${eventId} to update`);
      this.setState({ editing: false });
      return;
    }

    const isRecurring =
      ICSEventHelpers.isRecurringEvent(event.ics) && !event.isRecurrenceException();

    if (this.props.event.isException) {
      // This occurrence already has an exception — always edit the exception directly.
      // The user already chose "this occurrence only" when the exception was created;
      // asking again would be confusing and risks creating duplicate exception VEVENTs.
      await this._saveOccurrenceException(event);
    } else if (isRecurring) {
      const choice = await showRecurringEventDialog('edit', this.props.event.title);
      if (choice === 'cancel') {
        return;
      }
      if (choice === 'this-occurrence') {
        await this._saveOccurrenceException(event);
      } else {
        this._saveAllOccurrences(event);
      }
    } else {
      this._saveAllOccurrences(event);
    }

    this.setState({ editing: false });
    Actions.closePopover();
  };

  /**
   * Save edits to the master event (used for non-recurring events and "all occurrences").
   *
   * For recurring events, time changes use delta-based shifting (not absolute times) so
   * that occurrences before the one being edited are not dropped. Inline exception
   * RECURRENCE-IDs are shifted by the same delta so they remain mapped to the correct
   * RRULE-generated slots. Exception DTSTART/DTEND are left unchanged — preserving the
   * user's explicit exception time (e.g., a 2AM exception stays at 2AM after shifting
   * the base series to a different time).
   */
  _saveAllOccurrences(event: Event): void {
    const undoData = {
      ics: event.ics,
      recurrenceStart: event.recurrenceStart,
      recurrenceEnd: event.recurrenceEnd,
    };

    // Apply non-time property edits (title, location, description, attendees)
    let ics = this._applyPropertyEdits(event.ics);

    // Apply time updates with the appropriate strategy
    const isRecurring = ICSEventHelpers.isRecurringEvent(ics);
    if (isRecurring) {
      // Delta-based shifting: compute how much the user moved the occurrence and apply
      // the same delta to the master DTSTART. This preserves all occurrences relative
      // to the new master start (unlike absolute updateEventTimes which would drop
      // occurrences scheduled before the selected occurrence's date).
      const originalOccurrenceStart = this.props.event.start;
      ics = ICSEventHelpers.updateRecurringEventTimes(
        ics,
        originalOccurrenceStart,
        this.state.start,
        this.state.end,
        this.state.allDay
      );
      // Shift inline exception RECURRENCE-IDs so they still map to the correct slots
      const deltaMs = (this.state.start - originalOccurrenceStart) * 1000;
      if (deltaMs !== 0) {
        ics = ICSEventHelpers.shiftInlineExceptions(ics, deltaMs);
      }
    } else {
      // Non-recurring: absolute time update is correct
      ics = ICSEventHelpers.updateEventTimes(ics, {
        start: this.state.start,
        end: this.state.end,
        isAllDay: this.state.allDay,
        timezone: this.state.timezone,
      });
    }

    // Update recurrence rule (only for master event edits)
    const rrule = repeatOptionToRRule(this.state.repeat);
    ics = ICSEventHelpers.updateRecurrenceRule(ics, rrule);

    event.ics = ics;
    event.recurrenceStart = this.state.start;
    event.recurrenceEnd = this.state.end;

    Actions.queueTask(
      SyncbackEventTask.forUpdating({
        event,
        undoData,
        description: localized('Edit event'),
      })
    );
  }

  /**
   * Create an exception for a single occurrence, embedding it inline in the master
   * VCALENDAR and queuing a single update task (RFC 4791 §4.1 compliant).
   */
  async _saveOccurrenceException(masterEvent: Event): Promise<void> {
    const masterUndoData = {
      ics: masterEvent.ics,
      recurrenceStart: masterEvent.recurrenceStart,
      recurrenceEnd: masterEvent.recurrenceEnd,
    };

    // The original occurrence start time — i.e., the time the RRULE generates for this slot.
    // For a first-time exception this equals event.start (the occurrence's normal time).
    // For a re-edit of an existing exception, event.start is the *moved* time, so we use
    // recurrenceIdStart instead (the RECURRENCE-ID value = the original unmodified time).
    // This ensures the upsert in createRecurrenceException finds and replaces the existing
    // inline exception VEVENT rather than creating a duplicate.
    const originalOccurrenceStart = this.props.event.recurrenceIdStart ?? this.props.event.start;

    // Embed the exception VEVENT inline in the master VCALENDAR with new times
    const { masterIcs, recurrenceId } = ICSEventHelpers.createRecurrenceException(
      masterEvent.ics,
      originalOccurrenceStart,
      this.state.start,
      this.state.end,
      this.state.allDay
    );

    // Apply property edits (title, location, description, attendees) to the inline exception
    const updatedMasterIcs = ICSEventHelpers.applyEditsToException(masterIcs, recurrenceId, {
      summary: this.state.title || localized('New Event'),
      location: this.state.location || '',
      description: this.state.description || '',
      attendees: this.state.attendees || [],
    });

    // Update master event (now contains the inline exception VEVENT)
    masterEvent.ics = updatedMasterIcs;
    masterEvent.recurrenceStart = this.state.start;
    masterEvent.recurrenceEnd = this.state.end;

    // Queue a single update task with full undo support
    Actions.queueTask(
      SyncbackEventTask.forUpdating({
        event: masterEvent,
        undoData: masterUndoData,
        description: localized('Edit occurrence'),
      })
    );
  }

  _createNewEvent = async (): Promise<void> => {
    const {
      title,
      start,
      end,
      allDay,
      location,
      description,
      attendees,
      repeat,
      timezone,
      selectedCalendarId,
      selectedAccountId,
    } = this.state;

    Actions.closePopover();

    await createCalendarEvent({
      summary: title || localized('New Event'),
      start: new Date(start * 1000),
      end: new Date(end * 1000),
      isAllDay: allDay,
      calendarId: selectedCalendarId,
      accountId: selectedAccountId,
      description: description || undefined,
      location: location || undefined,
      attendees:
        attendees && attendees.length > 0
          ? attendees.map((a) => ({ email: a.email, name: a.name }))
          : undefined,
      recurrenceRule: repeatOptionToRRule(repeat) || undefined,
      timezone,
    });
  };

  // If on the hour, formats as "3 PM", else formats as "3:15 PM"

  updateAttendees = (attendees: EventAttendee[]): void => {
    this.setState({ attendees });
  };

  updateField = <K extends keyof CalendarEventPopoverState>(
    key: K,
    value: CalendarEventPopoverState[K]
  ): void => {
    this.setState({ [key]: value } as Pick<CalendarEventPopoverState, K>);
  };

  renderEditable = () => {
    const {
      title,
      description,
      start,
      end,
      location,
      attendees,
      allDay,
      repeat,
      alert,
      showAs,
      timezone,
      showInvitees,
      showNotes,
    } = this.state;

    const notes = extractNotesFromDescription(description);

    return (
      <div className="calendar-event-popover editing" tabIndex={0}>
        <TabGroupRegion>
          {/* Title row */}
          <div className="title-wrapper">
            <input
              className="title"
              type="text"
              aria-label={localized('Event title')}
              placeholder={localized('New Event')}
              value={title}
              onChange={(e) => this.updateField('title', e.target.value)}
            />
            {/* CalendarColorPicker disabled until custom event colors are fully supported */}
          </div>

          {/* Calendar selector - only shown for new events */}
          {this.props.isNewEvent && this.props.calendars && this.props.accounts && (
            <CalendarSelector
              calendars={this.props.calendars}
              accounts={this.props.accounts}
              disabledCalendars={this.props.disabledCalendars || []}
              selectedCalendarId={this.state.selectedCalendarId}
              onChange={(calendarId, accountId) => {
                this.setState({ selectedCalendarId: calendarId, selectedAccountId: accountId });
              }}
            />
          )}

          {/* Location with video call toggle */}
          <LocationVideoInput
            value={location}
            onChange={(value) => this.updateField('location', value)}
            onVideoToggle={() => {
              // Placeholder: could add video call link
            }}
          />

          {/* All-day toggle */}
          <AllDayToggle
            checked={allDay}
            onChange={(checked) => this.updateField('allDay', checked)}
          />

          {/* Start/End times using property rows */}
          <EventPropertyRow label={localized('starts:')}>
            <DatePicker
              value={start * 1000}
              onChange={(ts) => this.updateField('start', ts / 1000)}
            />
            {!allDay && (
              <TimePicker
                value={start * 1000}
                onChange={(ts) => this.updateField('start', ts / 1000)}
              />
            )}
          </EventPropertyRow>

          <EventPropertyRow label={localized('ends:')}>
            <DatePicker value={end * 1000} onChange={(ts) => this.updateField('end', ts / 1000)} />
            {!allDay && (
              <TimePicker
                value={end * 1000}
                onChange={(ts) => this.updateField('end', ts / 1000)}
              />
            )}
          </EventPropertyRow>

          {/* Time zone selector */}
          <TimeZoneSelector
            value={timezone}
            onChange={(value) => this.updateField('timezone', value)}
          />

          {/* Repeat selector */}
          <RepeatSelector value={repeat} onChange={(value) => this.updateField('repeat', value)} />

          {/* Alert selector */}
          <AlertSelector value={alert} onChange={(value) => this.updateField('alert', value)} />

          {/* Show as selector */}
          <ShowAsSelector value={showAs} onChange={(value) => this.updateField('showAs', value)} />

          {/* Invitees section - collapsible */}
          {showInvitees ? (
            <div className="expanded-section">
              <div className="section-header">
                <span className="section-title">{localized('Invitees')}</span>
                <span
                  className="section-close"
                  onClick={() => this.setState({ showInvitees: false })}
                >
                  ×
                </span>
              </div>
              <EventAttendeesInput
                ref={this.attendeesInputRef}
                className="event-participant-field"
                attendees={attendees}
                change={(val) => this.updateField('attendees', val)}
              />
            </div>
          ) : (
            <div className="action-link" onClick={() => this.setState({ showInvitees: true })}>
              {localized('Add Invitees')}
            </div>
          )}

          {/* Notes section - collapsible */}
          {showNotes ? (
            <div className="expanded-section">
              <div className="section-header">
                <span className="section-title">{localized('Notes')}</span>
                <span className="section-close" onClick={() => this.setState({ showNotes: false })}>
                  ×
                </span>
              </div>
              <textarea
                ref={this.notesTextareaRef}
                value={notes}
                aria-label={localized('Notes')}
                placeholder={localized('Add notes or URL...')}
                onChange={(e) => this.updateField('description', e.target.value)}
              />
            </div>
          ) : (
            <div className="action-link" onClick={() => this.setState({ showNotes: true })}>
              {localized('Add Notes or URL')}
            </div>
          )}

          {/* Action buttons */}
          <EventPopoverActions onSave={this.saveEdits} onCancel={() => Actions.closePopover()} />
        </TabGroupRegion>
      </div>
    );
  };

  render() {
    if (this.state.editing || this.props.isNewEvent) {
      return this.renderEditable();
    }
    return <CalendarEventPopoverUnenditable {...this.props} onEdit={this.onEdit} />;
  }
}

class CalendarEventPopoverUnenditable extends React.Component<{
  event: EventOccurrence;
  onEdit: () => void;
}> {
  descriptionRef = React.createRef<HTMLDivElement>();

  renderTime() {
    const startMoment = moment(this.props.event.start * 1000);
    const endMoment = moment(this.props.event.end * 1000);
    const date = startMoment.format('dddd, MMMM D'); // e.g. Tuesday, February 22
    const timeRange = `${formatTime(startMoment)} - ${formatTime(endMoment)}`;
    return (
      <div>
        {date}
        <br />
        {timeRange}
      </div>
    );
  }

  componentDidMount() {
    this.autolink();
  }

  componentDidUpdate() {
    this.autolink();
  }

  autolink() {
    if (!this.descriptionRef.current) return;
    Autolink(this.descriptionRef.current, {
      async: false,
      telAggressiveMatch: true,
    });
  }

  render() {
    const { event, onEdit } = this.props;
    const { title, description, location, attendees } = event;

    const notes = extractNotesFromDescription(description);

    return (
      <div className="calendar-event-popover" tabIndex={0}>
        <div className="title-wrapper">
          <div className="title">{title}</div>
          <RetinaImg
            className="edit-icon"
            name="edit-icon.png"
            title="Edit Item"
            mode={RetinaImg.Mode.ContentIsMask}
            onClick={onEdit}
          />
        </div>
        {location && (
          <div className="location">
            {location.startsWith('http') || location.startsWith('tel:') ? (
              <a href={location}>{location}</a>
            ) : (
              location
            )}
          </div>
        )}
        <div className="section">{this.renderTime()}</div>
        <ScrollRegion className="section invitees">
          <div className="label">{localized(`Invitees`)}: </div>
          <div className="invitees-list">
            {sortAttendeesByStatus(attendees).map((a, idx) => {
              const partstat = a.partstat || 'NEEDS-ACTION';
              const questionMarkIcon = (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M3.5 3.5a1.5 1.5 0 0 1 2.6 1c0 1-1.1 1-1.1 2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <circle cx="5" cy="8.5" r="0.75" fill="currentColor" />
                </svg>
              );
              let statusIcon: React.ReactNode;
              let statusClass = 'needs-action';
              if (partstat === 'ACCEPTED') {
                statusIcon = (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1.5 5.5L4 8l4.5-6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
                statusClass = 'accepted';
              } else if (partstat === 'DECLINED') {
                statusIcon = (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 2l6 6M8 2l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                );
                statusClass = 'declined';
              } else if (partstat === 'TENTATIVE') {
                statusIcon = questionMarkIcon;
                statusClass = 'tentative';
              } else {
                statusIcon = questionMarkIcon;
              }
              return (
                <div key={idx} className={`attendee-chip ${statusClass}`}>
                  <span className="attendee-status">{statusIcon}</span>
                  <span className="attendee-name">{a.name || a.email}</span>
                </div>
              );
            })}
          </div>
        </ScrollRegion>
        <ScrollRegion className="section description">
          <div className="description">
            <div className="label">{localized(`Notes`)}: </div>
            <div ref={this.descriptionRef}>{notes}</div>
          </div>
        </ScrollRegion>
      </div>
    );
  }
}

function sortAttendeesByStatus(attendees: EventAttendee[]): EventAttendee[] {
  const statusOrder = { ACCEPTED: 0, TENTATIVE: 1, 'NEEDS-ACTION': 1, DECLINED: 2 };
  return [...attendees].sort((a, b) => {
    const aOrder = statusOrder[a.partstat] ?? 1;
    const bOrder = statusOrder[b.partstat] ?? 1;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aName = (a.name || a.email).toLowerCase();
    const bName = (b.name || b.email).toLowerCase();
    return aName.localeCompare(bName);
  });
}

function extractNotesFromDescription(description: string) {
  const fragment = document.createDocumentFragment();
  const descriptionRoot = document.createElement('root');
  fragment.appendChild(descriptionRoot);
  descriptionRoot.innerHTML = description;

  const els = descriptionRoot.querySelectorAll('meta[itemprop=description]');
  let notes: string = null;
  if (els.length) {
    notes = Array.from(els)
      .map((el) => (el as HTMLMetaElement).content)
      .join('\n');
  } else {
    notes = descriptionRoot.innerText;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextNotes = notes.replace('\n\n', '\n');
    if (nextNotes === notes) {
      break;
    }
    notes = nextNotes;
  }
  return notes;
}

function formatTime(momentTime: Moment) {
  const min = momentTime.minutes();
  if (min === 0) {
    return momentTime.format('h A');
  }
  return momentTime.format('h:mm A');
}
