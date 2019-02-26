const { RetinaImg } = require('mailspring-component-kit');
const {
  Actions,
  localized,
  React,
  PropTypes,
  DateUtils,
  Message,
  Event,
  EventRSVPTask,
  DatabaseStore,
} = require('mailspring-exports');
const moment = require('moment-timezone');

class EventHeader extends React.Component {
  static displayName = 'EventHeader';

  static propTypes = { message: PropTypes.instanceOf(Message).isRequired };

  constructor(props) {
    super(props);
    this.state = { event: this.props.message.events[0] };
  }

  _onChange() {
    if (!this.state.event) {
      return;
    }
    DatabaseStore.find(Event, this.state.event.id).then(event => {
      if (!event) {
        return;
      }
      this.setState({ event });
    });
  }

  componentDidMount() {
    // TODO: This should use observables!
    this._unlisten = DatabaseStore.listen(change => {
      if (this.state.event && change.objectClass === Event.name) {
        const updated = change.objects.find(o => o.id === this.state.event.id);
        if (updated) {
          this.setState({ event: updated });
        }
      }
    });
    this._onChange();
  }

  componentWillReceiveProps(nextProps) {
    this.setState({ event: nextProps.message.events[0] });
    this._onChange();
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
            <span className="event-title-text">{localized('Event')}: </span>
            <span className="event-title">{this.state.event.title}</span>
          </div>
          <div className="event-body">
            <div className="event-date">
              <div className="event-day">
                {moment(this.state.event.start * 1000)
                  .tz(DateUtils.timeZone)
                  .format(localized('dddd, MMMM Do'))}
              </div>
              <div>
                <div className="event-time">
                  {moment(this.state.event.start * 1000)
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
      return <div />;
    }
  }

  _renderEventActions() {
    const me = this.state.event.participantForMe();
    if (!me) {
      return false;
    }

    const actions = [
      ['yes', localized('Accept')],
      ['maybe', localized('Maybe')],
      ['no', localized('Decline')],
    ];

    return (
      <div className="event-actions">
        {actions.mapx(([status, label]) => {
          let classes = 'btn-rsvp ';
          if (me.status === status) {
            classes += status;
          }
          return (
            <div key={status} className={classes} onClick={() => this._rsvp(status)}>
              {label}
            </div>
          );
        })}
      </div>
    );
  }

  _rsvp = status => {
    const me = this.state.event.participantForMe();
    Actions.queueTask(new EventRSVPTask(this.state.event, me.email, status));
  };
}

export default EventHeader;
