import React, {Component, PropTypes} from 'react';
import {DraftStore, Utils, DateUtils} from 'nylas-exports';
import {RetinaImg} from 'nylas-component-kit'
import _ from 'underscore'
import moment from 'moment'

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
    // TODO what if it gets new props??
    DraftStore.sessionForClientId(this.props.draftClientId).then(session => {
      // Only run if things are still relevant: component is mounted
      // and draftClientIds still match
      if (this._mounted && this.props.draftClientId === session.draftClientId) {
        this._session = session;
        const unsub = session.listen( () => { this._onDraftChange(); });
        this._unsubscribes.push(unsub);
        this._onDraftChange();
      }
    });

    // Add native event listeners to immediately stop
    const node = React.findDOMNode(this.refs.event_invite_container);
    node.addEventListener("mousedown", e => e.stopPropagation());
    node.addEventListener("mouseup", e => e.stopPropagation());
    node.addEventListener("keydown", e => e.stopPropagation());
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unsubscribes.forEach(s => s());
  }

  _onDraftChange() {
    const draft = this._session.draft();
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
    return (<EventInvite event={event}
                         draft={this._session.draft()}
                         onChange={change => this._onEventChange(change, index)}
                         onRemove={() => this._onEventRemove(index)}
                         onParticipantsClick={() => {}} />);  // TODO focus the To: field
  }

  render() {
    return (<div className="event-invite-container"
                 ref="event_invite_container">
      {this.state.events.map((evt, i) => this._renderEventEditor(evt, i))}
    </div>)
  }
}


function getDateFormat(type) {
  switch (type) {
  case "date": return "YYYY-MM-DD";
  case "time": return "HH:mm:ss";
  }
}


class EventInvite extends Component {
  static displayName = 'EventInvite';

  static propTypes = {
    event: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    onParticipantsClick: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      expanded: false,
    };
  }

  _renderIcon(name) {
    return (<span className="field-icon">
      <RetinaImg name={name} mode={RetinaImg.Mode.ContentPreserve} />
    </span>)
  }

  _renderParticipants() {
    const to = this.props.draft.to || [];
    const from = this.props.draft.from || [];
    return to.concat(from).map(r => r.name).join(", ")
  }

  _renderExpanded() {
    let description = this.props.event.description;
    if (description == null) {
      description = this.props.draft.body;
    }

    return (
      <span>
        <div className="row description">
          {this._renderIcon("ic-eventcard-notes@2x.png")}

          <input type="text"
                 name="description"
                 placeholder="Add notes"
                 value={description}
                 onChange={ e => this.props.onChange({description: e.target.value}) }/>
        </div>
        <div className="row link">
          {this._renderIcon("ic-eventcard-link@2x.png")}
          <input type="text"
                 name="description"
                 placeholder="Add links"
                 value={this.props.event.link}
                 onChange={ e => this.props.onChange({link: e.target.value}) }/>
        </div>
        <div className="row reminder">
          {this._renderIcon("ic-eventcard-reminder@2x.png")}

          <input type="text"
                 name="description"
                 placeholder="Add reminders"
                 value={this.props.event.reminders}
                 onChange={ e => this.props.onChange({reminders: e.target.value}) }/>
        </div>
      </span>
)
  }

  _renderCollapsed() {
    return (<div className="row expand" onClick={()=>{this.setState({expanded: true})}}>
      {this._renderIcon("ic-eventcard-disclosure@2x.png")}
      Add reminders, notes, links...
    </div>)
  }

  render() {
    let title = this.props.event.title;
    if (title == null) {
      title = this.props.draft.subject;
    }

    return (<div className="event-invite">
      <div className="remove-button" onClick={()=>this.props.onRemove()}>✕</div>
      <div className="row title">
        {this._renderIcon("ic-eventcard-description@2x.png")}
        <input type="text"
               name="title"
               placeholder="Add an event title"
               value={title}
               onChange={e => this.props.onChange({title: e.target.value}) }/>
      </div>

      <div className="row time">
        {this._renderIcon("ic-eventcard-time@2x.png")}
        <span>
          <EventDatetimeInput name="start"
                              value={this.props.event.start}
                              onChange={ date => this.props.onChange({start: date}) } />
          -
          <EventDatetimeInput name="end"
                              reversed
                              value={this.props.event.end}
                              onChange={ date => this.props.onChange({end: date}) } />
          <span className="timezone">{moment().tz(Utils.timeZone).format("z")}</span>
        </span>
      </div>

      <div className="row recipients">
        {this._renderIcon("ic-eventcard-people@2x.png")}
        <div onClick={this.props.onParticipantsClick()}>{this._renderParticipants()}</div>
      </div>

      <div className="row location">
        {this._renderIcon("ic-eventcard-location@2x.png")}
        <input type="text"
               name="location"
               placeholder="Add a location"
               value={this.props.event.location}
               onChange={e => this.props.onChange({location: e.target.value}) }/>
      </div>

      {this.state.expanded ? this._renderExpanded() : this._renderCollapsed()}
    </div>)
  }
}

class EventDatetimeInput extends Component {
  static displayName = "EventDatetimeInput";

  static propTypes = {
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
    reversed: PropTypes.bool,
    name: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this._datePartStrings = {time: "", date: ""};
  }

  conponentDidMount() {
    const dateInputNode = React.findDOMNode(this.refs.date);
    dateInputNode.addEventListener("mousedown", e => {
      dateInputNode.querySelector("::-webkit-calendar-picker-indicator")
    });
  }

  _onDateChange() {
    const {date, time} = this._datePartStrings;
    const format = `${getDateFormat("date")} ${getDateFormat("time")}`;
    const newDate = moment.tz(`${date} ${time}`, format, Utils.timeZone).unix();
    this.props.onChange(newDate)
  }

  _renderInput(type) {
    const unixDate = this.props.value;
    this._datePartStrings[type] = unixDate != null ? moment.unix(unixDate).tz(Utils.timeZone).format(getDateFormat(type)) : null;
    return (<input type={type}
                   ref={type}
                   name={`${this.props.name}-${type}`}
                   value={this._datePartStrings[type]}
                   onChange={e => {
                     this._datePartStrings[type] = e.target.value;
                     this._onDateChange()
                   }} />)
  }

  render() {
    if (this.props.reversed) {
      return <span className="datetime-input-container">{this._renderInput("time")} on {this._renderInput("date")}</span>;
    }
    return <span className="datetime-input-container">{this._renderInput("date")} at {this._renderInput("time")}</span>;
  }
}