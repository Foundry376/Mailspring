import { RetinaImg } from 'mailspring-component-kit';

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


  componentWillReceiveProps(nextProps) {
    this.setState({ event: nextProps.calendar ? nextProps.calendar.getFirstEvent() : null });
    // this._onChange();
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  render() {
    const timeFormat = DateUtils.getTimeFormat({ timeZone: true });
    if (this.state.event != null) {
      return (
        <div className="event-wrapper">
          <div className="event-header">
            <RetinaImg
              name="icon-RSVP-calendar-mini@2x.png"
              mode={RetinaImg.Mode.ContentPreserve}
            />
            <span className="event-title-text">Event: </span>
            <span className="event-title">{this.state.event.summary}</span>
          </div>
          <div className="event-body">
            <div className="event-date">
              <div className="event-day">
                {moment(this.state.event.startDate.toJSDate())
                  .tz(DateUtils.timeZone)
                  .format('dddd, MMMM Do')}
              </div>
              <div>
                <div className="event-time">
                  {moment(this.state.event.startDate.toJSDate())
                    .tz(DateUtils.timeZone)
                    .format(timeFormat)}
                </div>
                {this._renderEventActions()}
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      return <div/>;
    }
  }

  _renderEventActions() {
    if (!CalendarStore.needRSVPByMessage(this.props.message)) {
      return null;
    }

    const actions = [{ status: 1, label: 'Accept', css: 'yes' }, { status: 3, label: 'Maybe', css: 'maybe' }, { status: 2, label: 'No', css: 'no' }];

    return (
      <div className="event-actions">
        {actions.map(item => {
          const { status, label, css } = item;
          let classes = 'btn-rsvp ';
          if (this.props.message.calendarStatus() === status) {
            classes += css;
          }
          return (
            <div key={status} className={classes} onClick={() => this._rsvp(this.props.message, status)}>
              {label}
            </div>
          );
        })}
      </div>
    );
  }

  _rsvp = (message, status) => {
    Actions.RSVPEvent(message, status);
  };
}

module.exports = EventHeader;
