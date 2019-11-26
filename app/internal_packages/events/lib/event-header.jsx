import { RetinaImg } from 'mailspring-component-kit';
import _ from 'underscore';
import Button from '../../edison-beijing-chat/components/common/Button';
const {
  Actions,
  React,
  PropTypes,
  DateUtils,
  Message,
  EventRSVPTask,
  DatabaseStore,
  CalendarStore,
} = require('mailspring-exports');
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

  render() {
    if (this.state.event != null) {
      return (
        <div className="event-wrapper">
          <div className="event-header">
            <span className="event-title">{this.state.event.summary || 'Event'}</span>
            <RetinaImg name={'feed-calendar.svg'} style={{ width: 20 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
          </div>
          <div className="event-body">
            <div className="event-data">
              <div className="event-time">
                <span className="event-key-name">When</span>
                {this.renderWhen()}
              </div>
              <div className="event-location">
                <span className="event-key-name">Location</span>
                {this.state.event.location ? this.state.event.location : 'Unknown'}
              </div>
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
        {actions.map(item => {
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
        })}
      </div>
    );
  }

  _rsvp = (message, status) => {
    if (this.props.message.calendarStatus() !== status) {
      Actions.RSVPEvent(message, status);
    }
  };
}

module.exports = EventHeader;
