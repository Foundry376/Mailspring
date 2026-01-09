import moment, { Moment } from 'moment';
import React from 'react';
import {
  Actions,
  DatabaseStore,
  DateUtils,
  Event,
  SyncbackEventTask,
  localized,
  RegExpUtils,
  Autolink,
} from 'mailspring-exports';
import {
  DatePicker,
  RetinaImg,
  ScrollRegion,
  TabGroupRegion,
  TimePicker,
} from 'mailspring-component-kit';
import { EventAttendeesInput } from './event-attendees-input';
import { EventOccurrence } from './calendar-data-source';
import { EventTimerangePicker } from './event-timerange-picker';
import { EventPropertyRow } from './event-property-row';
import { CalendarColorPicker } from './calendar-color-picker';
import { LocationVideoInput } from './location-video-input';
import { AllDayToggle } from './all-day-toggle';
import { RepeatSelector, RepeatOption } from './repeat-selector';
import { AlertSelector, AlertTiming } from './alert-selector';
import { ShowAsSelector, ShowAsOption } from './show-as-selector';
import { EventPopoverActions } from './event-popover-actions';
import { TimeZoneSelector } from './timezone-selector';

interface CalendarEventPopoverProps {
  event: EventOccurrence;
}

interface CalendarEventPopoverState {
  description: string;
  start: number;
  end: number;
  location: string;
  attendees: any[];
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
}

export class CalendarEventPopover extends React.Component<
  CalendarEventPopoverProps,
  CalendarEventPopoverState
> {
  private attendeesInputRef = React.createRef<EventAttendeesInput>();
  private notesTextareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props) {
    super(props);
    const { description, start, end, location, attendees, title } = this.props.event;

    this.state = {
      description,
      start,
      end,
      location,
      title,
      editing: false,
      attendees,
      // Initialize new fields with defaults
      allDay: false,
      repeat: 'none',
      alert: '10min',
      showAs: 'busy',
      calendarColor: '#419bf9',
      timezone: DateUtils.timeZone,
      showInvitees: attendees && attendees.length > 0,
      showNotes: !!description,
    };
  }

  componentDidUpdate(
    prevProps: CalendarEventPopoverProps,
    prevState: CalendarEventPopoverState
  ) {
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

  onEdit = () => {
    this.setState({ editing: true });
  };

  getStartMoment = () => moment(this.state.start * 1000);
  getEndMoment = () => moment(this.state.end * 1000);

  saveEdits = async () => {
    // Extract the real event ID from the occurrence ID (format: `${eventId}-e${idx}`)
    const occurrenceId = this.props.event.id;
    const eventId = occurrenceId.replace(/-e\d+$/, '');

    // Fetch the actual Event from the database
    const event = await DatabaseStore.find<Event>(Event, eventId);
    if (!event) {
      console.error(`Could not find event with id ${eventId} to update`);
      this.setState({ editing: false });
      return;
    }

    // TODO: This component shouldn't save the event here, we should expose an
    // `onEditEvent` or similar callback that properly updates the ICS data.
    // For now, we update the recurrence times and queue the syncback task.
    event.recurrenceStart = this.state.start;
    event.recurrenceEnd = this.state.end;

    this.setState({ editing: false });
    const task = SyncbackEventTask.forUpdating({ event });
    Actions.queueTask(task);
  };

  // If on the hour, formats as "3 PM", else formats as "3:15 PM"

  updateAttendees = attendees => {
    this.setState({ attendees });
  };

  updateField = (key, value) => {
    const updates = {};
    updates[key] = value;
    this.setState(updates);
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
      calendarColor,
      timezone,
      showInvitees,
      showNotes,
    } = this.state;

    const notes = extractNotesFromDescription(description);

    return (
      <div className="calendar-event-popover editing" tabIndex={0}>
        <TabGroupRegion>
          {/* Title row with color picker */}
          <div className="title-wrapper">
            <input
              className="title"
              type="text"
              placeholder={localized('New Event')}
              value={title}
              onChange={e => this.updateField('title', e.target.value)}
            />
            <CalendarColorPicker
              color={calendarColor}
              onChange={color => this.updateField('calendarColor', color)}
            />
          </div>

          {/* Location with video call toggle */}
          <LocationVideoInput
            value={location}
            onChange={value => this.updateField('location', value)}
            onVideoToggle={() => {
              // Placeholder: could add video call link
            }}
          />

          {/* All-day toggle */}
          <AllDayToggle
            checked={allDay}
            onChange={checked => this.updateField('allDay', checked)}
          />

          {/* Start/End times using property rows */}
          <EventPropertyRow label={localized('starts:')}>
            <DatePicker value={start * 1000} onChange={ts => this.updateField('start', ts / 1000)} />
            {!allDay && (
              <TimePicker
                value={start * 1000}
                onChange={ts => this.updateField('start', ts / 1000)}
              />
            )}
          </EventPropertyRow>

          <EventPropertyRow label={localized('ends:')}>
            <DatePicker value={end * 1000} onChange={ts => this.updateField('end', ts / 1000)} />
            {!allDay && (
              <TimePicker value={end * 1000} onChange={ts => this.updateField('end', ts / 1000)} />
            )}
          </EventPropertyRow>

          {/* Time zone selector */}
          <TimeZoneSelector
            value={timezone}
            onChange={value => this.updateField('timezone', value)}
          />

          {/* Repeat selector */}
          <RepeatSelector
            value={repeat}
            onChange={value => this.updateField('repeat', value)}
          />

          {/* Alert selector */}
          <AlertSelector value={alert} onChange={value => this.updateField('alert', value)} />

          {/* Show as selector */}
          <ShowAsSelector value={showAs} onChange={value => this.updateField('showAs', value)} />

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
                change={val => this.updateField('attendees', val)}
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
                placeholder={localized('Add notes or URL...')}
                onChange={e => this.updateField('description', e.target.value)}
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
    if (this.state.editing) {
      return this.renderEditable();
    }
    return (
      <CalendarEventPopoverUnenditable
        {...this.props}
        onEdit={() => this.setState({ editing: true })}
      />
    );
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
          <div>
            {attendees.map((a, idx) => (
              <div key={idx}> {a.name || a.email}</div>
            ))}
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

function extractNotesFromDescription(description: string) {
  const fragment = document.createDocumentFragment();
  const descriptionRoot = document.createElement('root');
  fragment.appendChild(descriptionRoot);
  descriptionRoot.innerHTML = description;

  const els = descriptionRoot.querySelectorAll('meta[itemprop=description]');
  let notes: string = null;
  if (els.length) {
    notes = Array.from(els)
      .map((el: any) => el.content)
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
