import {DraftStore, React, Event, DatabaseStore, Calendar} from 'nylas-exports'
import {RetinaImg} from 'nylas-component-kit'

export default class EventInviteButton extends React.Component {
  static displayName = "EventInviteButton";

  static propTypes = {
    draftClientId: React.PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {enabled: false};
    this._session = null;
    this._mounted = false;
    this._unsubscribes = [];
  }

  componentDidMount() {
    this._mounted = true;
    this.handleProps()
  }

  componentWillReceiveProps(newProps) {
    this.handleProps(newProps);
  }

  handleProps(newProps = null) {
    const props = newProps || this.props;
    DraftStore.sessionForClientId(props.draftClientId).then(session => {
      // Only run if things are still relevant: component is mounted
      // and draftClientIds still match
      const idIsCurrent = newProps ? true : this.props.draftClientId === session.draftClientId;
      if (this._mounted && idIsCurrent) {
        this._session = session;
        const unsub = session.listen(this._onDraftChange.bind(this));
        this._unsubscribes.push(unsub);
        this._onDraftChange();
      }
    });
  }

  _onDraftChange() {
    const draft = this._session.draft();
    const events = draft.events;
    this.setState({
      enabled: events && events.length > 0,
      accountId: draft.accountId,
    });
    DatabaseStore.findAll(Calendar, {
      accountId: draft.accountId,
    }).then( (calendars) => {
      if (this._mounted) {
        this.setState({calendars: calendars && calendars.filter(c => !c.readOnly)})
      }
    });
  }

  _onClick() {
    const events = [].concat(this._session.draft().events);
    if (events.length === 0) {  // API can only handle one event invite for now
      events.push(new Event());
      events[0].calendarId = this.state.calendars[0].serverId;
      this._session.changes.add({events});
    }
  }

  render() {
    return (<button className={`btn btn-toolbar ${this.state.enabled ? "btn-enabled" : ""}`}
                   onClick={this._onClick.bind(this)}
                   title="Add an event…">
      <RetinaImg url="nylas://quick-schedule/assets/icon-composer-quickschedule@2x.png"
                 mode={RetinaImg.Mode.ContentIsMask} />
    </button>)
  }
}
