import React, {Component, PropTypes} from 'react';
import EventInvite from './event-invite'
import {DraftStore} from 'nylas-exports';
import _ from 'underscore'

export default class EventInviteContainer extends Component {
  static displayName = 'EventInviteContainer';

  static propTypes = {
    draftClientId: PropTypes.string,
    threadId: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {events: []};
    this._session = null;
    this._mounted = false;
    this._unsubscribes = [];
  }

  componentDidMount() {
    this._mounted = true;
    this.handleProps();

    // Add native event listeners to immediately stop
    const node = React.findDOMNode(this.refs.event_invite_container);
    node.addEventListener("mousedown", e => e.stopPropagation());
    node.addEventListener("mouseup", e => e.stopPropagation());
    node.addEventListener("keydown", e => e.stopPropagation());
  }

  componentWillReceiveProps(newProps) {
    this.handleProps(newProps);
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unsubscribes.forEach(s => s());
  }

  handleProps(newProps = null) {
    const props = newProps || this.props;
    DraftStore.sessionForClientId(props.draftClientId).then(session => {
      // Only run if things are still relevant: component is mounted
      // and draftClientIds still match
      const idIsCurrent = newProps ? true : this.props.draftClientId === session.draftClientId;
      if (this._mounted && idIsCurrent) {
        this._session = session;
        const unsub = session.listen( () => { this._onDraftChange(); });
        this._unsubscribes.push(unsub);
        this._onDraftChange();
      }
    });
  }

  _onDraftChange() {
    const draft = this._session.draft();
    const to = draft.to || [];
    const from = draft.from || [];
    const participants = to.concat(from);
    draft.events.forEach(event => event.participants = participants);
    this.setState({events: [].concat(draft.events || [])});
  }

  _onEventChange(change, index) {
    const events = this.state.events;
    const event = events[index].clone();
    _.extend(event, change);
    events.splice(index, 1, event);
    this._session.changes.add({events});  // triggers draft change
  }

  _onEventRemove(index) {
    const events = this.state.events;
    events.splice(index, 1);
    this._session.changes.add({events});  // triggers draft change
  }

  _renderEventEditor(event, index) {
    return (
      <EventInvite event={event}
                   draft={this._session.draft()}
                   onChange={change => this._onEventChange(change, index)}
                   onRemove={() => this._onEventRemove(index)}
                   onParticipantsClick={() => {}} />
    );  // TODO focus the To: field
  }

  render() {
    return (<div className="event-invite-container"
                 ref="event_invite_container">
      {this.state.events.map((evt, i) => this._renderEventEditor(evt, i))}
    </div>)
  }
}

