import { RetinaImg } from 'mailspring-component-kit';
import _ from 'underscore';
const {
  Actions,
  React,
  PropTypes,
  DateUtils,
  Message,
  CalendarStore,
  AttachmentStore,
} = require('mailspring-exports');
import { remote } from 'electron';
const moment = require('moment-timezone');

class EventHeader extends React.Component {
  static displayName = 'EventHeader';

  static propTypes = { message: PropTypes.instanceOf(Message).isRequired };

  constructor(props) {
    super(props);
    this.state = { event: this.props.calendar ? this.props.calendar.getFirstEvent() : null };
  }

  _onChange() {
    if (!this.state.event) {
      return;
    }
    this.setState({ event: this.props.calendar ? this.props.calendar.getFirstEvent() : null });
  }


  UNSAFE_componentWillReceiveProps(nextProps) {
    this.setState({ event: nextProps.calendar ? nextProps.calendar.getFirstEvent() : null });
    // this._onChange();
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }
  renderWhen() {
    const recurrence = Object.keys(this.state.event.getRecurrenceTypes());
    const repeat = recurrence.length > 0 ? ', Repeating event' : '';
    let duration = '';
    if (this.state.event.isAllDay()) {
      duration = 'All Day, ';
    } else if (this.state.event.isAllWeek()) {
      duration = 'All Week, ';
    }
    const startDate = moment(this.state.event.startDate.toJSDate())
      .tz(DateUtils.timeZone)
      .format('dddd, MMMM Do');
    let startTime = '';
    let end = '';
    if (duration.length === 0) {
      startTime = ', ' + moment(this.state.event.startDate.toJSDate())
        .tz(DateUtils.timeZone)
        .format(DateUtils.getTimeFormat({ timeZone: false }));
      if (this.state.event.isLessThanADay()) {
        end = ' - ' + moment(this.state.event.endDate.toJSDate())
          .tz(DateUtils.timeZone)
          .format(DateUtils.getTimeFormat({ timeZone: true }));
      } else {
        end = ' - ' + moment(this.state.event.endDate.toJSDate())
          .tz(DateUtils.timeZone)
          .format('dddd, MMMM Do') + ' ' + moment(this.state.event.endDate.toJSDate())
            .tz(DateUtils.timeZone)
            .format(DateUtils.getTimeFormat({ timeZone: true }))
      }
    }
    return `${duration} ${startDate}${startTime} ${end}${repeat}`;
  }

  _onContextMenu = () => {
    const menu = new remote.Menu();
    menu.append(new remote.MenuItem({ role: 'copy' }));
    menu.popup({});
  };

  render() {
    if (this.state.event != null) {
      return (
        <div className="event-wrapper">
          <div className="event-header">
            <span className="event-title" onContextMenu={this._onContextMenu}>{this.state.event.summary || 'Event'}</span>
            <RetinaImg name={'feed-calendar.svg'} style={{ width: 20 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
          </div>
          <div className="event-body">
            <div className="event-data">
              <div className="event-time">
                <span className="event-key-name">When</span>
                {this.renderWhen()}
              </div>
              {this._renderLocation()}
              <div className="event-organizer">
                <span className="event-key-name">Organizer</span>
                {this.state.event.organizer ? this.state.event.organizer.name : 'Unknown'}
              </div>
            </div>
            {this._renderEventActions()}
          </div>
        </div>
      );
    } else {
      return <div />;
    }
  }

  _renderEventActions() {
    if (!CalendarStore.needRSVPByMessage(this.props.message)) {
      return null;
    }

    const actions = [{ status: 1, label: 'Yes', css: 'yes' }, { status: 3, label: 'Maybe', css: 'maybe' }, { status: 2, label: 'No', css: 'no' }];

    return (
      <div className="event-actions">
        <div>{actions.map(item => {
          const { status, label, css } = item;
          let classes = 'btn btn-rsvp ';
          if (this.props.message.calendarStatus() === status) {
            classes += css;
          }
          return (
            <div key={status} className={classes} onClick={_.throttle(this._rsvp.bind(this, this.props.message, status), 200, { trailing: false })}>
              {label}
            </div>
          );
        })}</div>
        <div className="open-external" onClick={this._openCalenderExternally}>more details</div>
      </div>
    );
  }

  _renderLocation = () => {
    let locationString = 'Unknown';
    if (this.state.event.location) {
      locationString = this.state.event.location;
    }
    return (
      <div className="event-location" onContextMenu={this._onContextMenu}>
        <span className="event-key-name">Location</span>
        <span>{locationString}</span>
        {this.state.event.location &&
          <span className="open-external" onClick={this._openMapExternally}>
            <RetinaImg name={'map-preview.png'}
                mode={RetinaImg.Mode.ContentPreserve}
                style={{ width: 40, height: 40 }}/>
        </span>}
      </div>
    );
  };

  _openMapExternally = _.throttle(() => {
      const searchQueryBase = 'https://www.openstreetmap.org/search?commit=Go&query=';
      const searchQuery = `${searchQueryBase}${encodeURI(this.state.event.location)}`
    remote.shell.openExternal(searchQuery);
  }, 500);

  _openCalenderExternally = _.throttle(() => {
    const file = this.props.message.files.filter(file => {
      return file.id === this.props.message.calendarFileId;
    });
    if (file.length > 0) {
      const filePath = AttachmentStore.pathForFile(file[0]);
      if (filePath) {
        remote.shell.openItem(filePath);
      }
    }
  }, 500);

  _rsvp = (message, status) => {
    if (this.props.message.calendarStatus() !== status) {
      Actions.RSVPEvent(message, status);
    }
  };
}

module.exports = EventHeader;
