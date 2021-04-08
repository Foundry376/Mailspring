import moment, { Moment } from 'moment';
import React from 'react';
import {
  Actions,
  DateUtils,
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
}

export class CalendarEventPopover extends React.Component<
  CalendarEventPopoverProps,
  CalendarEventPopoverState
> {
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
    };
  }

  componentWillReceiveProps = nextProps => {
    const { description, start, end, location, attendees, title } = nextProps.event;
    this.setState({ description, start, end, location, attendees, title });
  };

  onEdit = () => {
    this.setState({ editing: true });
  };

  getStartMoment = () => moment(this.state.start * 1000);
  getEndMoment = () => moment(this.state.end * 1000);

  saveEdits = () => {
    const event = this.props.event.clone();
    const keys = ['title', 'description', 'location', 'attendees'];
    for (const key of keys) {
      event[key] = this.state[key];
    }

    // TODO, this component shouldn't save the event here, we should expose an
    // `onEditEvent` or similar callback
    // TODO: How will this affect the event if the when object was originally
    //   a datespan, with start_date and end_date attributes?
    event.when.start_time = this.state.start;
    event.when.end_time = this.state.end;

    this.setState({ editing: false }); // TODO: where's the best place to put this?
    const task = new SyncbackEventTask(event.id);
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
    const { title, description, start, end, location, attendees } = this.state;

    const notes = extractNotesFromDescription(description);

    return (
      <div className="calendar-event-popover" tabIndex={0}>
        <TabGroupRegion>
          <div className="title-wrapper">
            <input
              className="title"
              type="text"
              value={title}
              onChange={e => {
                this.updateField('title', e.target.value);
              }}
            />
          </div>
          <input
            className="location"
            type="text"
            value={location}
            onChange={e => {
              this.updateField('location', e.target.value);
            }}
          />
          <div className="section">
            <EventTimerangePicker
              start={start}
              end={end}
              onChange={({ start, end }) => this.setState({ start, end })}
            />
          </div>
          <div className="section">
            <div className="label">{localized(`Invitees`)}:</div>
            <EventAttendeesInput
              className="event-participant-field"
              attendees={attendees}
              change={val => {
                this.updateField('attendees', val);
              }}
            />
          </div>
          <div className="section">
            <div className="label">{localized(`Notes`)}:</div>
            <input
              type="text"
              value={notes}
              onChange={e => {
                this.updateField('description', e.target.value);
              }}
            />
          </div>
          <span onClick={this.saveEdits}>{localized(`Save`)}</span>
          <span onClick={() => Actions.closePopover()}>{localized(`Cancel`)}</span>
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
              <div key={idx}> {a.cn}</div>
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
